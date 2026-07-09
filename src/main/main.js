import { app, BrowserWindow, dialog, ipcMain, protocol } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import { LanguageToolChecker } from "./languagetool/index.js";
import { createCorrectionsEngine } from "./corrections.js";

import { LastOpenedAPI } from "./last-opened/api.js";
import { FileOpsAPI } from "./file-ops/api.js";

LastOpenedAPI.create(app, ipcMain);
FileOpsAPI.create(ipcMain);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true
    }
  }
]);

const debugPort = process.env.REMOTE_DEBUGGING_PORT ?? "9222";
app.commandLine.appendSwitch("remote-debugging-port", debugPort);
console.log(`Remote debugging enabled on port ${debugPort}`);
const appStartTime = Date.now();

function logStartup(message) {
  const elapsed = Date.now() - appStartTime;
  console.log(`[startup +${elapsed}ms] ${message}`);
}

let languageToolChecker = null


async function checkGrammarWithLanguageTool(text) {
  if (!languageToolChecker) {
    return { issues: [], error: "LanguageToolChecker not initialized" };
  }
  return await languageToolChecker.check(text);
}


const correctionsEngine = createCorrectionsEngine({
  grammarChecker: checkGrammarWithLanguageTool,
});


function createWindow() {
  logStartup("Create window");
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    win.loadURL(devServerUrl);
  } else {
    const indexPath = path.join(__dirname, "../../dist/renderer/index.html");
    win.loadFile(indexPath);
  }

  win.once("ready-to-show", () => logStartup("Window ready-to-show"));
  win.webContents.once("did-finish-load", () => logStartup("Renderer did-finish-load"));
}

app.whenReady().then(async () => {
  logStartup("App ready");
  app.setName("MudPad");
  protocol.registerFileProtocol("app", (request, callback) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== "local") {
        callback({ error: -6 });
        return;
      }
      const filePath = decodeURIComponent(url.pathname);
      callback({ path: filePath });
    } catch {
      callback({ error: -6 });
    }
  });
  const cacheDir = path.join(app.getPath("userData"), "languagetool");
  languageToolChecker =  await LanguageToolChecker.create(cacheDir);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (languageToolChecker) {
    languageToolChecker.kill();
  }
});

ipcMain.handle("show-directory-picker", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return { path: result.filePaths[0] };
});

ipcMain.handle("get-home-directory", async () => {
  return { path: app.getPath("home") };
});


ipcMain.handle("validate-directory", async (_event, directory) => {
  if (!directory) {
    return { ok: false, error: "Path is required." };
  }
  try {
    const stats = await fs.stat(directory);
    if (!stats.isDirectory()) {
      return { ok: false, error: "Path is not a directory." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Directory not found." };
  }
});

ipcMain.handle("set-corrections-directory", async (_event, directory) => {
  await correctionsEngine.setDirectory(directory);
  return { ok: true };
});

ipcMain.handle("add-spelling-exception", async (_event, payload) =>
  {
    const fileCorrections = correctionsEngine.getFileCorrections(payload?.filePath);
    if (!fileCorrections) {
      return { error: "No active file." };
    }
    return fileCorrections.ignoreWord({ word: payload?.word, text: payload?.text ?? "" });
  }
);

ipcMain.handle("add-dismissed-change", async (_event, payload) =>
  {
    const fileCorrections = correctionsEngine.getFileCorrections(payload?.filePath);
    if (!fileCorrections) {
      return { error: "No active file." };
    }
    return fileCorrections.dismissIssue({ issue: payload?.issue, text: payload?.text ?? "" });
  }
);

ipcMain.handle("apply-issue", async (_event, payload) => {
  const fileCorrections = correctionsEngine.getFileCorrections(payload?.filePath);
  if (!fileCorrections) {
    return { error: "No active file." };
  }
  return fileCorrections.applyIssue({ issue: payload?.issue, text: payload?.text ?? "" });
});

ipcMain.handle("check-corrections", async (_event, payload) =>
  {
    const fileCorrections = correctionsEngine.getFileCorrections(payload?.filePath);
    if (!fileCorrections) {
      return { issues: { spell: [], grammar: [], llm: [] }, errors: { grammar: null, llm: null } };
    }
    return fileCorrections.runChecks({ text: payload?.text ?? "" });
  }
);

ipcMain.handle("analyze-corrections", async (_event, payload) =>
  {
    const fileCorrections = correctionsEngine.getFileCorrections(payload?.filePath);
    if (!fileCorrections) {
      return { issues: { spell: [], grammar: [], llm: [] }, errors: { grammar: null, llm: null } };
    }
    return fileCorrections.runAnalysis({ text: payload?.text ?? "", includeLlm: false });
  }
);
