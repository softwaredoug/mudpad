const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  selectDirectory: () => ipcRenderer.invoke("select-directory"),
  getLastDirectory: () => ipcRenderer.invoke("get-last-directory"),
  setLastDirectory: (payload) => ipcRenderer.invoke("set-last-directory", payload),
  getHomeDirectory: () => ipcRenderer.invoke("get-home-directory"),
  validateDirectory: (directory) => ipcRenderer.invoke("validate-directory", directory),
  listTextFiles: (directory) => ipcRenderer.invoke("list-text-files", directory),
  readFile: (filePath) => ipcRenderer.invoke("read-file", filePath),
  createNewFile: (directory) => ipcRenderer.invoke("create-new-file", directory),
  createFolder: (payload) => ipcRenderer.invoke("create-folder", payload),
  renameFile: (payload) => ipcRenderer.invoke("rename-file", payload),
  deleteFile: (payload) => ipcRenderer.invoke("delete-file", payload),
  setCorrectionsDirectory: (directory) =>
    ipcRenderer.invoke("set-corrections-directory", directory),
  addSpellingException: (payload) => ipcRenderer.invoke("add-spelling-exception", payload),
  addDismissedChange: (payload) => ipcRenderer.invoke("add-dismissed-change", payload),
  applyIssue: (payload) => ipcRenderer.invoke("apply-issue", payload),
  saveAndCommit: (payload) => ipcRenderer.invoke("save-and-commit", payload),
  getGitSyncStatus: (directory) => ipcRenderer.invoke("get-git-sync-status", directory),
  syncWithOrigin: (directory) => ipcRenderer.invoke("sync-with-origin", directory),
  checkCorrections: (payload) => ipcRenderer.invoke("check-corrections", payload),
  analyzeCorrections: (payload) => ipcRenderer.invoke("analyze-corrections", payload)
});
