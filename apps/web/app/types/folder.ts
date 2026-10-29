export interface Folder {
  id: string;
  title: string;
  description: string;
  parent_id: string;
  color: string;
  team_id: string;
  team_slug?: string;
  team_name?: string;
  created_by: string;
  manage?: boolean | number;
  /** The folder's share link, or empty when it is not shared. Only on a single folder's read. */
  share_url?: string;
  created: string;
  updated: string;
  documents?: number;
  assets?: number;
  guides?: number;
  /** Only on a folder's children, where a grouping folder shows what each holds. */
  subfolders?: number;
}

export interface FolderDocument {
  id: string;
  name: string;
  body: string;
  version: number;
  updated_by: string;
  /** Who last saved it, by name or @handle. Only on a folder's read. */
  editor?: string;
  /** What saved it last: "hub" is a person, anything else an agent, "" from before it was kept. */
  client?: string;
  /** "version 3 by Bola" when someone else saved it since you last opened it; "" otherwise. */
  changed?: string;
  created: string;
  updated: string;
}

export interface FolderAsset {
  id: string;
  name: string;
  type: string;
  bytes: number;
  created: string;
}

/** Work linked into a folder. The route keeps the old name, `guides`. */
export interface FolderGuide {
  id: string;
  title: string;
  summary: string;
  status: string;
  /** The label its agent gave it; the first is shown. */
  tags: string[];
}

/** A project's work as a register row (apps/api/src/project.ts). */
export interface ProjectWork {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  stage: "draft" | "todo" | "working" | "done";
  health: "" | "asking" | "quiet" | "working";
  with: string;
  since: string;
  outcome: string;
  /** What changed since you last looked, in words; "" when nothing. */
  changed: string;
}

/** One line of a project's history: work finished, or a document version saved. */
export interface ProjectHistoryItem {
  kind: "finished" | "document";
  at: string;
  by: string;
  via: "agent" | "person" | "";
  /** What changed since you last looked, in words; "" when nothing. */
  changed: string;
  id: string;
  title: string;
  folder: string;
  version: number;
  note: string;
  shots: number;
  checks: number;
}
