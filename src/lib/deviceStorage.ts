import { supabase, supabaseConfigured } from "./supabase";

export interface WorkspaceDevice {
  device_id: string;
  device_name: string;
  created_at: string;
  last_active_at: string;
}

const DEVICE_ID_KEY = "dropspace-device-id";

function getDeviceIdentity() {
  let deviceId = window.localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }

  const agent = navigator.userAgent;
  const browser = /Edg\//.test(agent) ? "Edge" : /Firefox\//.test(agent) ? "Firefox" : /Chrome\//.test(agent) ? "Chrome" : "Browser";
  const platform = /Windows/.test(agent) ? "Windows" : /Android/.test(agent) ? "Android" : /iPhone|iPad/.test(agent) ? "iOS" : /Mac OS/.test(agent) ? "macOS" : /Linux/.test(agent) ? "Linux" : "device";
  return { deviceId, deviceName: `${browser} on ${platform}` };
}

export async function registerCurrentDevice(userId: string): Promise<{ deviceId: string; deviceName: string }> {
  if (!supabaseConfigured || !supabase) {
    throw new Error("Supabase is required to register synced devices.");
  }

  const identity = getDeviceIdentity();
  const { error } = await supabase.from("workspace_devices").upsert({
    user_id: userId,
    device_id: identity.deviceId,
    device_name: identity.deviceName,
    last_active_at: new Date().toISOString(),
  }, { onConflict: "user_id,device_id" });
  if (error) throw error;
  return identity;
}

export async function listWorkspaceDevices(userId: string): Promise<WorkspaceDevice[]> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("workspace_devices")
    .select("device_id, device_name, created_at, last_active_at")
    .eq("user_id", userId)
    .order("last_active_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function removeOtherDeviceRecords(userId: string, currentDeviceId: string): Promise<void> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase
    .from("workspace_devices")
    .delete()
    .eq("user_id", userId)
    .neq("device_id", currentDeviceId);
  if (error) throw error;
}
