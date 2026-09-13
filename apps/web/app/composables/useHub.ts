// The hub's state and everything that changes it, on TanStack Query.
//
// It used to be one `load()` that fetched six endpoints with plain `fetch`, all or nothing, and
// every mutation awaited its call and then reloaded all six. Nothing was cached between pages,
// nothing refreshed when you came back to the tab, a failed load emptied the page, and pressing a
// button changed nothing on screen until two round trips later.
//
// Now each endpoint is its own query, built once per app in a detached scope and shared by every
// component that calls `useHub()`. The names components already use — `data`, `load`, `onAck` and
// the rest — keep their meaning, and `loading` / `updating` say what is still on its way.
import type { QueryClient, QueryKey } from "@tanstack/vue-query";
import { keepPreviousData, useQuery } from "@tanstack/vue-query";
import type { ApiToken, Board, Guide, HubData, LogEntry, Me, Note, TeamDetail } from "~/types/hub";
import { HttpError, SignedOut } from "~/utils/http";
import {
  dropFromBoard,
  patchBoard,
  patchList,
  withAck,
  withStatus,
  withVerdict,
} from "~/utils/optimistic";

const KEY = "passalong.token";
/** The session cookie's name, as apps/api sets it. Only its presence is ever read here. */
const COOKIE = "pa_session";

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

/** Query keys in one place, so an invalidation and the query it means cannot drift apart. */
export const hubKeys = {
  me: ["me"] as const,
  guides: (scope: string) => ["guides", scope] as const,
  allGuides: ["guides"] as const,
  board: ["board"] as const,
  notifications: ["notifications"] as const,
  log: ["log"] as const,
  tokens: ["tokens"] as const,
  team: (slug: string) => ["team-detail", slug] as const,
  billing: ["billing"] as const,
};

type GuideList = { guides: Guide[] };
type Notes = { notifications: Note[]; unread: number };

