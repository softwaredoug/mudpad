import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import fs from "fs/promises";
import net from "net";
import { resolveJavaCommand, resolveLanguageToolJar } from "./languagetool.js";
import * as fileOps from "./file-ops.js";
import { createCorrectionsEngine } from "./corrections.js";
import { Worker } from "worker_threads";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const debugPort = process.env.REMOTE_DEBUGGING_PORT ?? "9222";
app.commandLine.appendSwitch("remote-debugging-port", debugPort);
console.log(`Remote debugging enabled on port ${debugPort}`);
const appStartTime = Date.now();

function logStartup(message) {
  const elapsed = Date.now() - appStartTime;
  console.log(`[startup +${elapsed}ms] ${message}`);
}

let languageToolPort = process.env.LANGUAGETOOL_PORT ?? "8010";
let languageToolProcess = null;
let languageToolError = null;
let languageToolErrorShown = false;
let languageToolDiagnostics = null;
const correctionsEngine = createCorrectionsEngine({
  grammarChecker: checkGrammarWithLanguageTool,
  llmChecker: analyzeWithLlm
});

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

  logStartup("LanguageTool start");

  const cacheDir = path.join(app.getPath("userData"), "languagetool");
  const bundledDir = path.join(process.resourcesPath, "languagetool");

  try {
    languageToolPort = await findAvailablePort(languageToolPort);
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
    logStartup("LanguageTool spawned");

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

function findAvailablePort(preferredPort) {
  return new Promise((resolve) => {
    const port = Number(preferredPort) || 8010;
    const server = net.createServer();

    server.once("error", () => {
      server.close(() => {
        resolve(findAvailablePort(port + 1));
      });
    });

    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        resolve(String(address.port));
      });
    });
  });
}

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

app.whenReady().then(() => {
  logStartup("App ready");
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

ipcMain.handle("select-directory", async () => {
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

ipcMain.handle("get-last-directory", async () => readLastDirectory());

ipcMain.handle("set-last-directory", async (_event, payload) =>
  writeLastDirectory(payload)
);

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
  } catch (error) {
    return { ok: false, error: "Directory not found." };
  }
});

ipcMain.handle("set-corrections-directory", async (_event, directory) => {
  await correctionsEngine.setDirectory(directory);
  return { ok: true };
});

ipcMain.handle("list-text-files", async (_event, payload) =>
  listTextFilesInWorker(payload)
);

ipcMain.handle("read-file", async (_event, filePath) => fileOps.readFile(filePath));

ipcMain.handle("create-new-file", async (_event, directory) =>
  fileOps.createNewFile(directory)
);

ipcMain.handle("create-folder", async (_event, payload) => fileOps.createFolder(payload));

ipcMain.handle("rename-file", async (_event, payload) => fileOps.renameFile(payload));

ipcMain.handle("delete-file", async (_event, payload) => fileOps.deleteFile(payload));

ipcMain.handle("add-spelling-exception", async (_event, payload) =>
  {
    const fileCorrections = correctionsEngine.getFileCorrections(payload?.filePath);
    if (!fileCorrections) {
      return { error: "No active file." };
    }
    return fileCorrections.ignoreWord(payload?.word);
  }
);

ipcMain.handle("add-dismissed-change", async (_event, payload) =>
  {
    const fileCorrections = correctionsEngine.getFileCorrections(payload?.filePath);
    if (!fileCorrections) {
      return { error: "No active file." };
    }
    return fileCorrections.dismissIssue({ issue: payload?.issue, text: payload?.text });
  }
);

ipcMain.handle("apply-issue", async (_event, payload) => {
  const fileCorrections = correctionsEngine.getFileCorrections(payload?.filePath);
  if (!fileCorrections) {
    return { error: "No active file." };
  }
  return fileCorrections.applyIssue({ issue: payload?.issue, text: payload?.text ?? "" });
});

ipcMain.handle("save-and-commit", async (_event, payload) => fileOps.saveAndCommit(payload));

ipcMain.handle("get-git-sync-status", async (_event, directory) =>
  fileOps.getGitStatus(directory, { fetch: true })
);

ipcMain.handle("sync-with-origin", async (_event, directory) =>
  fileOps.syncWithOrigin(directory)
);

async function listTextFilesInWorker(payload) {
  return new Promise((resolve) => {
    const worker = new Worker(new URL("./workers/list-files-worker.js", import.meta.url), {
      workerData: payload ?? {}
    });

    worker.once("message", (message) => {
      resolve(message);
      worker.terminate();
    });

    worker.once("error", (error) => {
      resolve({ files: [], error: error?.message || "Failed to list files." });
      worker.terminate();
    });

    worker.once("exit", (code) => {
      if (code !== 0) {
        resolve({ files: [], error: `Worker exited with code ${code}` });
      }
    });
  });
}

async function readLastDirectory() {
  try {
    const filePath = path.join(app.getPath("userData"), "last-directory.json");
    const content = await fs.readFile(filePath, "utf8");
    const data = JSON.parse(content);
    if (data?.directory) {
      return { path: data.directory, display: data.display ?? data.directory };
    }
  } catch (error) {
    // ignore
  }
  return { path: null };
}

async function writeLastDirectory(payload) {
  const directory = payload?.directory ?? payload;
  if (!directory) {
    return { ok: false };
  }
  try {
    const filePath = path.join(app.getPath("userData"), "last-directory.json");
    const display = payload?.display ?? directory;
    const content = JSON.stringify({ directory, display }, null, 2);
    await fs.writeFile(filePath, content, "utf8");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || "Failed to save directory." };
  }
}

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
    return fileCorrections.runAnalysis({ text: payload?.text ?? "" });
  }
);

