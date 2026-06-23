import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import { spawn } from "child_process";
import { resolveJavaCommand, resolveLanguageToolJar } from "./languagetool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const debugPort = process.env.REMOTE_DEBUGGING_PORT ?? "9222";
app.commandLine.appendSwitch("remote-debugging-port", debugPort);
console.log(`Remote debugging enabled on port ${debugPort}`);

const languageToolPort = process.env.LANGUAGETOOL_PORT ?? "8010";
let languageToolProcess = null;
let languageToolError = null;
let languageToolErrorShown = false;
let languageToolDiagnostics = null;

function formatLanguageToolDiagnostics() {
  if (!languageToolDiagnostics) {
    return "";
  }

  const parts = [];
  if (languageToolDiagnostics.javaCommand) {
    parts.push(`Java: ${languageToolDiagnostics.javaCommand}`);
  }
  if (languageToolDiagnostics.jarPath) {
    parts.push(`Jar: ${languageToolDiagnostics.jarPath}`);
  }
  if (languageToolDiagnostics.stderr?.length) {
    parts.push("\nLast stderr:");
    parts.push(languageToolDiagnostics.stderr.join("\n"));
  }

  return parts.join("\n");
}

function showLanguageToolError(title, details) {
  const diagnostics = formatLanguageToolDiagnostics();
  const fullDetails = [details, diagnostics].filter(Boolean).join("\n\n");
  languageToolError = fullDetails || title;
  if (languageToolErrorShown) {
    return;
  }
  languageToolErrorShown = true;
  dialog.showErrorBox(title, fullDetails ?? "");
}

async function startLanguageTool() {
  if (process.env.DISABLE_LANGUAGETOOL === "1") {
    return;
  }

  const cacheDir = path.join(app.getPath("userData"), "languagetool");
  const bundledDir = path.join(process.resourcesPath, "languagetool");

  try {
    const jarPath = await resolveLanguageToolJar({ cacheDir, bundledDir });
    const javaCommand = await resolveJavaCommand();
    const args = ["-jar", jarPath, "--port", languageToolPort];
    const stderrBuffer = [];
    languageToolDiagnostics = {
      javaCommand,
      jarPath,
      stderr: stderrBuffer
    };
    languageToolProcess = spawn(javaCommand, args, { stdio: ["ignore", "pipe", "pipe"] });

    languageToolProcess.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
    });

    languageToolProcess.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      process.stderr.write(chunk);
      text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => {
          stderrBuffer.push(line);
          if (stderrBuffer.length > 20) {
            stderrBuffer.shift();
          }
        });
    });

    languageToolProcess.on("error", (error) => {
      const message = `LanguageTool failed to start: ${error.message}`;
      console.error(message);
      const isMissingJava = error?.code === "ENOENT";
      showLanguageToolError(
        isMissingJava ? "Java not available" : "LanguageTool failed to start",
        isMissingJava
          ? "Java was not found. Install Java and relaunch the app. You can also set LANGUAGETOOL_JAVA to a full java path."
          : "Java is required. Install Java and relaunch the app."
      );
    });

    languageToolProcess.on("exit", (code) => {
      languageToolProcess = null;
      if (code && code !== 0) {
        const message = `LanguageTool exited with code ${code}`;
        console.error(message);
        showLanguageToolError(
          "LanguageTool exited unexpectedly",
          `The grammar server exited with code ${code}.`
        );
      }
    });
  } catch (error) {
    const message = `Failed to start LanguageTool: ${error.message}`;
    console.error(message);
    showLanguageToolError(
      "LanguageTool failed to start",
      error.message
    );
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

  if (languageToolError) {
    return { issues: [], error: languageToolError };
  }

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
    if (!languageToolErrorShown) {
      showLanguageToolError(
        "LanguageTool not reachable",
        "The grammar server is not responding. Ensure Java is installed and LanguageTool can launch."
      );
    }
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
