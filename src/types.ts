export type ResourceType = "Link" | "Note" | "Image" | "File";
export type ResourceEntryKind = "link" | "note";
export type View = "Home" | "Inbox" | "Recent" | "Starred" | "Archive" | "Trash" | "Profile" | "Project";

export interface ResourceEntry {
  id: string;
  kind: ResourceEntryKind;
  value: string;
  createdAt: number;
}

export interface Resource {
  id: string;
  type: ResourceType;
  title: string;
  url?: string;
  description: string;
  content?: string;
  project: string;
  createdAt: number;
  starred: boolean;
  archived: boolean;
  deleted?: boolean;
  fileName?: string;
  fileSize?: number;
  contentType?: string;
  storagePath?: string;
  entries?: ResourceEntry[];
}

export interface WorkspaceState {
  projects: string[];
  items: Resource[];
}
