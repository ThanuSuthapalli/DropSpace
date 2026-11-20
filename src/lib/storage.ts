import Dexie, { type Table } from "dexie";
import { defaultWorkspace } from "../data/defaultData";
import { supabase, supabaseConfigured } from "./supabase";
import type { Resource, WorkspaceState } from "../types";

const STORAGE_KEY = "dropspace-workspace-v2";
const STARTER_RESOURCE_IDS = new Set([
  "r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9", "r10", "r11", "r12",
]);
const STARTER_PROJECTS = new Set(["Research", "Development", "Inspiration"]);
const emptyWorkspace = (): WorkspaceState => ({ projects: [], items: [] });

class WorkspaceDb extends Dexie {
  items!: Table<Resource, string>;
  projects!: Table<{ id: string; name: string }, string>;
  files!: Table<{ id: string; blob: Blob; fileName: string; contentType: string }, string>;

  constructor() {
    super("DropSpaceDB");
    this.version(1).stores({
      items: "id, project, createdAt, starred, archived, deleted",
      projects: "id, name",
    });
    this.version(2).stores({
      items: "id, project, createdAt, starred, archived, deleted",
      projects: "id, name",
      files: "id, fileName",
    });
  }
}

export const workspaceDb = new WorkspaceDb();

const isRecordArray = (value: unknown): value is Resource[] => Array.isArray(value);

const normalizeWorkspace = (value: unknown): WorkspaceState => {
  if (!value || typeof value !== "object") {
    return emptyWorkspace();
  }

  const candidate = value as Partial<WorkspaceState>;
  const savedProjects = Array.isArray(candidate.projects)
    ? candidate.projects.filter((p): p is string => typeof p === "string")
    : [];

  const savedItems = isRecordArray(candidate.items)
    ? candidate.items.filter((item): item is Resource => Boolean(item && typeof item === "object"))
    : [];
  const containsStarterResources = savedItems.some((item) => STARTER_RESOURCE_IDS.has(item.id));
  const items = savedItems
    .filter((item) => !STARTER_RESOURCE_IDS.has(item.id))
    .map((item) => ({
        ...item,
        type: item.type || "Link",
        title: item.title || "Untitled item",
        description: item.description || "",
        project: item.project || savedProjects[0] || "Inbox",
        createdAt: item.createdAt || Date.now(),
        starred: Boolean(item.starred),
        archived: Boolean(item.archived),
        deleted: Boolean(item.deleted),
      }));

  const projects = savedProjects.filter((name) =>
    !(containsStarterResources && STARTER_PROJECTS.has(name) && !items.some((item) => item.project === name)),
  );
  for (const item of items) {
    if (!projects.includes(item.project)) projects.push(item.project);
  }

  return { projects, items };
};

const readLocalStorageWorkspace = (): WorkspaceState => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return emptyWorkspace();
    }
    return normalizeWorkspace(JSON.parse(raw));
  } catch {
    return emptyWorkspace();
  }
};

const readChromeWorkspace = async (): Promise<WorkspaceState | null> => {
  const chromeApi = (globalThis as typeof globalThis & { chrome?: { storage?: { local?: { get: (keys: string | string[], callback?: (items: Record<string, unknown>) => void) => Promise<Record<string, unknown>> | Record<string, unknown> } } } }).chrome;

  if (!chromeApi?.storage?.local) {
    return null;
  }

  try {
    const result = await chromeApi.storage.local.get([STORAGE_KEY, "drops"]);
    const direct = result?.[STORAGE_KEY];
    const legacy = result?.drops;

    if (direct && typeof direct === "object") {
      return normalizeWorkspace(direct);
    }

    if (Array.isArray(legacy)) {
      return normalizeWorkspace({ projects: [...defaultWorkspace.projects], items: legacy as Resource[] });
    }
  } catch {
    return null;
  }

  return null;
};

export const workspaceStorage = {
  async load(userId?: string): Promise<WorkspaceState> {
    if (supabaseConfigured) {
      if (!userId || !supabase) {
        throw new Error("Sign in to load your Supabase workspace.");
      }

      const { data, error } = await supabase
        .from("workspaces")
        .select("data")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data ? normalizeWorkspace(data.data) : emptyWorkspace();
    }

    try {
      const chromeWorkspace = await readChromeWorkspace();
      if (chromeWorkspace) {
        return chromeWorkspace;
      }
    } catch {
      // fall through to browser-local storage
    }

    return readLocalStorageWorkspace();
  },

  async save(workspace: WorkspaceState, userId?: string): Promise<void> {
    const normalized = normalizeWorkspace(workspace);

    if (supabaseConfigured) {
      if (!userId || !supabase) {
        throw new Error("Sign in to save your Supabase workspace.");
      }

      const { error } = await supabase.from("workspaces").upsert({
        user_id: userId,
        data: normalized,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (error) throw error;
      return;
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Ignore quota issues in the browser and keep the app responsive.
    }

    try {
      await workspaceDb.transaction("rw", workspaceDb.items, async () => {
        await workspaceDb.items.clear();
        await workspaceDb.items.bulkPut(normalized.items);
        await workspaceDb.projects.clear();
        await workspaceDb.projects.bulkPut(normalized.projects.map((name) => ({ id: name, name })));
      });
    } catch {
      // Dexie is optional; the app should keep functioning without it.
    }

    const chromeApi = (globalThis as typeof globalThis & { chrome?: { storage?: { local?: { set: (value: Record<string, unknown>) => Promise<void> } } } }).chrome;
    if (chromeApi?.storage?.local) {
      try {
        await chromeApi.storage.local.set({ [STORAGE_KEY]: normalized, drops: normalized.items });
      } catch {
        // Chrome storage is optional in the web app.
      }
    }
  },

  parseImport(raw: string): WorkspaceState {
    const parsed = JSON.parse(raw);
    return normalizeWorkspace(parsed);
  },
};
