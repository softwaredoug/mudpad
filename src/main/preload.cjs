const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  selectDirectory: () => ipcRenderer.invoke("select-directory"),
  getHomeDirectory: () => ipcRenderer.invoke("get-home-directory"),
  validateDirectory: (directory) => ipcRenderer.invoke("validate-directory", directory),
  listMarkdownFiles: (directory) => ipcRenderer.invoke("list-markdown-files", directory),
  readFile: (filePath) => ipcRenderer.invoke("read-file", filePath),
  saveAndCommit: (payload) => ipcRenderer.invoke("save-and-commit", payload),
  getGitSyncStatus: (directory) => ipcRenderer.invoke("get-git-sync-status", directory),
  syncWithOrigin: (directory) => ipcRenderer.invoke("sync-with-origin", directory),
  checkGrammar: (text) => ipcRenderer.invoke("check-grammar", text),
  analyzeWithLlm: (text) => ipcRenderer.invoke("analyze-llm", text)
});
