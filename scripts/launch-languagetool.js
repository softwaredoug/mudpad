import { spawn } from "child_process";
import path from "path";
import fs from "fs/promises";
import { createWriteStream } from "fs";
import { fileURLToPath } from "url";
import https from "https";
import AdmZip from "adm-zip";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const cacheDir = path.join(rootDir, ".languagetool");
const downloadUrl =
  process.env.LANGUAGETOOL_DOWNLOAD_URL ??
  "https://languagetool.org/download/LanguageTool-stable.zip";

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

async function findJarInDir(dir) {
  if (!(await exists(dir))) {
    return null;
  }

  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await findJarInDir(fullPath);
      if (found) {
        return found;
      }
      continue;
    }
    if (entry.isFile() && entry.name === "languagetool-server.jar") {
      return fullPath;
    }
  }
  return null;
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400) {
        const redirect = response.headers.location;
        if (redirect) {
          response.resume();
          resolve(downloadFile(redirect, destPath));
          return;
        }
      }

      if (!response.statusCode || response.statusCode >= 400) {
        response.resume();
        reject(new Error(`Download failed (${response.statusCode})`));
        return;
      }

      const fileStream = createWriteStream(destPath);
      response.pipe(fileStream);
      fileStream.on("finish", () => fileStream.close(resolve));
      fileStream.on("error", reject);
    });

    request.on("error", reject);
  });
}

async function ensureDownloaded() {
  await fs.mkdir(cacheDir, { recursive: true });
  const zipPath = path.join(cacheDir, "LanguageTool-stable.zip");

  if (!(await exists(zipPath))) {
    console.log("Downloading LanguageTool...");
    await downloadFile(downloadUrl, zipPath);
  }

  const zip = new AdmZip(zipPath);
  zip.extractAllTo(cacheDir, true);

  const jarPath = await findJarInDir(cacheDir);
  if (!jarPath) {
    throw new Error("Unable to locate languagetool-server.jar after download.");
  }

  return jarPath;
}

async function resolveJar() {
  const jarPath = process.env.LANGUAGETOOL_JAR;
  const homeDir = process.env.LANGUAGETOOL_HOME;

  if (jarPath && (await exists(jarPath))) {
    return jarPath;
  }

  if (homeDir) {
    const candidate = path.join(homeDir, "languagetool-server.jar");
    if (await exists(candidate)) {
      return candidate;
    }
  }

  const cachedJar = await findJarInDir(cacheDir);
  if (cachedJar) {
    return cachedJar;
  }

  return ensureDownloaded();
}

const port = process.env.LANGUAGETOOL_PORT ?? "8010";

try {
  const resolvedJar = await resolveJar();
  const args = ["-jar", resolvedJar, "--port", port];
  const child = spawn("java", args, { stdio: "inherit" });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
