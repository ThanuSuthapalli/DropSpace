import { workspaceDb } from "./storage";
import { supabase, supabaseAnonKey, supabaseConfigured, supabaseUrl } from "./supabase";

export const RESOURCE_BUCKET = "dropspace-resources";

export async function saveResourceFile(
  file: File,
  path: string,
  onProgress: (progress: number) => void,
): Promise<void> {
  if (!supabaseConfigured) {
    await workspaceDb.files.put({
      id: path,
      blob: file,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
    });
    onProgress(100);
    return;
  }

  if (!supabase || !supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase file storage is not configured.");
  }
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session) throw new Error("Sign in before uploading files.");

  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${supabaseUrl}/storage/v1/object/${RESOURCE_BUCKET}/${encodedPath}`);
    request.setRequestHeader("apikey", supabaseAnonKey);
    request.setRequestHeader("Authorization", `Bearer ${data.session.access_token}`);
    request.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    request.setRequestHeader("x-upsert", "true");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        resolve();
        return;
      }

      let message = request.statusText || "File upload failed.";
      try {
        const response = JSON.parse(request.responseText) as { message?: string; error?: string };
        message = response.message || response.error || message;
      } catch {
        if (request.responseText) message = request.responseText;
      }
      reject(new Error(message));
    };
    request.onerror = () => reject(new Error("Network error while uploading the file."));
    request.onabort = () => reject(new Error("File upload was cancelled."));
    request.send(file);
  });
}

export async function getResourceFileUrl(path: string): Promise<{ url: string; revoke: boolean }> {
  if (supabaseConfigured) {
    if (!supabase) throw new Error("Supabase file storage is not configured.");
    const { data, error } = await supabase.storage
      .from(RESOURCE_BUCKET)
      .createSignedUrl(path, 60);
    if (error) throw error;
    return { url: data.signedUrl, revoke: false };
  }

  const storedFile = await workspaceDb.files.get(path);
  if (!storedFile) throw new Error("The file is missing from this device.");
  return { url: URL.createObjectURL(storedFile.blob), revoke: true };
}

export async function deleteResourceFile(path: string): Promise<void> {
  if (supabaseConfigured) {
    if (!supabase) throw new Error("Supabase file storage is not configured.");
    const { error } = await supabase.storage.from(RESOURCE_BUCKET).remove([path]);
    if (error) throw error;
    return;
  }
  await workspaceDb.files.delete(path);
}
