import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive, ArrowDownToLine, ArrowUpRight, Check, Clock3, Download, File, FileImage,
  FolderPlus, HardDrive, HelpCircle, House, Inbox, LayoutGrid, Link2, List, LogOut, Plus, UserRound,
  RotateCcw, Search, Settings, Star, StickyNote, Trash2, Upload, X
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import AuthScreen from "./AuthScreen";
import ProfilePage from "./ProfilePage";
import UploadDialog from "./UploadDialog";
import { defaultWorkspace } from "./data/defaultData";
import { listWorkspaceDevices, registerCurrentDevice, removeOtherDeviceRecords, type WorkspaceDevice } from "./lib/deviceStorage";
import { deleteResourceFile, getResourceFileUrl } from "./lib/fileStorage";
import { supabase, supabaseConfigured } from "./lib/supabase";
import { workspaceStorage } from "./lib/storage";
import type { Resource, ResourceEntry, ResourceType, View } from "./types";

const uid = () => crypto.randomUUID?.() ?? String(Date.now() + Math.random());
const dateLabel = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const dateTimeLabel = (t: number) => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const iconFor = (type: ResourceType) => type === "Link" ? <Link2 /> : type === "Note" ? <StickyNote /> : type === "Image" ? <FileImage /> : <File />;
const createEntry = (kind: "link" | "note", value: string): ResourceEntry => ({ id: uid(), kind, value: value.trim(), createdAt: Date.now() });
type PwaInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isPwaInstallPrompt(event: Event): event is PwaInstallPrompt {
  return "prompt" in event && typeof event.prompt === "function" && "userChoice" in event;
}

