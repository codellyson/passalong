// The hub's state and everything that changes it, on TanStack Query.
//
// It used to be one `load()` that fetched six endpoints with plain `fetch`, all or nothing, and
// every mutation awaited its call and then reloaded all six. Nothing was cached between pages,
// nothing refreshed when you came back to the tab, a failed load emptied the page, and pressing a
// button changed nothing on screen until two round trips later.
//
// Now each endpoint is its own query, built once per app in a detached scope and shared by every
// component that calls `useHub()`. The names components already use — `data`, `load`, `onArchive` and
// the rest — keep their meaning, and `loading` / `updating` say what is still on its way.
import type { QueryClient, QueryKey } from "@tanstack/vue-query";
import { keepPreviousData, useQuery } from "@tanstack/vue-query";
import type {
  ApiToken,
  Board,
  HubData,
  Me,
  Needs,
  Task,
  TeamDetail,
  ThreadItem,
  Work,
  WorkContext,
  Working,
} from "~/types/hub";
import type { ProjectPage, ProjectViewData } from "~/types/project";
import { HttpError, SignedOut } from "~/utils/http";
import {
  ctxFinished,
  ctxFreed,
  ctxMoved,
  ctxNoted,
  ctxTaken,
  dropFromBoard,
  freed,
  givenTo,
  moved,
  patchList,
  taken,
  type Viewer,
} from "~/utils/optimistic";
import type { ApiProject } from "~/utils/projects";

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
  work: (scope: string) => ["work", scope] as const,
  allWork: ["work"] as const,
  board: ["board"] as const,
  notifications: ["notifications"] as const,
  tokens: ["tokens"] as const,
  team: (slug: string) => ["team-detail", slug] as const,
  billing: ["billing"] as const,
  tasks: ["tasks"] as const,
  scopedTasks: (scope: string) => ["tasks", scope] as const,
  working: ["working"] as const,
  scopedWorking: (scope: string) => ["working", scope] as const,
  context: (id: string) => ["work-context", id] as const,
  thread: (id: string) => ["work-thread", id] as const,
  project: (id: string) => ["project", id] as const,
  projectView: (id: string) => ["project-view", id] as const,
  needs: ["needs"] as const,
  projects: ["projects"] as const,
};