async function getGitStatus(directory, { fetch = true } = {}) {
  const repoRoot = await resolveRepoRoot(directory);
  if (!repoRoot) {
    return { available: false };
  }

  let fetchError = null;
  if (fetch) {
    try {
      await runGit(["fetch", "--prune"], repoRoot);
    } catch (error) {
      fetchError = error?.stderr || error?.message || "Fetch failed";
    }
  }

  let branch = "";
  let upstream = "";
  let ahead = 0;
  let behind = 0;
  let dirty = false;
  let statusSummary = "";

  try {
    branch = (await runGit(["rev-parse", "--abbrev-ref", "HEAD"], repoRoot)).stdout.trim();
  } catch (error) {
    branch = "";
  }

  try {
    upstream = (
      await runGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], repoRoot)
    ).stdout.trim();
  } catch (error) {
    upstream = "";
  }

  if (upstream) {
    try {
      const counts = (
        await runGit(["rev-list", "--left-right", "--count", "HEAD...@{upstream}"], repoRoot)
      ).stdout.trim();
      const [aheadCount, behindCount] = counts.split(/\s+/).map((value) => Number(value));
      ahead = Number.isFinite(aheadCount) ? aheadCount : 0;
      behind = Number.isFinite(behindCount) ? behindCount : 0;
    } catch (error) {
      ahead = 0;
      behind = 0;
    }
  }

  try {
    dirty = (await runGit(["status", "--porcelain"], repoRoot)).stdout.trim().length > 0;
    statusSummary = (await runGit(["status", "-sb"], repoRoot)).stdout.trim();
  } catch (error) {
    dirty = false;
    statusSummary = "";
  }

  return {
    available: true,
    repoRoot,
    branch,
    upstream,
    ahead,
    behind,
    dirty,
    statusSummary,
    fetchError
  };
}

async function checkGrammarWithLanguageTool(text) {
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
      const isSpelling = match.rule?.issueType === "misspelling";
      const word = isSpelling ? (text ?? "").slice(start, start + length) : undefined;
      return {
        id: `grammar-${index}-${start}`,
        type: isSpelling ? "spell" : "grammar",
        word,
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
}

async function analyzeWithLlm(text) {
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
}
