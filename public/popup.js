const status = document.getElementById("status");
const saveButton = document.getElementById("save");
const openButton = document.getElementById("open");
const pendingKey = "dropspace-pending";

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("Could not find the active tab.");
  return tab;
}

openButton.addEventListener("click", async () => {
  try {
    const tab = await activeTab();
    await chrome.sidePanel.open({ tabId: tab.id });
    window.close();
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Could not open DropSpace.";
  }
});

saveButton.addEventListener("click", async () => {
  saveButton.disabled = true;
  status.textContent = "";
  try {
    const tab = await activeTab();
    const url = new URL(tab.url);
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("This page cannot be saved as a link.");
    }

    const result = await chrome.storage.local.get({ [pendingKey]: [] });
    const pending = Array.isArray(result[pendingKey]) ? result[pendingKey] : [];
    pending.unshift({
      id: crypto.randomUUID(),
      type: "Link",
      title: tab.title || url.hostname,
      url: url.href,
      description: tab.title || url.href,
      project: "Research",
      createdAt: Date.now(),
      starred: false,
      archived: false
    });
    await chrome.storage.local.set({ [pendingKey]: pending });
    await chrome.sidePanel.open({ tabId: tab.id });
    window.close();
  } catch (error) {
    saveButton.disabled = false;
    status.textContent = error instanceof Error ? error.message : "Could not save this page.";
  }
});