type WorkList = { work: Work[] };

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
   * paint than the sign-in card for someone who is about to see their work.
   */
  const maybe = useState("hub:maybe", () =>
    Boolean(import.meta.server && useRequestHeaders(["cookie"]).cookie?.includes(`${COOKIE}=`)),
  );

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
  const workQ = useQuery(
    {
      queryKey: computed(() => hubKeys.work(scope.value)),
      queryFn: ({ queryKey }) =>
        get<WorkList>(`/v1/work?scope=${encodeURIComponent(String(queryKey[1]))}`)(),
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
  // What waits on you, ranked by the server (apps/api/src/needs.ts), and the projects the sidebar
  // lists as projects. Both are read on every hub page: the sidebar counts from them.
  const needsQ = useQuery(
    { queryKey: hubKeys.needs, queryFn: get<Needs>("/v1/needs"), enabled },
    queryClient,
  );
  const projectsQ = useQuery(
    {
      queryKey: hubKeys.projects,
      queryFn: get<{ projects: ApiProject[] }>("/v1/projects"),
      enabled,
    },
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

  // Each work list is scoped before its server-side limit, so switching teams cannot carry rows
  // or counts from another team into the new view.
  const tasksQ = useQuery(
    {
      queryKey: computed(() => hubKeys.scopedTasks(scope.value)),
      queryFn: ({ queryKey }) =>
        get<{ tasks: Task[] }>(`/v1/tasks?scope=${encodeURIComponent(String(queryKey[1]))}`)(),
      enabled,
    },
    queryClient,
  );

  // Who is working on what.
  const workingQ = useQuery(
    {
      queryKey: computed(() => hubKeys.scopedWorking(scope.value)),
      queryFn: ({ queryKey }) =>
        get<{ working: Working[] }>(
          `/v1/working?scope=${encodeURIComponent(String(queryKey[1]))}`,
        )(),
      enabled,
    },
    queryClient,
  );

  const signedIn = computed(() => !ended.value && Boolean(meQ.data.value));

  /**
   * What the work page and a project's page read, defined once so the page, its parts and a
   * prefetch share one cache entry. A page reads its own as soon as loading has started, not after
   * /v1/me answers: waiting for it put a whole round trip in front of every page (2026-11-11).
   */
  const reads = {
    context: (id: string) => ({
      queryKey: hubKeys.context(id),
      queryFn: async () => (await api<WorkContext>(`/v1/work/${id}/context`)) ?? null,
    }),
    thread: (id: string) => ({
      queryKey: hubKeys.thread(id),
      queryFn: async () =>
        (await api<{ thread: ThreadItem[]; mine?: boolean; summary?: string }>(
          `/v1/work/${encodeURIComponent(id)}/thread`,
        )) ?? null,
    }),
    project: (id: string) => ({
      queryKey: hubKeys.project(id),
      queryFn: async () => (await api<ProjectPage>(`/v1/projects/${id}`)) ?? null,
    }),
    projectView: (id: string) => ({
      queryKey: hubKeys.projectView(id),
      queryFn: async () => (await api<ProjectViewData>(`/v1/projects/${id}/project`)) ?? null,
    }),
  };
  /** A prefetch this recent is not asked again: hovering back and forth over a list is one read. */
  const PREFETCH_FRESH_MS = 10_000;
  /**
   * Begin reading the page a hub link goes to, on hover or focus, so it is there by the click. Only
   * the work page and a project's page: the rest read what the shell already holds.
   */
  function prefetch(href: string) {
    if (!enabled.value) return;
    const path = href.replace(/^https?:\/\/[^/]+/, "");
    const work = path.match(/^\/hub\/w\/([^/?#]+)/)?.[1];
    const project = path.match(/^\/hub\/projects\/([^/?#]+)/)?.[1];
    const ask = (q: { queryKey: QueryKey; queryFn: () => Promise<unknown> }) =>
      void queryClient.prefetchQuery({ ...q, staleTime: PREFETCH_FRESH_MS });
    if (work) {
      ask(reads.context(work));
      ask(reads.thread(work));
    } else if (project) {
      ask(reads.project(project));
      ask(reads.projectView(project));
    }
  }

  // A team can remove a member while this tab is open. An old selection then ceases to be a
  // readable scope; return to all work instead of showing an error under an "All teams" label.
  watch([scope, () => meQ.data.value], ([selected, me]) => {
    if (
      me &&
      selected !== "all" &&
      selected !== "mine" &&
      !me.teams.some((t) => t.slug === selected)
    )
      scope.value = "all";
  });

  // Once the first answer about the session is in, stop guessing from the cookie.
  watch(
    () => meQ.status.value,
    (status) => {
      if (status !== "pending") maybe.value = false;
    },
  );

  const data = computed<HubData>(() => ({
    me: signedIn.value ? (meQ.data.value ?? null) : null,
    work: workQ.data.value?.work ?? [],
    board: boardQ.data.value ?? null,
    tokens: tokensQ.data.value?.tokens ?? [],
    team: teamScoped.value ? (teamQ.data.value ?? null) : null,
    tasks: tasksQ.data.value?.tasks ?? [],
    working: workingQ.data.value?.working ?? [],
  }));

  /** What has not arrived yet, per endpoint, so each part of a page can wait on its own data. */
  const loading = computed(() => ({
    me: meQ.isPending.value,
    work: workQ.isPending.value,
    board: boardQ.isPending.value,
    tokens: tokensQ.isPending.value,
    tasks: tasksQ.isPending.value,
    working: workingQ.isPending.value,
  }));

  /** A background refresh of data already on screen: worth a quiet word, never a blank page. */
  const updating = computed(
    () =>
      (workQ.isFetching.value || boardQ.isFetching.value) &&
      !workQ.isPending.value &&
      !boardQ.isPending.value,
  );
  /** The list on screen belongs to the previous team while the new one loads. */
  const scopeChanging = computed(() => workQ.isPlaceholderData.value);

  /** A load that failed after retrying, in the server's words. A signed-out session is not one. */
  const loadError = computed(() => {
    const failed = [meQ, workQ, boardQ, tasksQ, workingQ]
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
    work: workQ.isError.value && !workQ.data.value,
    board: boardQ.isError.value && !boardQ.data.value,
    tasks: tasksQ.isError.value && !tasksQ.data.value,
    working: workingQ.isError.value && !workingQ.data.value,
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

  const patchWork = (id: string, fn: (g: Work) => Work) =>
    queryClient.setQueriesData<WorkList>({ queryKey: hubKeys.allWork }, (old) =>
      old ? { ...old, work: patchList(old.work, id, fn) } : old,
    );
  const patchBoardCache = (fn: (b: Board) => Board) =>
    queryClient.setQueryData<Board>(hubKeys.board, (old) => (old ? fn(old) : old));
  /**
   * One piece of work changed everywhere it is cached: every work list (the board draws from these),
   * the board's buckets, and its own page. `ctx` is what the page needs beyond the work itself.
   */
  const patchOne = (id: string, fn: (g: Work) => Work, ctx?: (c: WorkContext) => WorkContext) => {
    patchWork(id, fn);
    patchBoardCache((b) => ({
      waiting: patchList(b.waiting ?? [], id, fn),
      in_flight: patchList(b.in_flight ?? [], id, fn),
      landed: patchList(b.landed ?? [], id, fn),
    }));
    queryClient.setQueryData<WorkContext>(hubKeys.context(id), (old) =>
      old ? (ctx ? ctx(old) : { ...old, work: fn(old.work) }) : old,
    );
  };
  /** Off your own list of what you hold: finished, passed back, or let go. */
  const dropWorking = (id: string) =>
    queryClient.setQueriesData<{ working: Working[] }>({ queryKey: hubKeys.working }, (old) =>
      old ? { working: old.working.filter((x) => x.id !== id) } : old,
    );
  const viewer = (): Viewer => ({
    account: meQ.data.value?.account || "",
    handle: meQ.data.value?.handle || "",
    name: meQ.data.value?.name || "",
  });
  const stamp = () => new Date().toISOString();

  /**
   * Archive work, or put it back. Archived is shelf space, not a judgement. It still counts toward
   * the free plan's limit (quota.ts COUNTED): only deleting makes room.
   */
  const onArchive = (g: Work, archived: boolean) => {
    // Put back, it goes to Draft and never straight to Ready: archived includes finished, and Ready
    // would hand finished work out again. The server refuses the other way (`unarchiveProblem`).
    const status = archived ? "done" : "draft";
    return change(() => api(`/v1/work/${g.id}/status`, json("PATCH", { status })), () => {
      patchWork(g.id, (x) => moved(x, status, archived ? "archived" : ""));
      if (archived) patchBoardCache((b) => dropFromBoard(b, g.id));
    }, [hubKeys.allWork, hubKeys.board, hubKeys.me]);
  };

  const onRemove = (g: Work) =>
    change(() => api(`/v1/work/${g.id}`, { method: "DELETE" }), () => {
      queryClient.setQueriesData<WorkList>({ queryKey: hubKeys.allWork }, (old) =>
        old ? { ...old, work: old.work.filter((x) => x.id !== g.id) } : old,
      );
      patchBoardCache((b) => dropFromBoard(b, g.id));
    }, [hubKeys.allWork, hubKeys.board, hubKeys.me]);

  /**
   * Ready, Draft and Stop this agent: anyone in the team moves work between them. Each moves the row
   * to the column it will land in before the server answers, the way every other mutation here
   * does, and puts it back if the server refuses.
   */
  const moveTask = (t: Task, state: Task["state"], path: string, init: RequestInit) =>
    change(() => api(path, init), () => {
      queryClient.setQueryData<{ tasks: Task[] }>(hubKeys.scopedTasks(scope.value), (old) =>
        old ? { tasks: old.tasks.map((x) => (x.id === t.id ? { ...x, state } : x)) } : old,
      );
      if (state === "draft" || state === "ready")
        patchOne(
          t.id,
          (g) => moved(g, state),
          (c) => ctxMoved(c, state),
        );
    }, [hubKeys.tasks, hubKeys.working, hubKeys.allWork, hubKeys.board, hubKeys.context(t.id)]);
  /** `target`, when given, is the repo the work is for; left out, it keeps the one it has. */
  const onTaskReady = (t: Task, target?: string) =>
    moveTask(
      t,
      "ready",
      `/v1/work/${t.id}/status`,
      json("PATCH", target === undefined ? { status: "ready" } : { status: "ready", target }),
    );
  const onTaskDraft = (t: Task) =>
    moveTask(t, "draft", `/v1/work/${t.id}/status`, json("PATCH", { status: "draft" }));
  const personTaskChange = (
    id: string,
    path: string,
    body: unknown = {},
    optimistic: () => void = () => {},
  ) =>
    change(
      () =>
        api(
          `/v1/tasks/${encodeURIComponent(id)}/${path}`,
          json(path === "person-progress" ? "PUT" : "POST", body),
        ),
      optimistic,
      [hubKeys.tasks, hubKeys.working, hubKeys.allWork, hubKeys.board, hubKeys.context(id)],
    );
  /** I'll do this: in progress and yours at once. */
  const onPersonTaskTake = (id: string) =>
    personTaskChange(id, "person-take", {}, () => {
      const me = viewer();
      const at = stamp();
      patchOne(
        id,
        (g) => taken(g, me, at),
        (c) => ctxTaken(c, me, at),
      );
    });
  /** Done, finished, by a person, with what was done if they say (claims.finish on the server). */
  const onFinish = (id: string, note: string) =>
    change(() => api(`/v1/work/${encodeURIComponent(id)}/finish`, json("POST", { note })), () => {
      const me = viewer();
      const at = stamp();
      patchOne(
        id,
        (g) => ({ ...moved(g, "done", "finished"), held_by: [] }),
        (c) => ctxFinished(c, me, note, at),
      );
      dropWorking(id);
    }, [hubKeys.working, hubKeys.allWork, hubKeys.board, hubKeys.tasks, hubKeys.context(id)]);
  /** Finished work back to Ready, with why at its top; whoever finished it is told. */
  const onReopen = (id: string, why: string) =>
    change(() => api(`/v1/work/${encodeURIComponent(id)}/reopen`, json("POST", { why })), () => {
      patchOne(
        id,
        (g) => moved(g, "ready"),
        (c) => ctxMoved(c, "ready"),
      );
    }, [hubKeys.allWork, hubKeys.board, hubKeys.tasks, hubKeys.context(id)]);
  /**
   * Not for me, with the reason: it goes back to whoever sent it, who is told why. The person's own
   * agent name, as the hub takes things under (`personAgent()` on the server).
   */
  const onPass = (id: string, why: string) => {
    const account = (meQ.data.value?.account || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
    return change(() =>
      api(
        `/v1/work/${encodeURIComponent(id)}/pass`,
        json("POST", { agent: `person-${account}`, why }),
      ), () => {
      patchOne(id, freed, ctxFreed);
      dropWorking(id);
    }, [hubKeys.allWork, hubKeys.board, hubKeys.working, hubKeys.context(id)]);
  };
  const onPersonTaskProgress = (id: string, note: string) =>
    personTaskChange(id, "person-progress", { note }, () =>
      queryClient.setQueryData<WorkContext>(hubKeys.context(id), (old) =>
        old ? ctxNoted(old, note, stamp()) : old,
      ),
    );
  /** Handing in your own hold finishes it (claims.complete): Done, with what you said. */
  const onPersonTaskHandIn = (id: string, body: unknown) =>
    personTaskChange(id, "person-hand_in", body, () => {
      const me = viewer();
      const said = (body as { note?: unknown })?.note;
      const note = typeof said === "string" ? said : "";
      const at = stamp();
      patchOne(
        id,
        (g) => ({ ...moved(g, "done", "finished"), held_by: [] }),
        (c) => ctxFinished(c, me, note, at),
      );
      dropWorking(id);
    });
  /** Take work back from whoever holds it: Stop this agent. */
  const onTakeBack = (w: Working) =>
    change(() => api(`/v1/work/${w.id}/release`, json("POST")), () => {
      dropWorking(w.id);
      patchOne(w.id, freed, ctxFreed);
    }, [hubKeys.working, hubKeys.tasks, hubKeys.allWork, hubKeys.board, hubKeys.context(w.id)]);

  /** Make work you sent private again ("Make it private again"): gone from the inboxes it was in. */
  const onRecall = (g: Work) =>
    change(() => api(`/v1/work/${g.id}/recall`, json("POST")), () => {
      patchOne(g.id, (x) => ({ ...x, team: "", to: null, to_group: "", lanes: [] }));
    }, [hubKeys.allWork, hubKeys.board, hubKeys.working]);

  /**
   * Give something you wrote to someone else in its team: "@handle", "#group", or "" for everyone.
   * Who it is for changes at once. Which group of Ready it falls under is the server's to work out,
   * except that the board passes `lane`, the group it was dropped on, so the card moves there now;
   * the refetch that follows has the last word.
   */
  const onAssign = (id: string, to: string, lane?: string) =>
    change(() => api(`/v1/work/${id}/assign`, json("POST", { to })), () => {
      patchOne(id, (g) => givenTo(g, to, lane));
    }, [hubKeys.context(id), hubKeys.tasks, hubKeys.allWork, hubKeys.board, hubKeys.working]);

  /**
   * The bulk bar's acts, on several pieces of work: give to someone ("@handle", "#group", "" for
   * everyone), move to Draft or Ready, or archive. Each is the same route the single act uses, sent
   * four at a time; then the lists reload once. No optimistic patching: the board's columns are
   * the server's to decide. A refusal does not stop the rest; it is counted and said, with the
   * first reason. Answers how many went through.
   */
  async function onBulk(
    ids: string[],
    act: { give: string } | { status: "draft" | "ready" | "done" },
  ): Promise<number> {
    error.value = null;
    const call = (id: string) =>
      "give" in act
        ? api(`/v1/work/${id}/assign`, json("POST", { to: act.give }))
        : api(`/v1/work/${id}/status`, json("PATCH", { status: act.status }));
    const failed: string[] = [];
    for (let i = 0; i < ids.length; i += 4) {
      const batch = await Promise.allSettled(ids.slice(i, i + 4).map(call));
      for (const r of batch)
        if (r.status === "rejected" && !(r.reason instanceof SignedOut))
          failed.push((r.reason as Error).message);
    }
    await refresh(hubKeys.allWork, hubKeys.board, hubKeys.me, hubKeys.tasks, hubKeys.working);
    if (failed.length)
      error.value = `${failed.length} of ${ids.length} did not go through: ${failed[0]}`;
    return ids.length - failed.length;
  }

  /**
   * Write to whoever holds a piece of work: an answer to a question, or something thought of since. Not
   * optimistic — the server decides who may write and whether anyone is holding it, and a message
   * that appears and then vanishes is worse than one that takes a moment. Refetches what shows the
   * waiting state, so a question you just answered leaves "Asking you".
   */
  const onReply = async (id: string, body: string) => {
    await api(`/v1/work/${encodeURIComponent(id)}/reply`, json("POST", { body }));
    await refresh(hubKeys.tasks, hubKeys.working);
  };

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

  /**
   * Opening a piece of work is looking at it: what changed on it stops showing as changed. Nothing
   * is patched by hand; the lists that show the mark are refetched.
   */
  async function markSeen(work: string) {
    const r = await api<{ read: number }>("/v1/notifications/read", json("POST", { work })).catch(
      () => null,
    );
    if (r?.read)
      await refresh(hubKeys.needs, hubKeys.projects, hubKeys.notifications, hubKeys.allWork);
  }

  return {
    token,
    signedIn,
    ready: enabled,
    reads,
    prefetch,
    needsQ,
    projectsQ,
    markSeen,
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
    adoptToken,
    setToken,
    setMe,
    api,
    json,
    start,
    load,
    refresh,
    onArchive,
    onRemove,
    onTaskReady,
    onTaskDraft,
    onPersonTaskTake,
    onReopen,
    onFinish,
    onPass,
    onPersonTaskProgress,
    onPersonTaskHandIn,
    onAssign,
    onBulk,
    onRecall,
    onReply,
    onTakeBack,
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
