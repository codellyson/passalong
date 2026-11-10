// The half-set rule (apps/api/src/config.ts) before a deploy, part of `deploy:check`.
//
// The vars are in wrangler.jsonc; the secrets live on the Worker, and `wrangler secret list` gives
// their names only, which is all the rule needs. Without a Cloudflare login (CI's checks job, a
// fresh machine) the secrets cannot be seen, and judging the vars alone would call every pair with
// a secret half set — so it says so and passes, and /health after the deploy is the check.
import { execFileSync } from "node:child_process";
import { unstable_readConfig } from "wrangler";
import { halfSet } from "../../api/src/config.ts";

const env = { ...unstable_readConfig({ config: "wrangler.jsonc" }).vars };
let secrets;
try {
  // Piped, so wrangler sees no terminal and never opens a browser to log in.
  const out = execFileSync("npx", ["wrangler", "secret", "list", "--format", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60_000,
  });
  secrets = JSON.parse(out.slice(out.indexOf("[")));
} catch {
  console.log("config check: cannot list the Worker's secrets (no Cloudflare login); skipped.");
  process.exit(0);
}
// A secret's value is never read: present is all the rule asks, except the reader's provider name.
// shortcut: a secret READER_PROVIDER is taken as one needing no READER_URL, so a misspelt provider
// or openai-compatible without its URL is caught by /health, not here.
for (const s of secrets) env[s.name] = s.name === "READER_PROVIDER" ? "anthropic" : "set";

const half = halfSet(env);
if (half.length) {
  console.error(
    `config check: half set: ${half.join(", ")}. See "Settings that come in groups" in docs/DEPLOY.md.`,
  );
  process.exit(1);
}
console.log("config check: no settings half set.");
