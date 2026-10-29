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
