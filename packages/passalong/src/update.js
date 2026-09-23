// Telling somebody their CLI is old, without ever making them wait to be told.
//
// The server can ship a new version of itself in an afternoon; an installed CLI changes only when
// a person types `npm i -g passalong`. Nothing told them to, so a machine could sit on a build from
// months ago and simply not have the tools everyone was talking about — and because the API keeps
// answering old clients on purpose (an absent `fence` is accepted, an absent `cmd` is accepted),
// nothing broke loudly enough to notice either.
//
// The registry is asked, not passalong.dev. What "the latest passalong" is, is a fact about npm,
// and a server that answered it would be a second copy of that fact to keep in step.
//
// **Nothing here waits on the network.** The first attempt at this awaited the fetch after the
// command finished, on a 1.5s timeout, and measuring it killed the design: the registry answered in
// six to ten seconds from an ordinary connection, so every check timed out, cached nothing, and the
// feature would have shipped dead while looking fine in review. So the line is read from a file and
// the file is refreshed by a process nobody waits for. What a person sees is a day old at worst,
// which is the right age for "there is a new version".
import { readConfig, writeConfig } from "./store.js";

/** How long a cached answer lasts before a refresh is worth starting. */
export const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;

/**
 * How long after a failed check before trying again. A refresh that could not reach the registry
 * must not blind the check for a whole day — that is one bad minute costing a day of notices — and
 * must not retry on every command either, which is what the whole-day gap is there to prevent.
 */
export const RETRY_AFTER_MS = 60 * 60 * 1000;

/** Nobody is waiting, so this can be patient. It is generous because the registry is slow. */
const TIMEOUT_MS = 15_000;

const REGISTRY = "https://registry.npmjs.org/passalong/latest";

/**
 * Is `latest` past `current`? Compares the numeric parts and nothing else.
 *
 * A prerelease (`1.2.0-rc.1`) is read as its release: it only matters that the numbers moved, and
 * nobody is being told to install a tag that `latest` does not point at anyway.
 */
export function isNewer(latest, current) {
  const parts = (v) =>
    String(v ?? "")
      .split("-")[0]
      .split(".")
      .map((n) => Number.parseInt(n, 10));
  const a = parts(latest);
  const b = parts(current);
  if (a.length !== 3 || b.length !== 3 || [...a, ...b].some(Number.isNaN)) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}

/** The one line somebody sees, or "" when there is nothing to say. */
export function noticeFor(latest, current) {
  if (!isNewer(latest, current)) return "";
  return `passalong ${latest} is out (you have ${current}) — npm i -g passalong`;
}

/**
 * What to print and whether a refresh is due, from the file alone. No network, no waiting.
 *
 * `PASSALONG_NO_UPDATE_CHECK=1` turns the whole thing off, for a machine that should not be
 * talking to the registry at all — an air-gapped box, or a CI runner where the line is noise.
 */
export function cachedNotice({
  current,
  now = Date.now(),
  env = process.env,
  config = readConfig,
}) {
  if (env.PASSALONG_NO_UPDATE_CHECK === "1") return { notice: "", stale: false };
  const held = config();
  const checked = Number(held.update_checked) || 0;
  const failed = !held.update_latest;
  const wait = failed ? RETRY_AFTER_MS : CHECK_EVERY_MS;
  return {
    notice: noticeFor(held.update_latest || "", current),
    stale: now - checked >= wait,
  };
}

/**
 * Ask the registry and write the answer down. Run by a process nobody is waiting for.
 *
 * A failure still records the attempt, so the retry gap applies to it rather than every command
 * trying again — `cachedNotice` reads an empty `update_latest` as a failure and uses the shorter
 * gap.
 */
export async function refresh({ now = Date.now(), fetchImpl = fetch, save = writeConfig } = {}) {
  let latest = "";
  try {
    const res = await fetchImpl(REGISTRY, {
      // Plain JSON. The abbreviated `application/vnd.npm.install-v1+json` type is for the whole
      // packument at `/passalong`; on `/passalong/latest` the registry answers 406, which is how
      // the first version of this managed to fail every single time.
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) {
      const body = await res.json();
      if (typeof body?.version === "string") latest = body.version;
    }
  } catch {
    // Offline, blocked, rate-limited, nonsense JSON: the attempt is recorded and nothing is said.
  }
  try {
    save({ update_checked: now, update_latest: latest });
  } catch {
    // A config that cannot be written means the next command tries again, which is harmless.
  }
  return latest;
}