export default function App() {
  const [items, setItems] = useState<Resource[]>(defaultWorkspace.items);
  const [projects, setProjects] = useState<string[]>(defaultWorkspace.projects);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!supabaseConfigured);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [workspaceUserId, setWorkspaceUserId] = useState<string | null>(null);
  const [startupError, setStartupError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [deviceRecords, setDeviceRecords] = useState<WorkspaceDevice[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [devicesError, setDevicesError] = useState("");
  const [deviceRefresh, setDeviceRefresh] = useState(0);

  useEffect(() => {
    if (!supabase) return;

    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) setSession(nextSession);
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setStartupError(error.message);
      setSession(data.session);
      setAuthReady(true);
    }).catch((error: unknown) => {
      if (!active) return;
      setStartupError(error instanceof Error ? error.message : "Could not restore your sign-in session.");
      setAuthReady(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (supabaseConfigured || !authReady) return;

    let active = true;
    void workspaceStorage.load().then((workspace) => {
      if (!active) return;
      setItems(workspace.items);
      setProjects(workspace.projects);
      setWorkspaceUserId(null);
      setWorkspaceReady(true);
    }).catch((error: unknown) => {
      if (!active) return;
      setStartupError(error instanceof Error ? error.message : "Could not load the local workspace.");
      setWorkspaceReady(true);
    });

    return () => { active = false; };
  }, [authReady]);

  useEffect(() => {
    if (!supabaseConfigured || !authReady) return;
    if (!session) {
      setWorkspaceReady(false);
      setWorkspaceUserId(null);
      return;
    }

    let active = true;
    setWorkspaceReady(false);
    setStartupError("");
    void workspaceStorage.load(session.user.id).then((workspace) => {
      if (!active) return;
      setItems(workspace.items);
      setProjects(workspace.projects);
      setWorkspaceUserId(session.user.id);
      setWorkspaceReady(true);
    }).catch((error: unknown) => {
      if (!active) return;
      setStartupError(error instanceof Error ? error.message : "Could not load your cloud workspace.");
    });

    return () => { active = false; };
  }, [authReady, session?.user.id, loadAttempt]);

  useEffect(() => {
    if (!workspaceReady || (supabaseConfigured && !session) || typeof chrome === "undefined" || !chrome.storage?.onChanged) return;

    const pendingKey = "dropspace-pending";
    let active = true;
    const consume = (value: unknown) => {
      if (!active || !Array.isArray(value)) return;
      const pending = value.filter((item): item is Resource =>
        Boolean(item && typeof item === "object" && "id" in item && "project" in item && "type" in item),
      );
      if (!pending.length) return;
      setItems((current) => {
        const existingIds = new Set(current.map((item) => item.id));
        return [...pending.filter((item) => !existingIds.has(item.id)), ...current];
      });
      setProjects((current) => [...new Set([...current, ...pending.map((item) => item.project)])]);
      void chrome.storage.local.set({ [pendingKey]: [] }).catch((error: unknown) => {
        setToast(error instanceof Error ? `Could not clear captured items: ${error.message}` : "Could not clear captured items.");
      });
    };
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName === "local" && changes[pendingKey]) consume(changes[pendingKey].newValue);
    };

    chrome.storage.onChanged.addListener(listener);
    void chrome.storage.local.get(pendingKey).then((stored) => consume(stored[pendingKey])).catch((error: unknown) => {
      if (active) setToast(error instanceof Error ? `Could not read captured items: ${error.message}` : "Could not read captured items.");
    });
    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(listener);
    };
  }, [session?.user.id, workspaceReady]);

  useEffect(() => {
    if (!supabaseConfigured || !session || !workspaceReady) {
      setDeviceRecords([]);
      setCurrentDeviceId(null);
      setDevicesLoading(false);
      setDevicesError("");
      return;
    }

    let active = true;
    const userId = session.user.id;
    setDevicesLoading(true);
    setDevicesError("");

    async function refreshDevices(showLoading: boolean) {
      if (showLoading) setDevicesLoading(true);
      try {
        const identity = await registerCurrentDevice(userId);
        if (!active) return;
        setCurrentDeviceId(identity.deviceId);
        const registered = await listWorkspaceDevices(userId);
        if (active) {
          setDeviceRecords(registered);
          setDevicesError("");
        }
      } catch (error) {
        if (active) setDevicesError(error instanceof Error ? error.message : "Could not load registered devices.");
      } finally {
        if (active && showLoading) setDevicesLoading(false);
      }
    }

    void refreshDevices(true);
    const interval = window.setInterval(() => { void refreshDevices(false); }, 5 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [deviceRefresh, session?.user.id, workspaceReady]);
  const [view,setView] = useState<View>("Home");
  const [project,setProject] = useState("All");
  const [filter,setFilter] = useState("All");
  const [query,setQuery] = useState("");
  const [sort,setSort] = useState("new");
  const [compact,setCompact] = useState(false);
  const [selected,setSelected] = useState<string|null>(null);
  const [modal,setModal] = useState<"drop"|"upload"|"project"|"settings"|"help"|null>(null);
  const [uploadFiles,setUploadFiles] = useState<File[]>([]);
  const [dropType,setDropType] = useState<ResourceType>("Link");
  const [formTitle,setFormTitle] = useState("");
  const [formContent,setFormContent] = useState("");
  const [formProject,setFormProject] = useState("Research");
  const [createSpaceInDrop,setCreateSpaceInDrop] = useState(false);
  const [newDropSpaceName,setNewDropSpaceName] = useState("");
  const [entryDrafts,setEntryDrafts] = useState<ResourceEntry[]>([]);
  const [draftKind,setDraftKind] = useState<"link"|"note">("link");
  const [draftValue,setDraftValue] = useState("");
  const [detailEntryKind,setDetailEntryKind] = useState<"link"|"note">("link");
  const [detailEntryValue,setDetailEntryValue] = useState("");
  const [editingEntryId,setEditingEntryId] = useState<string | null>(null);
  const [entryEditValue,setEntryEditValue] = useState("");
  const [dragEntryId,setDragEntryId] = useState<string | null>(null);
  const [toast,setToast] = useState("");
  const [dark,setDark] = useState(false);
  const fileRef=useRef<HTMLInputElement>(null);
  const searchRef=useRef<HTMLInputElement>(null);
  const [dragOver,setDragOver]=useState(false);

  useEffect(() => {
    if (!workspaceReady || (supabaseConfigured && (!session || workspaceUserId !== session.user.id))) return;
    void workspaceStorage.save({ projects, items }, supabaseConfigured ? session?.user.id : undefined)
      .catch((error: unknown) => {
        setToast(error instanceof Error ? `Save failed: ${error.message}` : "Could not save your workspace.");
      });
  }, [items, projects, session?.user.id, workspaceReady, workspaceUserId]);
  useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();searchRef.current?.focus();}if(e.key==="Escape")setModal(null);if(e.key.toLowerCase()==="n"&&!["INPUT","TEXTAREA"].includes((document.activeElement as HTMLElement)?.tagName))openDrop("Link");};window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);},[]);
  const activeItems=items.filter(x=>!x.deleted);
  const visible=useMemo(()=>{
    let list=items.filter(x=>view==="Trash"?x.deleted:view==="Archive"?x.archived:!x.deleted&&!x.archived);
    if(view==="Recent")list=list.filter(x=>Date.now()-x.createdAt<7*86400000);
    if(view==="Starred")list=list.filter(x=>x.starred);
    if(view==="Project")list=list.filter(x=>x.project===project);
    if(filter!=="All")list=list.filter(x=>x.type===filter);
    if(query.trim()){const q=query.toLowerCase();list=list.filter(x=>[x.title,x.description,x.content,x.url,x.project].join(" ").toLowerCase().includes(q));}
    return [...list].sort((a,b)=>sort==="old"?a.createdAt-b.createdAt:sort==="az"?a.title.localeCompare(b.title):b.createdAt-a.createdAt);
  },[items,view,project,filter,query,sort]);
  const current=items.find(x=>x.id===selected);
  const notify=(s:string)=>{setToast(s);window.setTimeout(()=>setToast(""),2200);};
  async function downloadFile(resource:Resource){
    if(!resource.storagePath){notify("This resource has no uploaded file.");return;}
    try{
      const {url}=await getResourceFileUrl(resource.storagePath);
      const response=await fetch(url);
      if(!response.ok)throw new Error(`File request returned ${response.status}.`);
      const blobUrl=URL.createObjectURL(await response.blob());
      const anchor=document.createElement("a");
      anchor.href=blobUrl;
      anchor.download=resource.fileName||resource.title;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(()=>URL.revokeObjectURL(blobUrl),30000);
      URL.revokeObjectURL(url);
    }catch(error){
      notify(error instanceof Error?`Download failed: ${error.message}`:"Could not download this file.");
    }
  }
  async function signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) notify(`Sign out failed: ${error.message}`);
  }
  async function signOutOtherDevices() {
    if (!supabase || !session) throw new Error("Sign in to manage connected devices.");
    const { error } = await supabase.auth.signOut({ scope: "others" });
    if (error) throw error;
    if (currentDeviceId) {
      await removeOtherDeviceRecords(session.user.id, currentDeviceId);
      setDeviceRecords(prev => prev.filter(device => device.device_id === currentDeviceId));
    }
  }
  function openDrop(type:ResourceType){setDropType(type);setFormTitle("");setFormContent("");setDraftKind("link");setDraftValue("");setEntryDrafts([]);setFormProject(project==="All"?"Research":project);setCreateSpaceInDrop(false);setNewDropSpaceName("");setModal("drop");}
  function addResource(resource:Partial<Resource>){const item:Resource={id:uid(),type:dropType,title:formTitle.trim(),description:formContent.trim() || (resource.entries?.length ? `${resource.entries.filter(e=>e.kind==="link").length} link${resource.entries.filter(e=>e.kind==="link").length===1?"":"s"} • ${resource.entries.filter(e=>e.kind==="note").length} note${resource.entries.filter(e=>e.kind==="note").length===1?"":"s"}` : ""),content:dropType==="Note"?formContent.trim():"",url:dropType==="Link"?formContent.trim():"",project:formProject,createdAt:Date.now(),starred:false,archived:false,...resource};setItems(prev=>[item,...prev]);setModal(null);notify("Added to your space");}
  function saveDrop(){
    const normalizedEntries = entryDrafts.filter(e => e.value.trim().length > 0);
    const targetSpace = createSpaceInDrop ? newDropSpaceName.trim() : formProject;
    if(!formTitle.trim()){notify("Add a title first");return;}
    if(createSpaceInDrop && !targetSpace){notify("Enter a name for the new space");return;}
    if(createSpaceInDrop && projects.some(name=>name.toLowerCase()===targetSpace.toLowerCase())){notify("A space with that name already exists");return;}
    if(dropType==="Link" && !formContent.trim() && normalizedEntries.length===0){notify("Add a link or note before saving");return;}
    if(dropType==="Link" && formContent.trim() && !/^https?:\/\//i.test(formContent.trim())){notify("Please enter a valid http(s) URL");return;}
    if(dropType==="Note" && !formContent.trim() && normalizedEntries.length===0){notify("Add a note before saving");return;}
    const allEntries = [...normalizedEntries];
    if(formContent.trim()){ const primaryKind = dropType === "Link" ? "link" : "note"; allEntries.unshift(createEntry(primaryKind, formContent.trim())); }
    const resourceEntries = allEntries.map(entry => ({ ...entry, id: uid() }));
    const primaryUrl = resourceEntries.find(entry => entry.kind === "link")?.value || "";
    const primaryContent = resourceEntries.find(entry => entry.kind === "note")?.value || "";
    if(createSpaceInDrop){setProjects(prev=>[...prev,targetSpace]);setProject(targetSpace);}
    addResource({
    project: targetSpace,
    entries: resourceEntries,
    url: primaryUrl,
    content: primaryContent,
    description: resourceEntries.length ? `${resourceEntries.filter(e => e.kind === "link").length} link${resourceEntries.filter(e => e.kind === "link").length === 1 ? "" : "s"} • ${resourceEntries.filter(e => e.kind === "note").length} note${resourceEntries.filter(e => e.kind === "note").length === 1 ? "" : "s"}` : formContent.trim(),
    });
    setEntryDrafts([]);
    setDraftValue("");
    setCreateSpaceInDrop(false);
    setNewDropSpaceName("");
  }
  function addDraftEntry(){ const value = draftValue.trim(); if(!value){notify("Write something before saving the entry");return;} const entry = createEntry(draftKind, value); setEntryDrafts(prev=>[...prev, entry]); setDraftValue(""); setDraftKind("link"); notify("Entry added"); }
  function syncResourceEntries(resource: Resource, nextEntries: ResourceEntry[]): Resource {
    const normalizedEntries = nextEntries.filter(entry => entry.value.trim().length > 0);
    const linkCount = normalizedEntries.filter(entry => entry.kind === "link").length;
    const noteCount = normalizedEntries.filter(entry => entry.kind === "note").length;
    const nextUrl = normalizedEntries.find(entry => entry.kind === "link")?.value || resource.url || "";
    const nextContent = normalizedEntries.find(entry => entry.kind === "note")?.value || resource.content || "";
    const nextDescription = normalizedEntries.length
      ? `${linkCount} link${linkCount === 1 ? "" : "s"} • ${noteCount} note${noteCount === 1 ? "" : "s"}`
      : resource.description;

    return { ...resource, entries: normalizedEntries, url: nextUrl, content: nextContent, description: nextDescription };
  }
  function addEntryToResource(resourceId: string, kind: "link" | "note", value: string) {
    const cleanValue = value.trim();
    if (!cleanValue) {
      notify("Add a value before saving");
      return;
    }
    if (kind === "link" && !/^https?:\/\//i.test(cleanValue)) {
      notify("Please enter a valid http(s) URL");
      return;
    }
    setItems(prev => prev.map(item => {
      if (item.id !== resourceId) return item;
      const nextEntries = [...(item.entries || []), createEntry(kind, cleanValue)];
      return syncResourceEntries(item, nextEntries);
    }));
    setDetailEntryValue("");
    setDetailEntryKind("link");
    notify("Entry saved to resource");
  }
  function removeEntryFromResource(resourceId: string, entryId: string) {
    setItems(prev => prev.map(item => {
      if (item.id !== resourceId) return item;
      const nextEntries = (item.entries || []).filter(entry => entry.id !== entryId);
      return syncResourceEntries(item, nextEntries);
    }));
    if (editingEntryId === entryId) {
      setEditingEntryId(null);
      setEntryEditValue("");
    }
    notify("Entry removed");
  }
  function updateEntryInResource(resourceId: string, entryId: string, value: string) {
    const cleanValue = value.trim();
    if (!cleanValue) {
      notify("Entry cannot be empty");
      return;
    }
    setItems(prev => prev.map(item => {
      if (item.id !== resourceId) return item;
      const nextEntries = (item.entries || []).map(entry => {
        if (entry.id !== entryId) return entry;
        const nextEntry = { ...entry, value: cleanValue };
        if (entry.kind === "link" && !/^https?:\/\//i.test(cleanValue)) {
          notify("Please enter a valid http(s) URL");
          return entry;
        }
        return nextEntry;
      });
      return syncResourceEntries(item, nextEntries);
    }));
    setEditingEntryId(null);
    setEntryEditValue("");
    notify("Entry updated");
  }
  function reorderResourceEntries(resourceId: string, fromEntryId: string, toEntryId: string) {
    if (fromEntryId === toEntryId) return;
    setItems(prev => prev.map(item => {
      if (item.id !== resourceId) return item;
      const entries = [...(item.entries || [])];
      const fromIndex = entries.findIndex(entry => entry.id === fromEntryId);
      const toIndex = entries.findIndex(entry => entry.id === toEntryId);
      if (fromIndex < 0 || toIndex < 0) return item;
      const [movedEntry] = entries.splice(fromIndex, 1);
      entries.splice(toIndex, 0, movedEntry);
      return syncResourceEntries(item, entries);
    }));
    setDragEntryId(null);
  }
  function addFiles(files:FileList|null){
    if(!files?.length)return;
    setUploadFiles(Array.from(files));
    setModal("upload");
  }
  function closeUpload(){setUploadFiles([]);setModal(null);}
  function completeUpload(resources:Resource[],newProject?:string){
    if(newProject)setProjects(prev=>prev.includes(newProject)?prev:[...prev,newProject]);
    if(resources.length)setItems(prev=>[...resources,...prev]);
  }
  function handleDrop(event:React.DragEvent<HTMLDivElement>){
    event.preventDefault();
    setDragOver(false);
    if(event.dataTransfer.files.length){addFiles(event.dataTransfer.files);return;}
    const droppedText=event.dataTransfer.getData("text/uri-list")||event.dataTransfer.getData("text/plain");
    const droppedUrl=droppedText.split(/\r?\n/).find(value=>/^https?:\/\//i.test(value.trim()))?.trim();
    if(droppedUrl){
      try{
        const parsed=new URL(droppedUrl);
        setDropType("Link");
        setFormTitle(parsed.hostname);
        setFormContent(parsed.href);
        setFormProject(project==="All"?(projects[0]||"Research"):project);
        setCreateSpaceInDrop(false);
        setNewDropSpaceName("");
        setEntryDrafts([]);
        setModal("drop");
      }catch{notify("Could not read the dropped link");}
    }
  }
  function createProject(){const name=formTitle.trim();if(!name||projects.includes(name)){notify("Enter a unique project name");return;}setProjects(p=>[...p,name]);setProject(name);setView("Project");setFormTitle("");setModal(null);notify("Space created");}
  function moveToTrash(id:string){setItems(p=>p.map(x=>x.id===id?{...x,deleted:true}:x));setSelected(null);notify("Moved to trash");}
  function restore(id:string){setItems(p=>p.map(x=>x.id===id?{...x,deleted:false,archived:false}:x));notify("Item restored");}
  async function purgeResource(id:string){
    const resource=items.find(item=>item.id===id);
    if(!resource)return;
    try{
      if(resource.storagePath)await deleteResourceFile(resource.storagePath);
      setItems(previous=>previous.filter(item=>item.id!==id));
      if(selected===id)setSelected(null);
    }catch(error){
      notify(error instanceof Error?`Could not delete the file: ${error.message}`:"Could not delete this resource file.");
    }
  }
  function exportData(){const blob=new Blob([JSON.stringify({projects,items},null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="dropspace-workspace.json";a.click();URL.revokeObjectURL(a.href);notify("Workspace exported");}
  function importData(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = workspaceStorage.parseImport(String(reader.result));
        setItems(parsed.items);
        setProjects(parsed.projects);
        notify("Workspace imported");
      } catch {
        notify("Could not read this JSON file");
      }
    };
    reader.readAsText(file);
  }
  function setCurrentView(v:View){setView(v);setProject("All");setSelected(null);}
  const title=view==="Project"?project:view==="Inbox"?"All drops":view==="Recent"?"Recently added":view==="Home"?"Home":view==="Profile"?"Profile":view;
  const subtitle=view==="Home"?"Your links, files and ideas, ready when you are.":view==="Profile"?"Manage your account and connected devices.":view==="Inbox"?"Everything you've collected, all in one place.":view==="Recent"?"The things you've saved lately.":view==="Starred"?"Your most important resources.":view==="Archive"?"Finished for now. Kept for later.":view==="Trash"?"Items waiting to be permanently removed.":"A dedicated space for your resources.";

  if (!authReady) {
    return <main className="auth-screen"><section className="auth-card">Connecting to Supabase...</section></main>;
  }
  if (supabaseConfigured && !session) {
    return <AuthScreen initialError={startupError} />;
  }
  if (supabaseConfigured && !workspaceReady) {
    return (
      <main className="auth-screen">
        <section className="auth-card">
          {startupError ? <>
            <h1>Could not load your workspace</h1>
            <p className="auth-error" role="alert">{startupError}</p>
            <button className="primary-button auth-submit" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Try again</button>
          </> : <p>Loading your workspace...</p>}
        </section>
      </main>
    );
  }

  return <div className={`app-shell ${dark?"dark":""}`}>
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">d.</div><div><div className="brand-name">dropspace<span>.</span></div><div className="brand-caption">YOUR DIGITAL DESK</div></div></div>
      <button className="new-button" onClick={()=>openDrop("Link")}><Plus size={17}/> New drop</button>
      <div className="side-section"><div className="section-label">WORKSPACE</div>
        <NavButton active={view==="Home"} icon={<House/>} label="Home" onClick={()=>setCurrentView("Home")}/>
        <NavButton active={view==="Inbox"} icon={<Inbox/>} label="All drops" count={activeItems.filter(x=>!x.archived).length} onClick={()=>setCurrentView("Inbox")}/>
        <NavButton active={view==="Recent"} icon={<Clock3/>} label="Recently added" onClick={()=>setCurrentView("Recent")}/>
        <NavButton active={view==="Starred"} icon={<Star/>} label="Starred" onClick={()=>setCurrentView("Starred")}/>
        <NavButton active={view==="Archive"} icon={<Archive/>} label="Archive" onClick={()=>setCurrentView("Archive")}/>
        <NavButton active={view==="Trash"} icon={<Trash2/>} label="Trash" count={items.filter(x=>x.deleted).length} onClick={()=>setCurrentView("Trash")}/>
      </div>
      <div className="side-section"><div className="section-heading"><span className="section-label">YOUR SPACES</span><button className="bare-icon" onClick={()=>{setFormTitle("");setModal("project");}} title="New space"><Plus size={16}/></button></div>
        {projects.map((p,i)=><button key={p} className={`nav-item ${view==="Project"&&project===p?"active":""}`} onClick={()=>{setProject(p);setView("Project");setSelected(null);}}><span className={`space-dot dot-${i%4}`}>◇</span><span className="nav-text">{p}</span><span className="nav-count">{items.filter(x=>x.project===p&&!x.deleted&&!x.archived).length.toString().padStart(2,"0")}</span></button>)}
      </div>
      <div className="sidebar-bottom">
        <div className="storage-card"><div className="storage-head"><span>{supabaseConfigured?"Cloud sync":"Local storage"}</span><span>Private</span></div><div className="storage-track"><div/></div><div className="storage-note">{supabaseConfigured?"Synced to your Supabase account":"Stored on this device · No account needed"}</div></div>
        <NavButton active={view==="Profile"} icon={<UserRound/>} label="Profile" onClick={()=>setCurrentView("Profile")}/>
        <button className="nav-item" onClick={()=>setModal("settings")}><Settings size={16}/><span className="nav-text">Settings</span></button>
        <div className="profile-row"><div className="avatar">Y</div><div><div className="profile-name">My workspace</div><div className="profile-sub">Personal account</div></div></div>
      </div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><span className="slash">/</span><strong>{title}</strong></div><div className="top-actions"><div className="search-wrap"><Search size={15}/><input ref={searchRef} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search anything..." /><kbd>⌘ K</kbd></div><button className="icon-button" onClick={()=>setModal("help")} title="Help"><HelpCircle size={17}/></button>{supabaseConfigured&&<button className="icon-button" onClick={()=>{void signOut();}} title={`Sign out ${session?.user.email||""}`} aria-label="Sign out"><LogOut size={16}/></button>}</div></header>
      <div className="content-layout">
        <section className="content-main">
          {view==="Home"&&<PWAInstallCard/>}
          <div className="page-heading"><div><div className="eyebrow">{view==="Project"?"YOUR SPACE":view==="Trash"?"RECOVERY":view==="Profile"?"ACCOUNT":"YOUR COLLECTION"}</div><h1>{title}<span>.</span></h1><p>{subtitle}</p></div>{view!=="Profile"&&<button className="primary-button" onClick={()=>openDrop("Link")}><Plus size={16}/> Add new</button>}</div>
          {view!=="Profile"&&<div className="stats-grid">
            <Stat label="TOTAL DROPS" value={activeItems.filter(x=>!x.archived).length.toString().padStart(2,"0")} note="In your workspace"/>
            <Stat label="LINKS" value={activeItems.filter(x=>x.type==="Link"&&!x.archived).length.toString().padStart(2,"0")} note="Saved references"/>
            <Stat label="NOTES" value={activeItems.filter(x=>x.type==="Note"&&!x.archived).length.toString().padStart(2,"0")} note="Ideas & thoughts"/>
            <Stat label="SPACES" value={projects.length.toString().padStart(2,"0")} note="Active projects"/>
          </div>}
          {view!=="Profile"&&<div className={`drop-zone ${dragOver?"drag-over":""}`} onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={handleDrop}>
            <div className="drop-symbol"><ArrowDownToLine size={19}/></div><div className="drop-copy"><strong>Drop it here. Sort it later.</strong><span>Drag files or links into your personal workspace</span></div><button className="secondary-button" onClick={()=>fileRef.current?.click()}><Upload size={14}/> Browse files</button><input ref={fileRef} type="file" multiple hidden onChange={e=>{addFiles(e.target.files);e.target.value="";}}/>
          </div>}
          {view==="Home"&&<HomeDashboard projects={projects} items={items} onOpenSpace={name=>{setProject(name);setView("Project");}} onCreateSpace={()=>{setFormTitle("");setModal("project");}} onOpenResource={id=>setSelected(id)} onOpenAll={()=>setCurrentView("Inbox")}/>}
          {view==="Profile"&&<ProfilePage email={session?.user.email||"Local workspace"} devices={deviceRecords} currentDeviceId={currentDeviceId} loading={devicesLoading} error={devicesError} cloudEnabled={supabaseConfigured} onRefresh={()=>setDeviceRefresh(value=>value+1)} onSignOutOthers={signOutOtherDevices} onSignOut={signOut}/>}
          {view!=="Home"&&view!=="Profile"&&<>
          <div className="toolbar"><div className="filter-list">{["All","Link","Note","Image","File"].map(f=><button key={f} className={`filter-chip ${filter===f?"chosen":""}`} onClick={()=>setFilter(f)}>{f==="All"?"All items":f==="Link"?"Links":f==="Note"?"Notes":f==="Image"?"Images":"Files"}</button>)}</div><div className="toolbar-right"><select value={sort} onChange={e=>setSort(e.target.value)} aria-label="Sort resources"><option value="new">Newest first</option><option value="old">Oldest first</option><option value="az">A – Z</option></select><button className="icon-button" onClick={()=>setCompact(!compact)} title="Toggle compact view">{compact?<List size={16}/>:<LayoutGrid size={16}/>}</button></div></div>
          <div className="result-line"><span>{view==="Trash"?"Recently deleted":"Your resources"} <span className="muted">· {visible.length} items</span></span><button onClick={()=>{setFilter("All");setQuery("");}}>Clear filters</button></div>
          <div className={`resource-grid ${compact?"compact":""}`}>
            {visible.map(item=><ResourceCard key={item.id} item={item} selected={selected===item.id} inTrash={view==="Trash"} onSelect={()=>setSelected(item.id)} onStar={()=>setItems(p=>p.map(x=>x.id===item.id?{...x,starred:!x.starred}:x))} onArchive={()=>{setItems(p=>p.map(x=>x.id===item.id?{...x,archived:true}:x));notify("Moved to archive");}} onDelete={()=>moveToTrash(item.id)} onRestore={()=>restore(item.id)} onPurge={()=>void purgeResource(item.id)}/>)}
            {visible.length===0&&<div className="empty-state"><div className="empty-icon"><Inbox size={25}/></div><strong>Nothing here just yet</strong><p>Add a resource or try changing your filters.</p><button className="secondary-button" onClick={()=>openDrop("Link")}><Plus size={14}/> Create a drop</button></div>}
          </div>
          <div className="footer-note">YOUR SPACE, YOUR PACE <span>·</span> DROPSPACE</div>
          </>}
        </section>
        {view!=="Profile"&&<aside className="right-panel">
          <div className="panel-title">QUICK ACCESS <span>⌘ K</span></div>
          <div className="resume-card"><div className="eyebrow">PICK UP WHERE YOU LEFT OFF</div><h3>Your research desk</h3><p>Keep your reading, references and notes together.</p><button onClick={()=>{setProject("Research");setView("Project");}}>Open space <ArrowUpRight size={13}/></button></div>
          <div className="panel-block"><div className="panel-heading">RECENT SPACES</div>{projects.slice(0,4).map((p,i)=><button className="recent-space" key={p} onClick={()=>{setProject(p);setView("Project");}}><span className={`space-dot dot-${i%4}`}>◇</span>{p}<span>{items.filter(x=>x.project===p&&!x.deleted&&!x.archived).length.toString().padStart(2,"0")}</span></button>)}</div>
          <div className="panel-divider"/>
          <div className="panel-block"><div className="panel-heading">QUICK ACTIONS</div><div className="quick-grid"><button onClick={()=>openDrop("Note")}><Plus size={14}/> Note</button><button onClick={()=>openDrop("Link")}><ArrowUpRight size={14}/> Link</button><button onClick={()=>fileRef.current?.click()}><Upload size={14}/> File</button><button onClick={()=>{setFormTitle("");setModal("project");}}><FolderPlus size={14}/> Space</button></div></div>
          <div className="panel-divider"/>
          <div className="tip-block"><div className="panel-heading">A SMALL REMINDER</div><p>Save first, organize later. Your inbox is designed to collect everything without interrupting your flow.</p></div>
          <div className="panel-foot">DROP SPACE · VERSION 1.0<br/>{supabaseConfigured?"SUPABASE CLOUD SYNC":"LOCAL-FIRST WORKSPACE"}</div>
        </aside>}
      </div>
    </main>
    {selected&&current&&<div className="detail-backdrop" onClick={()=>setSelected(null)}><section className="detail-drawer" onClick={e=>e.stopPropagation()}><div className="drawer-head"><span>RESOURCE DETAILS</span><button className="icon-button" onClick={()=>setSelected(null)}><X size={17}/></button></div><div className="detail-type">{iconFor(current.type)} {current.type} · {dateLabel(current.createdAt)}</div><h2>{current.title}</h2><p className="detail-description">{current.description}</p>{current.url&&<a className="detail-url" href={current.url} target="_blank" rel="noreferrer">{current.url} <ArrowUpRight size={13}/></a>}{current.storagePath&&<button className="secondary-button" onClick={()=>void downloadFile(current)}><ArrowDownToLine size={14}/> Download file</button>}<label className="form-label">PERSONAL NOTE / CONTENT</label><textarea className="form-input detail-textarea" value={current.content||""} onChange={e=>setItems(p=>p.map(x=>x.id===current.id?{...x,content:e.target.value}:x))} placeholder="Add context or a note..."/><div className="panel-block"><div className="panel-heading">ADD ENTRY</div><div className="settings-row"><select value={detailEntryKind} onChange={e=>setDetailEntryKind(e.target.value as "link"|"note")}><option value="link">Link</option><option value="note">Note</option></select><input className="form-input" value={detailEntryValue} onChange={e=>setDetailEntryValue(e.target.value)} placeholder={detailEntryKind==="link"?"https://example.com":"Add a note..."}/><button className="secondary-button" onClick={()=>addEntryToResource(current.id, detailEntryKind, detailEntryValue)}><Plus size={14}/> Add</button></div></div><div className="panel-block"><div className="panel-heading">TIMELINE</div>{(current.entries && current.entries.length ? current.entries : [{ id: uid(), kind: current.url ? "link" : "note", value: current.url || current.content || current.description, createdAt: current.createdAt }]).map((entry,index) => {
        const isEditing = editingEntryId === entry.id;
        const editValue = entryEditValue;
        return <div key={entry.id} className="shortcut-row" draggable onDragStart={()=>setDragEntryId(entry.id)} onDragOver={e=>e.preventDefault()} onDrop={()=>{if(dragEntryId){reorderResourceEntries(current.id, dragEntryId, entry.id);}}} onDragEnd={()=>setDragEntryId(null)}>
          <span style={{flex:1}}>{entry.kind === "link" ? "Link" : "Note"} · {dateTimeLabel(entry.createdAt)}</span>
          {isEditing ? <>
            <input className="form-input" value={editValue} onChange={e=>setEntryEditValue(e.target.value)} style={{flex:1, minWidth: 180}} />
            <button className="secondary-button" onClick={()=>updateEntryInResource(current.id, entry.id, entryEditValue)}><Check size={13}/> Save</button>
            <button className="icon-button" onClick={()=>{setEditingEntryId(null); setEntryEditValue("");}}><X size={13}/></button>
          </> : <>
            {entry.kind === "link" ? <a href={entry.value} target="_blank" rel="noreferrer">Open</a> : <strong>{entry.value}</strong>}
            <button className="icon-button" onClick={()=>{setEditingEntryId(entry.id); setEntryEditValue(entry.value);}} title="Edit entry"><Check size={13}/></button>
            <button className="icon-button" onClick={()=>removeEntryFromResource(current.id, entry.id)} title="Delete entry"><Trash2 size={13}/></button>
          </>}
        </div>;
      })}</div><label className="form-label">MOVE TO SPACE</label><select className="form-input" value={current.project} onChange={e=>setItems(p=>p.map(x=>x.id===current.id?{...x,project:e.target.value}:x))}>{projects.map(p=><option key={p}>{p}</option>)}</select><div className="drawer-actions"><button className="secondary-button" onClick={()=>{setItems(p=>p.map(x=>x.id===current.id?{...x,archived:!x.archived}:x));setSelected(null);}}> <Archive size={14}/> {current.archived?"Unarchive":"Archive"}</button><button className="danger-button" onClick={()=>moveToTrash(current.id)}><Trash2 size={14}/> Move to trash</button></div></section></div>}
    {modal&&modal!=="upload"&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(null);}}><div className="modal-card">
      <div className="modal-head"><div><div className="eyebrow">{modal==="drop"?"CAPTURE SOMETHING":modal==="project"?"ORGANIZE YOUR WORK":"PREFERENCES"}</div><h2>{modal==="drop"?"Add a new drop":modal==="project"?"Create a space":modal==="settings"?"Workspace settings":"Keyboard shortcuts"}</h2></div><button className="icon-button" onClick={()=>setModal(null)}><X size={17}/></button></div>
      {modal==="drop"&&<><div className="type-tabs">{(["Link","Note","Image","File"] as ResourceType[]).map(t=><button className={dropType===t?"selected":""} key={t} onClick={()=>setDropType(t)}>{iconFor(t)}{t}</button>)}</div><label className="form-label">TITLE</label><input className="form-input" value={formTitle} onChange={e=>setFormTitle(e.target.value)} placeholder="Give your drop a name"/><label className="form-label">PRIMARY {dropType==="Link"?"URL":"NOTE"}</label><textarea className="form-input form-textarea" value={formContent} onChange={e=>setFormContent(e.target.value)} placeholder={dropType==="Link"?"https://example.com":"Write something worth keeping..."}/><div className="settings-row"><div><strong>Add more links and notes</strong><p>Capture a single resource with multiple timestamps.</p></div></div><div className="settings-row"><select value={draftKind} onChange={e=>setDraftKind(e.target.value as "link"|"note")}><option value="link">Link</option><option value="note">Note</option></select><input className="form-input" value={draftValue} onChange={e=>setDraftValue(e.target.value)} placeholder={draftKind==="link"?"https://example.com":"Add a timestamped note"}/><button className="secondary-button" onClick={addDraftEntry}><Plus size={14}/> Add entry</button></div>{entryDrafts.length>0 && <div className="panel-block"><div className="panel-heading">ADDED ENTRIES</div>{entryDrafts.map(entry=><div key={entry.id} className="shortcut-row"><span>{entry.kind === "link" ? "Link" : "Note"} · {dateTimeLabel(entry.createdAt)}</span><button className="icon-button" onClick={()=>setEntryDrafts(prev=>prev.filter(item=>item.id!==entry.id))}><X size={13}/></button></div>)}</div>}<label className="form-label">{createSpaceInDrop?"NEW SPACE NAME":"SPACE"}</label>{createSpaceInDrop?<input className="form-input" autoFocus value={newDropSpaceName} onChange={e=>setNewDropSpaceName(e.target.value)} placeholder="e.g. Product research"/>:<select className="form-input" value={formProject} onChange={e=>setFormProject(e.target.value)}>{projects.map(p=><option key={p}>{p}</option>)}</select>}<button type="button" className="inline-space-toggle" onClick={()=>{setCreateSpaceInDrop(!createSpaceInDrop);setNewDropSpaceName("");}}><FolderPlus size={14}/>{createSpaceInDrop?"Choose an existing space":"Create a new space"}</button><div className="modal-actions"><button className="secondary-button" onClick={()=>setModal(null)}>Cancel</button><button className="primary-button" onClick={saveDrop}><Plus size={15}/> Save drop</button></div></>}
      {modal==="project"&&<><label className="form-label">SPACE NAME</label><input className="form-input" autoFocus value={formTitle} onChange={e=>setFormTitle(e.target.value)} placeholder="e.g. Product research"/><p className="form-hint">Create a dedicated place for links, notes, files and references.</p><div className="modal-actions"><button className="secondary-button" onClick={()=>setModal(null)}>Cancel</button><button className="primary-button" onClick={createProject}><FolderPlus size={15}/> Create space</button></div></>}
      {modal==="settings"&&<><div className="settings-row"><div><strong>Appearance</strong><p>Choose the workspace theme.</p></div><select value={dark?"dark":"light"} onChange={e=>setDark(e.target.value==="dark")}><option value="light">Warm light</option><option value="dark">Dark</option></select></div><div className="settings-row"><div><strong>Export workspace</strong><p>Download your resources as JSON.</p></div><button className="secondary-button" onClick={exportData}><ArrowDownToLine size={14}/> Export</button></div><div className="settings-row"><div><strong>Import workspace</strong><p>Restore a previous DropSpace export.</p></div><label className="secondary-button">Import<input type="file" accept=".json,application/json" hidden onChange={e=>importData(e.target.files?.[0])}/></label></div><div className="settings-note"><HardDrive size={15}/> {supabaseConfigured?"Your workspace is synced to Supabase and protected by account-level access policies.":"Your prototype data is saved in this browser using local storage. No account or cloud service is connected."}</div><div className="modal-actions"><button className="primary-button" onClick={()=>setModal(null)}>Done</button></div></>}
      {modal==="help"&&<><div className="shortcut-row"><span>Search resources</span><kbd>Ctrl / ⌘ + K</kbd></div><div className="shortcut-row"><span>New drop</span><kbd>N</kbd></div><div className="shortcut-row"><span>Close dialog</span><kbd>Esc</kbd></div><p className="form-hint">Shortcuts are available while the workspace is focused.</p><div className="modal-actions"><button className="primary-button" onClick={()=>setModal(null)}>Got it</button></div></>}
    </div></div>}
    {modal==="upload"&&<UploadDialog key={uploadFiles.map(file=>`${file.name}:${file.size}:${file.lastModified}`).join("|")} initialFiles={uploadFiles} projects={projects} initialProject={project==="All"?(projects[0]||"Research"):project} userId={session?.user.id} onClose={closeUpload} onComplete={completeUpload} notify={notify}/>}
    {toast&&<div className="toast"><Check size={15}/>{toast}</div>}
  </div>;
}
function HomeDashboard({projects,items,onOpenSpace,onCreateSpace,onOpenResource,onOpenAll}:{projects:string[];items:Resource[];onOpenSpace:(name:string)=>void;onCreateSpace:()=>void;onOpenResource:(id:string)=>void;onOpenAll:()=>void}) {
  const activeItems=items.filter(item=>!item.deleted&&!item.archived);
  const recentItems=[...activeItems].sort((a,b)=>b.createdAt-a.createdAt).slice(0,4);
  return <div className="home-dashboard">
    <section className="home-section">
      <div className="home-section-heading"><div><div className="eyebrow">ORGANIZE YOUR WORK</div><h2>Your spaces</h2><p>Jump back into a collection or start a new one.</p></div><span className="home-count">{projects.length} spaces</span></div>
      <div className="home-space-grid">
        {projects.map((name,index)=><button className="home-space-card" key={name} onClick={()=>onOpenSpace(name)}><span className={`space-dot dot-${index%4}`}>◇</span><strong>{name}</strong><span>{activeItems.filter(item=>item.project===name).length} resources</span><ArrowUpRight size={14}/></button>)}
        <button className="home-space-card create" onClick={onCreateSpace}><span className="create-space-icon"><FolderPlus size={16}/></span><strong>Create a space</strong><span>Give your ideas a home</span><Plus size={14}/></button>
      </div>
    </section>
    <section className="home-section">
      <div className="home-section-heading"><div><div className="eyebrow">FRESH FROM YOUR WORKSPACE</div><h2>Recently added</h2><p>Your latest saved resources across all spaces.</p></div><button className="home-view-all" onClick={onOpenAll}>All drops <ArrowUpRight size={13}/></button></div>
      {recentItems.length ? <div className="home-recent-grid">{recentItems.map(item=><button className="home-recent-card" key={item.id} onClick={()=>onOpenResource(item.id)}><span className="home-resource-type">{iconFor(item.type)}{item.type}</span><strong>{item.title}</strong><span className="home-resource-description">{item.description||"No description added."}</span><span className="home-resource-meta"><span className="project-pill">{item.project}</span><span>{dateLabel(item.createdAt)}</span></span></button>)}</div> : <div className="home-empty"><strong>Your desk is ready.</strong><span>Create your first drop or drag a file into the space above.</span></div>}
    </section>
  </div>;
}
function PWAInstallCard() {
  const [installPrompt, setInstallPrompt] = useState<PwaInstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [installError, setInstallError] = useState("");
  const isAppleMobile = /iPad|iPhone|iPod/i.test(navigator.userAgent);

  useEffect(() => {
    const updateMobileState = () => setIsMobile(window.matchMedia("(max-width: 720px)").matches);
    const onBeforeInstallPrompt = (event: Event) => {
      if (!isPwaInstallPrompt(event)) return;
      event.preventDefault();
      setInstallPrompt(event);
    };
    const onInstalled = () => setInstalled(true);

    updateMobileState();
    setInstalled(window.matchMedia("(display-mode: standalone)").matches);
    window.addEventListener("resize", updateMobileState);
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("resize", updateMobileState);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function installApp() {
    if (!installPrompt) return;
    setInstallError("");
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setInstallPrompt(null);
    } catch (error) {
      setInstallError(error instanceof Error ? error.message : "Could not start the installation.");
    }
  }

  if (installed || dismissed || (!installPrompt && !isMobile)) return null;
  const instructions = installPrompt
    ? "Install DropSpace for quick access from your home screen."
    : isAppleMobile
      ? "Tap Share in your browser, then choose Add to Home Screen."
      : "Open your browser menu and choose Install app or Add to Home Screen.";

  return <aside className="pwa-install-card" aria-label="Install DropSpace">
    <span className="pwa-install-icon"><Download size={17}/></span>
    <div className="pwa-install-copy">
      <strong>{installPrompt ? "Install DropSpace" : "Add DropSpace to your home screen"}</strong>
      <p>{instructions}</p>
      {installError&&<p className="pwa-install-error" role="alert">{installError}</p>}
    </div>
    {installPrompt&&<button className="secondary-button" onClick={()=>void installApp()}>Install</button>}
    <button className="pwa-dismiss icon-button" onClick={()=>setDismissed(true)} aria-label="Dismiss install instructions"><X size={14}/></button>
  </aside>;
}
function NavButton({active,icon,label,count,onClick}:{active:boolean;icon:React.ReactNode;label:string;count?:number;onClick:()=>void}){const mobileLabel=label==="All drops"?"Drops":label==="Recently added"?"Recent":label;return <button className={`nav-item ${active?"active":""}`} onClick={onClick} aria-label={label} title={label}>{icon}<span className="nav-text">{label}</span><span className="nav-short">{mobileLabel}</span>{count!==undefined&&<span className="nav-count">{count.toString().padStart(2,"0")}</span>}</button>}
function Stat({label,value,note}:{label:string;value:string;note:string}){return <div className="stat-card"><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-note">{note}</div></div>}
function ResourceCard({item,selected,inTrash,onSelect,onStar,onArchive,onDelete,onRestore,onPurge}:{item:Resource;selected:boolean;inTrash:boolean;onSelect:()=>void;onStar:()=>void;onArchive:()=>void;onDelete:()=>void;onRestore:()=>void;onPurge:()=>void}) {
  return <article className={`resource-card ${selected?"selected":""}`}><div className="resource-top"><div className="resource-kind"><span className="resource-icon">{iconFor(item.type)}</span><span>{item.type}</span></div><button className={`star-button ${item.starred?"is-starred":""}`} onClick={onStar} title="Star resource"><Star size={15} fill={item.starred?"currentColor":"none"}/></button></div><button className="resource-main" onClick={onSelect}><strong>{item.title}</strong><span>{item.description||"No description added."}</span></button><div className="resource-meta"><span className="project-pill">{item.project}</span><span>{dateLabel(item.createdAt)}</span></div><div className="resource-actions">{inTrash?<><button onClick={onRestore}><RotateCcw size={13}/> Restore</button><button onClick={onPurge}><X size={13}/> Delete forever</button></>:<><button onClick={onSelect}>Open details</button><button onClick={onArchive} title="Archive"><Archive size={13}/></button><button onClick={onDelete} title="Move to trash"><Trash2 size={13}/></button></>}</div></article>;
}
