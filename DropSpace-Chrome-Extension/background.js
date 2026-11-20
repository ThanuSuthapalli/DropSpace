chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "dropspace-save-selection",
      title: "Save selection to DropSpace",
      contexts: ["selection"]
    });
    chrome.contextMenus.create({
      id: "dropspace-save-link",
      title: "Save link to DropSpace",
      contexts: ["link"]
    });
  });
});
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const item = {
    id: crypto.randomUUID(),
    type: info.menuItemId === "dropspace-save-link" ? "Link" : "Note",
    title: info.linkUrl ? info.linkUrl : "Saved selection",
    url: info.linkUrl || "",
    content: info.selectionText || "",
    description: info.selectionText || info.linkUrl || "",
    project: "Inbox",
    createdAt: Date.now(),
    starred: false,
    archived: false
  };
  const result = await chrome.storage.local.get({ "dropspace-pending": [] });
  const pending = Array.isArray(result["dropspace-pending"]) ? result["dropspace-pending"] : [];
  await chrome.storage.local.set({ "dropspace-pending": [item, ...pending] });
  if (tab?.id) {
    try {
      await chrome.sidePanel.open({ tabId: tab.id });
    } catch (error) {
      console.error("Could not open DropSpace side panel", error);
    }
  }
});
