export interface Folder {
  id: string;
  title: string;
  description: string;
  team_id: string;
  team_slug?: string;
  team_name?: string;
  created_by: string;
  manage?: boolean;
  created: string;
  updated: string;
  documents?: number;
  assets?: number;
  guides?: number;
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

export interface FolderGuide {
  id: string;
  title: string;
  kind: string;
  summary: string;
  status: string;
}
