import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import { spawn } from "child_process";
import { resolveLanguageToolJar } from "./languagetool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const debugPort = process.env.REMOTE_DEBUGGING_PORT ?? "9222";
app.commandLine.appendSwitch("remote-debugging-port", debugPort);
console.log(`Remote debugging enabled on port ${debugPort}`);

const languageToolPort = process.env.LANGUAGETOOL_PORT ?? "8010";
let languageToolProcess = null;

async function startLanguageTool() {
  if (process.env.DISABLE_LANGUAGETOOL === "1") {
    return;
  }

  const cacheDir = path.join(app.getPath("userData"), "languagetool");
  const bundledDir = path.join(process.resourcesPath, "languagetool");

  try {
    const jarPath = await resolveLanguageToolJar({ cacheDir, bundledDir });
    const args = ["-jar", jarPath, "--port", languageToolPort];
    languageToolProcess = spawn("java", args, { stdio: "inherit" });

    languageToolProcess.on("error", (error) => {
      console.error(`LanguageTool failed to start: ${error.message}`);
    });

    languageToolProcess.on("exit", (code) => {
      languageToolProcess = null;
      if (code && code !== 0) {
        console.error(`LanguageTool exited with code ${code}`);
      }
    });
  } catch (error) {
    console.error(`Failed to start LanguageTool: ${error.message}`);
  }
}

function createWindow() {
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
}

app.whenReady().then(() => {
  startLanguageTool();
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
  if (languageToolProcess) {
    languageToolProcess.kill();
  }
});

ipcMain.handle("open-file", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [
      { name: "Markdown", extensions: ["md", "markdown"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  const content = await fs.readFile(filePath, "utf8");
  return { path: filePath, content };
});

ipcMain.handle("save-file", async (_event, payload) => {
  const { path: existingPath, content } = payload ?? {};
  let filePath = existingPath;

  if (!filePath) {
    const result = await dialog.showSaveDialog({
      filters: [
        { name: "Markdown", extensions: ["md", "markdown"] },
        { name: "All Files", extensions: ["*"] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    filePath = result.filePath;
  }

  await fs.writeFile(filePath, content ?? "", "utf8");
  return { path: filePath };
});

ipcMain.handle("check-grammar", async (_event, text) => {
  const endpoint = `http://localhost:${languageToolPort}/v2/check`;

  try {
    const body = new URLSearchParams({
      text: text ?? "",
      language: "en-US"
    });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });

    if (!response.ok) {
      return { issues: [], error: `LanguageTool error ${response.status}` };
    }

    const data = await response.json();
    const issues = (data.matches ?? []).map((match, index) => {
      const start = match.offset ?? 0;
      const length = match.length ?? 0;
      const suggestions = (match.replacements ?? []).map((rep) => rep.value);
      return {
        id: `grammar-${index}-${start}`,
        type: "grammar",
        range: { start, end: start + length },
        message: match.message ?? "Grammar issue",
        suggestions,
        source: "languagetool",
        confidence: 0.6,
        status: "open"
      };
    });

    return { issues, error: null };
  } catch (error) {
    return { issues: [], error: "LanguageTool not reachable" };
  }
});

ipcMain.handle("analyze-llm", async (_event, text) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { issues: [], error: "Missing OPENAI_API_KEY" };
  }

  const prompt = [
    "You are a copy editor.",
    "Return JSON only with a list of edits for the provided markdown.",
    "Each edit must include start, end (0-based character offsets), replacement, and message.",
    "Do not include any extra text outside JSON.",
    "",
    "Text:",
    text ?? ""
  ].join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2
      })
    });

    if (!response.ok) {
      return { issues: [], error: `OpenAI error ${response.status}` };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(content);
    const edits = Array.isArray(parsed) ? parsed : parsed.edits;
    const issues = (edits ?? []).map((edit, index) => {
      const start = Number(edit.start ?? 0);
      const end = Number(edit.end ?? start);
      return {
        id: `llm-${index}-${start}`,
        type: "llm",
        range: { start, end },
        message: edit.message ?? "LLM suggestion",
        suggestions: edit.replacement ? [edit.replacement] : [],
        source: "openai",
        confidence: 0.5,
        status: "open"
      };
    });

    return { issues, error: null };
  } catch (error) {
    return { issues: [], error: "Failed to parse LLM response" };
  }
});
