// Projects in the hub's sidebar, and the two small facts every row of the hub shows: a project's
// line colour and how long something has waited.
//
// A project is a top-level folder for now (docs/LOOP.md §0). Each owns one line colour, shown as a
// mark wherever the project appears. Coral is not one of them: in the hub coral means only "changed
// since you last looked", so a folder someone coloured coral is drawn slate.

export const TONES = ["amber", "green", "blue", "violet", "teal", "slate"] as const;
export type Tone = (typeof TONES)[number];

/** The folder's own colour when it has one; otherwise one picked from its id, the same every time. */
export function toneOf(p: { id: string; color?: string | null }): Tone {
  if (p.color === "coral") return "slate";
  if ((TONES as readonly string[]).includes(p.color || "")) return p.color as Tone;
  let h = 0;
  for (const ch of p.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length] as Tone;
}

export interface ProjectFolder {
  id: string;
  title: string;
  color: string;
  parent_id: string | null;
  open?: number;
  changed?: number | boolean;
}

export interface SidebarProject {
  id: string;
  title: string;
  tone: Tone;
  /** Open work linked anywhere inside it. */
  open: number;
  /** Something in it changed since you last looked. */
  changed: boolean;
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
    out.set(f.id, { id: f.id, title: f.title, tone: toneOf(f), open: 0, changed: false });
  }
  for (const f of folders) {
    const p = out.get(rootOf(f).id);
    if (!p) continue;
    p.open += Number(f.open || 0);
    p.changed ||= Boolean(f.changed);
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