function build(queryClient: QueryClient) {
  const token = useState<string | null>("hub:token", () => null);
  /** Set once the client has adopted its credential. Nothing is fetched before that, or on SSR. */
  const started = useState("hub:started", () => false);
  /** A 401 arrived. Queries stop until someone signs in again, so a dead session does not loop. */
  const ended = useState("hub:ended", () => false);
  const scope = useState("hub:scope", () => "all");
  /** A mutation's refusal, in the server's words. Loads report through `loadError`. */
  const error = useState<string | null>("hub:error", () => null);
  /**
   * A 401 after you were already signed in. It is a different event from arriving signed out —
   * the same screen appears either way, and without this it appears with no explanation at all.
   */
  const expired = useState("hub:expired", () => false);
  /**
   * The server's guess that you are signed in: a session cookie arrived with the request. It is
   * HttpOnly, so invisible to script and visible to the server. Not proof, but a far better first
   * paint than the sign-in card for someone who is about to see their guides.
   */
  const maybe = useState("hub:maybe", () =>
    Boolean(import.meta.server && useRequestHeaders(["cookie"]).cookie?.includes(`${COOKIE}=`)),
  );
  const editing = useState("hub:editing", () => false);

  function setToken(t: string | null) {
    store.set(t);
    token.value = t;
  }

  function endSession() {
    if (ended.value) return;
    expired.value = Boolean(queryClient.getQueryData(hubKeys.me));
    setToken(null);
    ended.value = true;
    maybe.value = false;
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
      endSession();
      throw new SignedOut();
    }
    if (!res.ok) {
      const failed = (await res.json().catch(() => ({}))) as { message?: string };
      throw new HttpError(failed.message || "That didn't work. Try again in a moment.", res.status);
    }
    return res.status === 204 ? null : ((await res.json()) as T);
  }

  /** JSON body, since almost every call here sends one. */
  const json = (method: string, body: unknown = {}): RequestInit => ({
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const get =
    <T>(path: string) =>
    async () =>
      (await api<T>(path)) as T;

  const enabled = computed(() => import.meta.client && started.value && !ended.value);
  const teamScoped = computed(() => scope.value !== "all" && scope.value !== "mine");

  const meQ = useQuery({ queryKey: hubKeys.me, queryFn: get<Me>("/v1/me"), enabled }, queryClient);
  const guidesQ = useQuery(
    {
      queryKey: computed(() => hubKeys.guides(scope.value)),
      queryFn: ({ queryKey }) =>
        get<GuideList>(`/v1/guides?scope=${encodeURIComponent(String(queryKey[1]))}`)(),
      enabled,
      // Switching team keeps the last list on screen, dimmed, instead of blanking the page.
      placeholderData: keepPreviousData,
    },
    queryClient,
  );
  const boardQ = useQuery(
    { queryKey: hubKeys.board, queryFn: get<Board>("/v1/board"), enabled },
    queryClient,
  );
  const notesQ = useQuery(
    {
      queryKey: hubKeys.notifications,
      queryFn: get<Notes>("/v1/notifications?limit=30"),
      enabled,
    },
    queryClient,
  );
  // The log is a window, not everything — /hub/log says so.
  const logQ = useQuery(
    { queryKey: hubKeys.log, queryFn: get<{ log: LogEntry[] }>("/v1/log?limit=200"), enabled },
    queryClient,
  );
  const tokensQ = useQuery(
    { queryKey: hubKeys.tokens, queryFn: get<{ tokens: ApiToken[] }>("/v1/tokens"), enabled },
    queryClient,
  );
  const teamQ = useQuery(
    {
      queryKey: computed(() => hubKeys.team(scope.value)),
      queryFn: ({ queryKey }) =>
        get<TeamDetail>(`/v1/teams/${encodeURIComponent(String(queryKey[1]))}`)(),
      enabled: computed(() => enabled.value && teamScoped.value),
    },
    queryClient,
  );

  const signedIn = computed(() => !ended.value && Boolean(meQ.data.value));

  // Once the first answer about the session is in, stop guessing from the cookie.
  watch(
    () => meQ.status.value,
    (status) => {
      if (status !== "pending") maybe.value = false;
    },
  );

  const data = computed<HubData>(() => ({
    me: signedIn.value ? (meQ.data.value ?? null) : null,
    guides: guidesQ.data.value?.guides ?? [],
    board: boardQ.data.value ?? null,
    activity: notesQ.data.value?.notifications ?? [],
    unread: notesQ.data.value?.unread ?? 0,
    log: logQ.data.value?.log ?? [],
    tokens: tokensQ.data.value?.tokens ?? [],
    team: teamScoped.value ? (teamQ.data.value ?? null) : null,
  }));

  /** What has not arrived yet, per endpoint, so each part of a page can wait on its own data. */
  const loading = computed(() => ({
    me: meQ.isPending.value,
    guides: guidesQ.isPending.value,
    board: boardQ.isPending.value,
    notifications: notesQ.isPending.value,
    log: logQ.isPending.value,
    tokens: tokensQ.isPending.value,
  }));

  /** A background refresh of data already on screen: worth a quiet word, never a blank page. */
  const updating = computed(
    () =>
      (guidesQ.isFetching.value || boardQ.isFetching.value) &&
      !guidesQ.isPending.value &&
      !boardQ.isPending.value,
  );
  /** The list on screen belongs to the previous team while the new one loads. */
  const scopeChanging = computed(() => guidesQ.isPlaceholderData.value);

  /** A load that failed after retrying, in the server's words. A signed-out session is not one. */
  const loadError = computed(() => {
    const failed = [meQ, guidesQ, boardQ]
      .map((q) => q.error.value)
      .find((e) => e && !(e instanceof SignedOut));
    return failed ? (failed as Error).message : null;
  });

  /**
   * The session check itself failed, after retrying, for a reason other than a 401. The server did
   * not answer; nobody was signed out. The shell shows the error with Try again rather than the
   * sign-in card or a skeleton that would never fill.
   */
  const meFailed = computed(() => {
    const e = meQ.error.value;
    return Boolean(e && !(e instanceof SignedOut) && !meQ.isFetching.value);
  });

  /** `passalong hub` opens /hub#token=… so the token never hits the server or a log line. */
  function adoptToken() {
    const fromHash = new URLSearchParams(location.hash.slice(1)).get("token");
    if (fromHash) {
      store.set(fromHash);
      history.replaceState(null, "", location.pathname);
    }
    token.value = store.get();
  }

  /**
   * Which lists gave up after retrying with nothing to show. An empty list and a list that failed
   * to load are different facts, and a page must not print "Nothing is waiting on you" for the
   * second one.
   */
  const failed = computed(() => ({
    guides: guidesQ.isError.value && !guidesQ.data.value,
    board: boardQ.isError.value && !boardQ.data.value,
    log: logQ.isError.value && !logQ.data.value,
    tokens: tokensQ.isError.value && !tokensQ.data.value,
  }));

  /**
   * Begin loading, once. Every hub page's shell calls this on mount; after the first, the queries
   * are already running and cached, and refetching them on each navigation would restart every
   * retry and hide a failing server behind a skeleton.
   */
  function start() {
    started.value = true;
  }

  /** Refresh everything: Try again, or after signing in. */
  async function load(opts: { dropToken?: boolean } = {}) {
    if (opts.dropToken) setToken(null);
    error.value = null;
    started.value = true;
    if (ended.value) {
      ended.value = false;
      await queryClient.resetQueries();
      return;
    }
    await queryClient.invalidateQueries();
  }

  /** Refresh just these, after a change that only touches them. */
  const refresh = (...keys: QueryKey[]) =>
    Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));

  /**
   * Apply a change to the cache now, send it, and put things back if the server refuses.
   * Whatever happens, the touched queries are refetched so the screen ends on the server's truth.
   */
  async function change(
    work: () => Promise<unknown>,
    optimistic: () => void,
    touched: QueryKey[],
  ): Promise<boolean> {
    await Promise.all(touched.map((queryKey) => queryClient.cancelQueries({ queryKey })));
    const snapshot = touched.flatMap((queryKey) => queryClient.getQueriesData({ queryKey }));
    error.value = null;
    optimistic();
    try {
      await work();
      return true;
    } catch (e) {
      for (const [key, value] of snapshot) queryClient.setQueryData(key, value);
      if (!(e instanceof SignedOut)) error.value = (e as Error).message;
      return false;
    } finally {
      void refresh(...touched);
    }
  }

  const patchGuides = (id: string, fn: (g: Guide) => Guide) =>
    queryClient.setQueriesData<GuideList>({ queryKey: hubKeys.allGuides }, (old) =>
      old ? { ...old, guides: patchList(old.guides, id, fn) } : old,
    );
  const patchBoardCache = (fn: (b: Board) => Board) =>
    queryClient.setQueryData<Board>(hubKeys.board, (old) => (old ? fn(old) : old));

  const ANSWERED: QueryKey[] = [
    hubKeys.allGuides,
    hubKeys.board,
    hubKeys.notifications,
    hubKeys.log,
  ];

  /**
   * Archive a guide, or put it back. Archived is shelf space, not a judgement — and shelf space is
   * what the free plan counts, so this is how to make room without deleting anything.
   */
  const onArchive = (g: Guide, archived: boolean) =>
    change(() =>
      api(
        `/v1/guides/${g.id}/status`,
        json("PATCH", { status: archived ? "consumed" : "published" }),
      ), () => {
      patchGuides(g.id, (x) => withStatus(x, archived ? "consumed" : "published"));
      if (archived) patchBoardCache((b) => dropFromBoard(b, g.id));
    }, [hubKeys.allGuides, hubKeys.board, hubKeys.me]);

  const onRemove = (g: Guide) =>
    change(() => api(`/v1/guides/${g.id}`, { method: "DELETE" }), () => {
      queryClient.setQueriesData<GuideList>({ queryKey: hubKeys.allGuides }, (old) =>
        old ? { ...old, guides: old.guides.filter((x) => x.id !== g.id) } : old,
      );
      patchBoardCache((b) => dropFromBoard(b, g.id));
    }, [hubKeys.allGuides, hubKeys.board, hubKeys.me]);

  /**
   * The reader's first word back, before any work: taking it, or handing it back with a reason.
   * Passing needs the reason for the same cause a failing verdict does.
   */
  const onAck = (g: Guide, taken: boolean, note = "") =>
    change(
      () => api(`/v1/guides/${g.id}/ack`, json("PUT", { taken, note })),
      () => {
        const at = new Date().toISOString();
        patchGuides(g.id, (x) => withAck(x, taken, note, at));
        patchBoardCache((b) =>
          taken ? patchBoard(b, g.id, (x) => withAck(x, taken, note, at)) : dropFromBoard(b, g.id),
        );
      },
      ANSWERED,
    );

  /**
   * The reader's answer to "does this work?", and the only way a sender learns their handoff did
   * not land. A failure must say why; the cap is the server's (280).
   */
  const onVerdict = (g: Guide, ok: boolean, note = "") => {
    const said = note.trim().slice(0, 280);
    // The server answers a noteless failure with a 400. Not sending it is the same rule, said
    // before the round trip rather than after.
    if (!ok && !said) return Promise.resolve(false);
    const me = meQ.data.value;
    return change(
      () => api(`/v1/guides/${g.id}/verdict`, json("PUT", { ok, note: said })),
      () => {
        const byName = me?.display || me?.name || (me?.handle ? `@${me.handle}` : "");
        patchGuides(g.id, (x) => withVerdict(x, ok, said, me?.handle ?? null, byName));
        patchBoardCache((b) => dropFromBoard(b, g.id));
      },
      ANSWERED,
    );
  };

  const readAll = () =>
    change(
      () => api("/v1/notifications/read", json("POST")),
      () =>
        queryClient.setQueryData<Notes>(hubKeys.notifications, (old) =>
          old
            ? { unread: 0, notifications: old.notifications.map((n) => ({ ...n, read: true })) }
            : old,
        ),
      [hubKeys.notifications],
    );

  async function createTeam(name: string) {
    const named = name.trim();
    if (!named) return;
    try {
      const t = await api<{ slug: string }>("/v1/teams", json("POST", { name: named }));
      await refresh(hubKeys.me);
      if (t) scope.value = t.slug;
    } catch (e) {
      if (!(e instanceof SignedOut)) error.value = (e as Error).message;
    }
  }

  async function signOut() {
    expired.value = false;
    // End the session server-side too, otherwise "sign out" only forgets locally.
    await fetch("/v1/auth/logout", { method: "POST" }).catch(() => {});
    setToken(null);
    ended.value = true;
    maybe.value = false;
    queryClient.clear();
  }

  const setMe = (me: Me) => {
    queryClient.setQueryData(hubKeys.me, me);
  };

  return {
    token,
    signedIn,
    maybe,
    expired,
    data,
    loading,
    updating,
    scopeChanging,
    loadError,
    meFailed,
    failed,
    scope,
    error,
    editing,
    adoptToken,
    setToken,
    setMe,
    api,
    json,
    start,
    load,
    refresh,
    onAck,
    onArchive,
    onRemove,
    onVerdict,
    readAll,
    createTeam,
    signOut,
  };
}

/** One hub per app instance: every component shares the same queries rather than making its own. */
const hubs = new WeakMap<object, ReturnType<typeof build>>();

export function useHub() {
  const nuxtApp = useNuxtApp();
  let hub = hubs.get(nuxtApp);
  if (!hub) {
    const queryClient = nuxtApp.$queryClient as QueryClient;
    hub = effectScope(true).run(() => build(queryClient)) as ReturnType<typeof build>;
    hubs.set(nuxtApp, hub);
  }
  return hub;
}
