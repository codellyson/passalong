// Projects in the hub's sidebar, and the two small facts every row of the hub shows: a project's
// line colour and how long something has waited.
//
// A project is a top-level folder for now (docs/LOOP.md §0). Each owns one line colour, shown as a
// mark wherever the project appears. Coral is not one of them: in the hub coral means active, so a
// folder someone coloured coral is drawn stone.

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
  /** The repo it is built from; '' for none. */
  repo?: string;
  parent_id: string | null;
  /** The team it belongs to; '' for one of your own. */
  team_slug?: string;
  description?: string;
  updated?: string;
  documents?: number;
  open?: number;
  /** Unread news on its work, or a document someone else saved since you last opened it. */
  changed?: number | boolean;
  /** What changed: the document's name, else the work's title. */
  changed_what?: string;
  /** The last document version saved in it. */
  last_change?: LastChange | null;
}

export interface LastChange {
  name: string;
  by: string;
  at: string;
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
  /** The last document version saved anywhere inside it, or null when none was. */
  last: LastChange | null;
  /** Something in it changed since you last looked, and what: '' when nothing. */
  changed: string;
}

/** The top folders, each counting what is linked into it and every folder beneath it. */
export function projectsFrom(folders: ProjectFolder[]): SidebarProject[] {
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
      last: null,
      changed: "",
    });
  }
  for (const f of folders) {
    const p = out.get(rootOf(f).id);
    if (!p) continue;
    p.open += Number(f.open || 0);
    p.documents += Number(f.documents || 0);
    if ((f.updated || "") > p.updated) p.updated = f.updated || "";
    if (f.last_change && f.last_change.at > (p.last?.at || "")) p.last = f.last_change;
    if (f.changed && !p.changed) p.changed = f.changed_what || "something";
  }
  return [...out.values()].sort((a, b) => a.title.localeCompare(b.title));
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

/** Who did something, said the one way the hub says it: "Bola", or "Bola, an agent". */
export const byLine = (name: string, via?: string) =>
  `${name || "someone"}${via === "agent" ? ", an agent" : ""}`;
