import { useRef, useState, type DragEvent } from "react";
import { File as FileIcon, FileImage, Link2, Plus, Upload, X } from "lucide-react";
import type { Resource } from "./types";
import { saveResourceFile } from "./lib/fileStorage";
import "./upload-dialog.css";

type UploadItem = {
  id: string;
  resourceId: string;
  file: File;
  progress: number;
  status: "ready" | "uploading" | "done" | "error" | "invalid";
  error?: string;
};

const MAX_FILE_SIZE = 50 * 1024 * 1024;

type Props = {
  initialFiles: File[];
  projects: string[];
  initialProject: string;
  userId?: string;
  onClose: () => void;
  onComplete: (resources: Resource[], newProject?: string) => void;
  notify: (message: string) => void;
};

const uid = () => crypto.randomUUID?.() ?? String(Date.now() + Math.random());

export default function UploadDialog({
  initialFiles,
  projects,
  initialProject,
  userId,
  onClose,
  onComplete,
  notify,
}: Props) {
  const [tab, setTab] = useState<"files" | "link">("files");
  const [files, setFiles] = useState<UploadItem[]>(() =>
    initialFiles.map((file) => ({
      id: uid(),
      resourceId: uid(),
      file,
      progress: 0,
      status: file.size > MAX_FILE_SIZE ? "invalid" : "ready",
      error: file.size > MAX_FILE_SIZE ? "File exceeds the 50 MB limit." : undefined,
    })),
  );
  const [urlValue, setUrlValue] = useState("");
  const [links, setLinks] = useState<Array<{ id: string; url: string }>>([]);
  const [projectMode, setProjectMode] = useState<"new" | "existing">("existing");
  const [newProject, setNewProject] = useState("");
  const [existingProject, setExistingProject] = useState(
    projects.includes(initialProject) ? initialProject : projects[0] || "",
  );
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function appendFiles(selected: FileList | File[]) {
    const incoming = Array.from(selected);
    if (incoming.length) {
      setFiles((current) => [
        ...current,
        ...incoming.map((file) => ({
          id: uid(),
          resourceId: uid(),
          file,
          progress: 0,
          status: file.size > MAX_FILE_SIZE ? "invalid" as const : "ready" as const,
          error: file.size > MAX_FILE_SIZE ? "File exceeds the 50 MB limit." : undefined,
        })),
      ]);
    }
  }

  function addLink() {
    const value = urlValue.trim();
    try {
      const parsed = new URL(value);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
      setLinks((current) => [...current, { id: uid(), url: parsed.href }]);
      setUrlValue("");
    } catch {
      notify("Enter a valid http(s) URL.");
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    appendFiles(event.dataTransfer.files);
  }

  async function submit() {
    if (uploading) return;
    const targetProject = projectMode === "new" ? newProject.trim() : existingProject;
    if (!targetProject) {
      notify(projectMode === "new" ? "Enter a name for the new space." : "Choose a space first.");
      return;
    }
    if (projectMode === "new" && projects.includes(targetProject)) {
      notify("That space already exists. Choose it from the existing spaces.");
      return;
    }

    const pending = files.filter((item) => item.status !== "done" && item.status !== "invalid");
    if (!pending.length && !links.length) {
      notify("Add files or a direct link before uploading.");
      return;
    }

    setUploading(true);
    const added: Resource[] = links.map(({ url }) => {
      const id = uid();
      const parsed = new URL(url);
      return {
        id,
        type: "Link",
        title: parsed.hostname,
        url,
        description: url,
        project: targetProject,
        createdAt: Date.now(),
        starred: false,
        archived: false,
      };
    });
    setLinks([]);

    let failed = files.some((item) => item.status === "invalid");
    for (const item of pending) {
      setFiles((current) => current.map((entry) =>
        entry.id === item.id ? { ...entry, status: "uploading", progress: 0, error: undefined } : entry,
      ));
      const resourceId = item.resourceId;
      const path = `${userId || "local"}/${resourceId}/${item.file.name}`;
      try {
        await saveResourceFile(item.file, path, (progress) => {
          setFiles((current) => current.map((entry) =>
            entry.id === item.id ? { ...entry, progress } : entry,
          ));
        });
        const isImage = item.file.type.startsWith("image/");
        added.push({
          id: resourceId,
          type: isImage ? "Image" : "File",
          title: item.file.name,
          description: `${item.file.type || "File"} · ${(item.file.size / 1024).toFixed(1)} KB`,
          project: targetProject,
          createdAt: Date.now(),
          starred: false,
          archived: false,
          fileName: item.file.name,
          fileSize: item.file.size,
          contentType: item.file.type || "application/octet-stream",
          storagePath: path,
        });
        setFiles((current) => current.map((entry) =>
          entry.id === item.id ? { ...entry, status: "done", progress: 100 } : entry,
        ));
      } catch (error) {
        failed = true;
        const message = error instanceof Error ? error.message : "Upload failed.";
        setFiles((current) => current.map((entry) =>
          entry.id === item.id ? { ...entry, status: "error", error: message } : entry,
        ));
      }
    }

    if (added.length) {
      onComplete(added, projectMode === "new" ? targetProject : undefined);
      if (projectMode === "new") {
        setProjectMode("existing");
        setExistingProject(targetProject);
        setNewProject("");
      }
    }
    setUploading(false);
    if (failed) {
      notify("Some files could not be uploaded. Review the errors and retry.");
      return;
    }
    notify(`Added ${added.length} resource${added.length === 1 ? "" : "s"}.`);
    onClose();
  }

  const totalCount = files.length + links.length;
  const retryableCount = files.filter((item) => item.status === "ready" || item.status === "error").length;
  return (
    <div className="modal-backdrop upload-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !uploading) onClose();
    }}>
      <section className="upload-modal" role="dialog" aria-modal="true" aria-labelledby="upload-title">
        <header className="upload-header">
          <div>
            <h2 id="upload-title">Add resources</h2>
            <p>Save files and links to your workspace.</p>
          </div>
          <button className="icon-button" onClick={onClose} disabled={uploading} aria-label="Close upload dialog"><X size={17}/></button>
        </header>

        <div className="upload-tabs" role="tablist">
          <button className={tab === "files" ? "active" : ""} onClick={() => setTab("files")} role="tab" aria-selected={tab === "files"}>
            <Upload size={14}/> Local files
          </button>
          <button className={tab === "link" ? "active" : ""} onClick={() => setTab("link")} role="tab" aria-selected={tab === "link"}>
            <Link2 size={14}/> Direct link
          </button>
        </div>

        {tab === "files" ? (
          <div
            className={`upload-dropzone ${dragOver ? "is-dragover" : ""}`}
            onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOver(false);
            }}
            onDrop={onDrop}
          >
            <div className="upload-illustration"><FileImage size={22}/><FileIcon size={18}/></div>
            <strong>Drag and drop files to upload</strong>
            <span>Files stay private in your workspace.</span>
            <button type="button" className="secondary-button" onClick={() => inputRef.current?.click()} disabled={uploading}>
              Select files
            </button>
            <input ref={inputRef} type="file" multiple hidden onChange={(event) => {
              if (event.target.files) appendFiles(event.target.files);
              event.target.value = "";
            }}/>
          </div>
        ) : (
          <form className="direct-link-form" onSubmit={(event) => { event.preventDefault(); addLink(); }}>
            <label className="form-label" htmlFor="direct-resource-link">LINK URL</label>
            <div className="direct-link-row">
              <input
                id="direct-resource-link"
                className="form-input"
                value={urlValue}
                onChange={(event) => setUrlValue(event.target.value)}
                placeholder="https://example.com/resource"
                type="url"
              />
              <button type="submit" className="secondary-button"><Plus size={14}/> Add</button>
            </div>
            <p>Paste a public web link to save it to your workspace.</p>
          </form>
        )}

        {(files.length > 0 || links.length > 0) && (
          <div className="upload-queue" aria-live="polite">
            {files.map((item) => (
              <div className="upload-queue-item" key={item.id}>
                <span className="upload-file-icon">{item.file.type.startsWith("image/") ? <FileImage size={16}/> : <FileIcon size={16}/>}</span>
                <div className="upload-file-info">
                  <div className="upload-file-title">{item.file.name}</div>
                  <div className="upload-file-meta">
                    {item.status === "error" || item.status === "invalid" ? item.error : item.status === "uploading" ? `Uploading · ${item.progress}%` : item.status === "done" ? "Uploaded" : `${(item.file.size / (1024 * 1024)).toFixed(1)} MB`}
                  </div>
                  {item.status !== "ready" && item.status !== "error" && (
                    <div className="upload-progress"><span style={{ width: `${item.progress}%` }}/></div>
                  )}
                  {(item.status === "error" || item.status === "invalid") && <div className="upload-progress upload-progress-error"><span/></div>}
                </div>
                {item.status !== "uploading" && <button className="bare-icon" type="button" onClick={() => setFiles((current) => current.filter((entry) => entry.id !== item.id))} disabled={uploading} aria-label={`Remove ${item.file.name}`}><X size={15}/></button>}
              </div>
            ))}
            {links.map(({ id, url }) => (
              <div className="upload-queue-item" key={id}>
                <span className="upload-file-icon"><Link2 size={16}/></span>
                <div className="upload-file-info"><div className="upload-file-title">{new URL(url).hostname}</div><div className="upload-file-meta">{url}</div></div>
                <button className="bare-icon" type="button" onClick={() => setLinks((current) => current.filter((link) => link.id !== id))} aria-label="Remove link"><X size={15}/></button>
              </div>
            ))}
          </div>
        )}

        <div className="upload-projects">
          <label className={`upload-project-option ${projectMode === "new" ? "selected" : ""}`}>
            <input type="radio" name="upload-project-mode" checked={projectMode === "new"} onChange={() => setProjectMode("new")}/>
            <span className="upload-project-heading">Create a new space</span>
            {projectMode === "new"
              ? <input className="form-input" value={newProject} onChange={(event) => setNewProject(event.target.value)} placeholder="New space name" aria-label="New space name"/>
              : <span className="upload-project-hint">Add a dedicated space</span>}
          </label>
          <label className={`upload-project-option ${projectMode === "existing" ? "selected" : ""}`}>
            <input type="radio" name="upload-project-mode" checked={projectMode === "existing"} onChange={() => setProjectMode("existing")}/>
            <span className="upload-project-heading">Add to existing space</span>
            <select className="form-input" value={existingProject} onChange={(event) => setExistingProject(event.target.value)} disabled={projectMode !== "existing" || !projects.length} aria-label="Choose a space">
              {projects.length ? projects.map((project) => <option key={project} value={project}>{project}</option>) : <option value="">No spaces available</option>}
            </select>
          </label>
        </div>

        <footer className="upload-footer">
          <span>{totalCount ? `${totalCount} item${totalCount === 1 ? "" : "s"} in queue` : "Nothing selected yet"}</span>
          <div>
            <button className="secondary-button" onClick={onClose} disabled={uploading}>Cancel</button>
            <button className="primary-button" onClick={() => void submit()} disabled={uploading || (retryableCount === 0 && links.length === 0)}>
              {uploading ? "Uploading..." : files.some((item) => item.status === "error") ? "Retry upload" : "Save resources"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
