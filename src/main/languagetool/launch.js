import { spawn } from "child_process";
import { resolveLanguageToolJar } from "./download.js";
import { resolveJavaCommand } from "./java.js";

const DEFAULT_STARTUP_GRACE_MS = 5000;

function bufferStderrLines(text, stderrBuffer, onStderrLine) {
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      stderrBuffer.push(line);
      if (stderrBuffer.length > 20) {
        stderrBuffer.shift();
      }
      if (onStderrLine) {
        onStderrLine(line);
      }
    });
}

export async function startLanguageTool({
  cacheDir,
  bundledDir,
  port,
  onProcess,
  onExit,
  onError,
  onRedownload,
  onStdout,
  onStderrLine,
  startupGraceMs = DEFAULT_STARTUP_GRACE_MS
} = {}) {
  const diagnostics = {
    javaCommand: null,
    jarPath: null,
    stderr: []
  };

  let retried = false;
  let activeProcess = null;

  const spawnAttempt = async ({ forceRedownload } = {}) => {
    const jarPath = await resolveLanguageToolJar({
      cacheDir,
      bundledDir,
      forceRedownload
    });
    const javaCommand = await resolveJavaCommand();
    diagnostics.jarPath = jarPath;
    diagnostics.javaCommand = javaCommand;

    const args = ["-jar", jarPath, "--port", port];
    const child = spawn(javaCommand, args, { stdio: ["ignore", "pipe", "pipe"] });
    const startTime = Date.now();

    activeProcess = child;
    if (onProcess) {
      onProcess(child);
    }

    child.stdout.on("data", (chunk) => {
      if (onStdout) {
        onStdout(chunk);
      } else {
        process.stdout.write(chunk);
      }
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      process.stderr.write(chunk);
      bufferStderrLines(text, diagnostics.stderr, onStderrLine);
    });

    child.on("error", (error) => {
      if (error?.code === "ENOENT") {
        if (onError) {
          onError({ type: "java-missing", error, diagnostics });
        }
        return;
      }

      if (!retried) {
        retried = true;
        if (onRedownload) {
          onRedownload({ reason: "spawn-error", error, diagnostics });
        }
        void restart();
        return;
      }

      if (onError) {
        onError({ type: "spawn-error", error, diagnostics });
      }
    });

    child.on("exit", (code) => {
      activeProcess = null;

      if (code && code !== 0) {
        const uptime = Date.now() - startTime;
        if (!retried && uptime < startupGraceMs) {
          retried = true;
          if (onRedownload) {
            onRedownload({ reason: "early-exit", code, diagnostics });
          }
          void restart();
          return;
        }
      }

      if (onExit) {
        onExit({ code, diagnostics });
      }
    });
  };

  const restart = async () => {
    try {
      await spawnAttempt({ forceRedownload: true });
    } catch (error) {
      if (onError) {
        onError({ type: "redownload", error, diagnostics });
      }
    }
  };

  try {
    await spawnAttempt({ forceRedownload: false });
  } catch (error) {
    if (!retried) {
      retried = true;
      if (onRedownload) {
        onRedownload({ reason: "resolve-error", error, diagnostics });
      }
      await spawnAttempt({ forceRedownload: true });
      return { diagnostics, getProcess: () => activeProcess };
    }
    throw error;
  }

  return { diagnostics, getProcess: () => activeProcess };
}
