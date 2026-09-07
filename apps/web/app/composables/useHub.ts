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
  /**
   * A 401 after you were already signed in. It is a different event from arriving signed out —
   * the same screen appears either way, and without this it appears with no explanation at all,
   * which reads as the app having forgotten you for no reason.
   */
  const expired = useState("hub:expired", () => false);
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
      expired.value = signedIn.value;
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
      if (res.status === 401) {
        expired.value = signedIn.value;
        throw new Error("signed out");
      }
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
      expired.value = false;
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

  // Nothing in the hub sets a guide's status any more. `consumed` duplicated the verdict and
  // `promoted` was a pull counter with a button, so both left the interface; the endpoint and the
  // CLI's `passalong done` / `passalong promote` are untouched, which is why this is phase one.

  /**
   * Removal is confirmed by the component, in the page. `confirm()` did it before, which meant the
   * only thing standing between a guide and deletion was a dialog the browser is free not to
   * support — and when it does not, the call throws and the button appears to do nothing.
   */
  const onRemove = (g: Guide) => guarded(() => api(`/v1/guides/${g.id}`, { method: "DELETE" }));

  /**
   * The reader's answer to "does this work?", and the only way a sender learns their handoff did
   * not land. A failure must say why.
   *
   * The note used to be collected by `prompt()`, which put the highest-value moment in the product
   * in an unstyled OS dialog that showed no character limit, offered no way back once dismissed,
   * and — on a blank submit — cancelled silently. It is a form on the row now. The cap is still
   * the server's (280), and the shape is still two answers and one note: what makes this not a
   * comment thread is the endpoint, not the widget.
   */
  const onVerdict = (g: Guide, ok: boolean, note = "") => {
    const said = note.trim().slice(0, 280);
    // The server answers a noteless failure with a 400. Not sending it is the same rule, said
    // before the round trip rather than after.
    if (!ok && !said) return;
    return guarded(() => api(`/v1/guides/${g.id}/verdict`, json("PUT", { ok, note: said })));
  };

  const readAll = () => guarded(() => api("/v1/notifications/read", json("POST")));

  async function createTeam(name: string) {
    const named = name.trim();
    if (!named) return;
    try {
      const t = await api<{ slug: string }>("/v1/teams", json("POST", { name: named }));
      if (t) scope.value = t.slug;
      await load();
    } catch (e) {
      error.value = (e as Error).message;
    }
  }

  async function signOut() {
    expired.value = false;
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
    expired,
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
    onRemove,
    onVerdict,
    readAll,
    createTeam,
    signOut,
  };
}
