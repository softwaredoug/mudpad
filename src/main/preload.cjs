const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  openFile: () => ipcRenderer.invoke("open-file"),
  saveFile: (payload) => ipcRenderer.invoke("save-file", payload),
  checkGrammar: (text) => ipcRenderer.invoke("check-grammar", text),
  analyzeWithLlm: (text) => ipcRenderer.invoke("analyze-llm", text)
});
