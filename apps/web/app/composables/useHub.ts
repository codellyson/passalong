// The hub's state and everything that mutates it — what `App()` in apps/api/public/hub.js held in
// closures. It is a composable rather than props threaded through eight components because the
// same `api` and `reload` were being handed down three levels; the state itself is unchanged.
import type { Guide, HubData, Me } from "~/types/hub";

const KEY = "passalong.token";

const EMPTY: HubData = {
  me: null,
  guides: [],
  board: null,
  activity: [],
  unread: 0,
  tokens: [],
  team: null,
};

/** localStorage, but a browser with storage blocked must still be able to use the page. */
const store = {
  get(): string | null {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  set(t: string | null) {
    try {
      t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY);
    } catch {}
  },
};

export function useHub() {
  const token = useState<string | null>("hub:token", () => null);
  const signedIn = useState("hub:signedIn", () => false);
  const data = useState<HubData>("hub:data", () => ({ ...EMPTY }));
  const scope = useState("hub:scope", () => "all");
  const error = useState<string | null>("hub:error", () => null);
  const editing = useState("hub:editing", () => false);

  /**
   * `passalong hub` opens /hub#token=… so the token never hits the server or a log line; the page
   * moves it into storage and scrubs the URL before anything else happens.
   */
  function adoptToken() {
    const fromHash = new URLSearchParams(location.hash.slice(1)).get("token");
    if (fromHash) {
      store.set(fromHash);
      history.replaceState(null, "", location.pathname);
    }
    token.value = store.get();
  }

  function setToken(t: string | null) {
    store.set(t);
    token.value = t;
  }

  /**
   * Two ways to be signed in: a pasted token (CLI users) or the session cookie set by logging in.
   * The cookie rides along on its own, so the header only appears when a token is actually held.
   */
  async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T | null> {
    const headers: Record<string, string> = {
      ...((init.headers as Record<string, string>) || {}),
    };
    if (token.value) headers.authorization = `Bearer ${token.value}`;
    const res = await fetch(path, { ...init, headers });
    if (res.status === 401) {
      setToken(null);
      signedIn.value = false;
      throw new Error("signed out");
    }
    if (!res.ok) {
      const failed = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(failed.message || res.statusText);
    }
    return res.status === 204 ? null : ((await res.json()) as T);
  }

  /** JSON body, since almost every call here sends one. */
  const json = (method: string, body: unknown = {}): RequestInit => ({
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  async function load(opts: { dropToken?: boolean } = {}) {
    const t = opts.dropToken ? null : token.value;
    if (opts.dropToken) setToken(null);

    const call = async <T>(path: string): Promise<T> => {
      const headers: Record<string, string> = t ? { authorization: `Bearer ${t}` } : {};
      const res = await fetch(path, { headers });
      if (res.status === 401) throw new Error("signed out");
      if (!res.ok) {
        const failed = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(failed.message || res.statusText);
      }
      return res.json() as Promise<T>;
    };

    error.value = null;
    try {
      const [me, list, board, activity, tokens] = await Promise.all([
        call<HubData["me"]>("/v1/me"),
        call<{ guides: Guide[] }>(`/v1/guides?scope=${encodeURIComponent(scope.value)}`),
        call<HubData["board"]>("/v1/board"),
        call<{ notifications: HubData["activity"]; unread: number }>("/v1/notifications?limit=30"),
        call<{ tokens: HubData["tokens"] }>("/v1/tokens"),
      ]);
      const team =
        scope.value !== "all" && scope.value !== "mine"
          ? await call<HubData["team"]>(`/v1/teams/${encodeURIComponent(scope.value)}`)
          : null;
      data.value = {
        me,
        guides: list.guides,
        board,
        activity: activity.notifications,
        unread: activity.unread,
        tokens: tokens.tokens,
        team,
      };
      signedIn.value = true;
    } catch (e) {
      // Not being signed in is a state, not an error to shout about.
      signedIn.value = false;
      data.value = { ...EMPTY };
      const message = (e as Error).message;
      error.value = message === "signed out" ? null : message;
    }
  }

  /** Anything that can fail on the way to a reload reports rather than throwing into the void. */
  async function guarded(work: () => Promise<unknown>) {
    try {
      await work();
      await load();
    } catch (e) {
      error.value = (e as Error).message;
    }
  }

  // Both of these move a guide between queues, so reload rather than patch state by hand: the
  // board's buckets are defined in SQL, and guessing them here is how the two drift apart.
  const onStatus = (g: Guide, next: string) =>
    guarded(() => api(`/v1/guides/${g.id}/status`, json("PATCH", { status: next })));

  const onRemove = (g: Guide) => {
    if (!confirm(`Remove "${g.title}" from sync? Local copies are untouched.`)) return;
    return guarded(() => api(`/v1/guides/${g.id}`, { method: "DELETE" }));
  };

  /**
   * The reader's answer to "does this work?". A failure must say why — the prompt is the whole
   * interface, because a text box here would be the first step toward a comment thread.
   */
  const onVerdict = (g: Guide, ok: boolean) => {
    let note = "";
    if (!ok) {
      note = (prompt(`What went wrong with "${g.title}"?`) || "").trim();
      if (!note) return;
    }
    return guarded(() => api(`/v1/guides/${g.id}/verdict`, json("PUT", { ok, note })));
  };

  const readAll = () => guarded(() => api("/v1/notifications/read", json("POST")));

  async function createTeam() {
    const name = prompt("Name your team");
    if (!name?.trim()) return;
    try {
      const t = await api<{ slug: string }>("/v1/teams", json("POST", { name: name.trim() }));
      if (t) scope.value = t.slug;
    } catch (e) {
      error.value = (e as Error).message;
    }
  }

  async function signOut() {
    // End the session server-side too, otherwise "sign out" only forgets locally.
    await fetch("/v1/auth/logout", { method: "POST" }).catch(() => {});
    setToken(null);
    signedIn.value = false;
    data.value = { ...EMPTY };
  }

  const setMe = (me: Me) => {
    data.value = { ...data.value, me };
  };

  return {
    token,
    signedIn,
    data,
    scope,
    error,
    editing,
    adoptToken,
    setToken,
    setMe,
    api,
    json,
    load,
    onStatus,
    onRemove,
    onVerdict,
    readAll,
    createTeam,
    signOut,
  };
}
