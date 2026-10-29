// Projects in the hub's sidebar, and the two small facts every row of the hub shows: a project's
// line colour and how long something has waited.
//
// A project is a top-level folder for now (docs/LOOP.md §0). Each owns one line colour, shown as a
// mark wherever the project appears. Coral is not one of them: in the hub coral means only "changed
// since you last looked", so a folder someone coloured coral is drawn stone.

export const TONES = ["amber", "green", "blue", "violet", "teal", "stone"] as const;
export type Tone = (typeof TONES)[number];

/** A folder's stored colour as a line colour, or "" when it has none. Older folders stored coral. */
export function storedTone(color?: string | null): Tone | "" {
  if (color === "coral") return "stone";
  return (TONES as readonly string[]).includes(color || "") ? (color as Tone) : "";
}

/** The folder's own colour when it has one; otherwise one picked from its id, the same every time. */
export function toneOf(p: { id: string; color?: string | null }): Tone {
  const own = storedTone(p.color);
  if (own) return own;
  let h = 0;
  for (const ch of p.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length] as Tone;
}

export interface ProjectFolder {
  id: string;
  title: string;
  color: string;
  parent_id: string | null;
  description?: string;
  updated?: string;
  documents?: number;
  open?: number;
  changed?: number | boolean;
  /** When someone else last changed a document in it; '' when nobody has. */
  docs_changed?: string;
}

export interface SidebarProject {
  id: string;
  title: string;
  description: string;
  tone: Tone;
  /** Open work linked anywhere inside it. */
  open: number;
  /** Documents anywhere inside it. */
  documents: number;
  /** The latest change anywhere inside it. */
  updated: string;
  /** Something in it changed since you last looked. */
  changed: boolean;
}

/**
 * The top folders, each counting what is linked into it and every folder beneath it. A document
 * someone else changed after `seen(project)` marks it changed, as unread news on its work does.
 */
export function projectsFrom(
  folders: ProjectFolder[],
  seen: (id: string) => string = () => "",
): SidebarProject[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const rootOf = (f: ProjectFolder) => {
    let at = f;
    for (let hops = 0; at.parent_id && byId.has(at.parent_id) && hops < 64; hops++)
      at = byId.get(at.parent_id) as ProjectFolder;
    return at;
  };
  const out = new Map<string, SidebarProject>();
  for (const f of folders) {
    if (f.parent_id && byId.has(f.parent_id)) continue;
    out.set(f.id, {
      id: f.id,
      title: f.title,
      description: f.description || "",
      tone: toneOf(f),
      open: 0,
      documents: 0,
      updated: "",
      changed: false,
    });
  }
  for (const f of folders) {
    const p = out.get(rootOf(f).id);
    if (!p) continue;
    p.open += Number(f.open || 0);
    p.documents += Number(f.documents || 0);
    if ((f.updated || "") > p.updated) p.updated = f.updated || "";
    p.changed ||= Boolean(f.changed) || docsChanged(f.docs_changed, seen(p.id));
  }
  return [...out.values()].sort((a, b) => a.title.localeCompare(b.title));
}

/** A document change counts as news only after the last look; never looked, it is news. */
export const docsChanged = (changedAt: string | undefined, seenAt: string) =>
  Boolean(changedAt) && (!seenAt || (changedAt as string) > seenAt);

// When you last looked at each project, kept in this browser.
// shortcut: per browser, not per account across devices; upgrade to a server-side seen row when
// people read one project on two machines.
const SEEN_KEY = "passalong.projectsSeen";
function seenMap(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}
/** When this browser last showed the project; '' when never, or when storage is unavailable. */
export const seenAt = (id: string): string =>
  typeof localStorage === "undefined" ? "" : seenMap()[id] || "";
/** Remember a look at the project now, and say when the one before it was. */
export function markProjectSeen(id: string, at = new Date().toISOString()): string {
  const map = seenMap();
  const before = map[id] || "";
  map[id] = at;
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(map));
  } catch {
    // Storage refused (a private window): the marks just never clear here.
  }
  return before;
}

/** How long since `iso`, in the one unit that reads at a glance: 12m, 5h, 3d, 6w. */
export function age(iso: string, now = Date.now()): string {
  const ms = Math.max(0, now - Date.parse(iso));
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${Math.max(m, 1)}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 14) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

/** What saved a document, as apps/api/src/project.ts says it: a person, an agent, or unknown (""). */
export const viaOf = (client?: string): "person" | "agent" | "" =>
  client === "hub" ? "person" : client === "mcp" || client?.startsWith("cli@") ? "agent" : "";
