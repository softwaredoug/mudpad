import { startLanguageTool } from "./launch.js";
import path from "path";
import net from "net";
import { dialog } from "electron";


function formatLanguageToolDiagnostics(diagnostics) {
  if (!diagnostics) {
    return "";
  }

  const parts = [];
  if (diagnostics.javaCommand) {
    parts.push(`Java: ${diagnostics.javaCommand}`);
  }
  if (diagnostics.jarPath) {
    parts.push(`Jar: ${diagnostics.jarPath}`);
  }
  if (diagnostics.stderr?.length) {
    parts.push("\nLast stderr:");
    parts.push(diagnostics.stderr.join("\n"));
  }

  return parts.join("\n");
}


const PREFERRED_PORT = 8010

function findAvailablePort() {
  return new Promise((resolve) => {
    const port = PREFERRED_PORT;
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


async function startLanguageToolService(cacheDir) {
  if (process.env.DISABLE_LANGUAGETOOL === "1") {
    return;
  }

  //const cacheDir = path.join(app.getPath("userData"), "languagetool");
  const bundledDir = path.join(process.resourcesPath, "languagetool");

  try {
    let languageToolPort = await findAvailablePort();
    let languageToolProcess = null
    let languageToolDiagnostics = null;

    const { diagnostics } = await startLanguageTool({
      cacheDir,
      bundledDir,
      port: languageToolPort,
      onProcess: (processHandle) => {
        languageToolProcess = processHandle;
      },
      onRedownload: ({ reason }) => {
        console.warn(`LanguageTool redownload triggered (${reason}).`);
      },
      onError: ({ type, error }) => {
        const message = `LanguageTool failed to start: ${error.message}`;
        console.error(message);
        const isMissingJava = type === "java-missing" || error?.code === "ENOENT";
        showLanguageToolError(
          isMissingJava ? "Java not available" : "LanguageTool failed to start",
          isMissingJava
            ? "Java was not found. Install Java and relaunch the app. You can also set LANGUAGETOOL_JAVA to a full java path."
            : "Java is required. Install Java and relaunch the app."
        );
      },
      onExit: ({ code }) => {
        languageToolProcess = null;
        if (code && code !== 0) {
          const message = `LanguageTool exited with code ${code}`;
          console.error(message);
          showLanguageToolError(
            "LanguageTool exited unexpectedly",
            `The grammar server exited with code ${code}.`
          );
        }
      }
    });
    languageToolDiagnostics = diagnostics;
    return { port: languageToolPort, diagnostics: languageToolDiagnostics, process: languageToolProcess };
  } catch (error) {
    const message = `Failed to start LanguageTool: ${error.message}`;
    console.error(message);
    showLanguageToolError(
      error?.code === "BUNDLED_JAVA_MISSING" ? "Bundled Java unavailable" : "LanguageTool failed to start",
      error.message
    );
    throw error;
  }
}

function showLanguageToolError(title, details, diagnostics) {
  const diagnosticsFmtd = formatLanguageToolDiagnostics(diagnostics);
  const fullDetails = [details, diagnosticsFmtd].filter(Boolean).join("\n\n");
  dialog.showErrorBox(title, fullDetails ?? "");
}

export class LanguageToolChecker {
  constructor(port, process, diagnostics) {
    this.port = port
    this.url = `http://localhost:${port}/v2/check`;
    this.languageToolError = null;
    this.process = process;
    this.diagnostics = diagnostics;
  }

  static async create(cacheDir) {
    const { port, process, diagnostics } = await startLanguageToolService(cacheDir);
    console.log(`LanguageTool ready (Java: ${diagnostics?.javaCommand ?? "unknown"})`);
    return new LanguageToolChecker(port, process, diagnostics);
  }

  async kill() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  async check(text) {
    if (this.languageToolError) {
      return { issues: [], error: this.languageToolError };
    }

    for (let retries = 0; retries < 3; retries++) {
      try {
        const body = new URLSearchParams({
          text: text ?? "",
          language: "en-US"
        });

        const response = await fetch(this.url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body
        });

        if (!response.ok) {
          console.error(`LanguageTool error: ${response.status} ${response.statusText}`);
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
        await new Promise((resolve) => setTimeout(resolve, 500 * (retries + 1)));
        console.log(`[main +${Math.round(performance.now())}ms] LanguageTool check error: ${error.message}`);
      }
    }
    return { issues: [], error: "LanguageTool not reachable" };
  }

}
