import path from "path";
import fs from "fs/promises";
import { createWriteStream } from "fs";
import https from "https";
import AdmZip from "adm-zip";

const DEFAULT_DOWNLOAD_URL =
  process.env.LANGUAGETOOL_DOWNLOAD_URL ??
  "https://languagetool.org/download/LanguageTool-stable.zip";

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findJarInDir(dir) {
  if (!dir || !(await exists(dir))) {
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

async function ensureDownloaded({ cacheDir, downloadUrl }) {
  await fs.mkdir(cacheDir, { recursive: true });
  const zipPath = path.join(cacheDir, "LanguageTool-stable.zip");

  if (!(await exists(zipPath))) {
    console.log("Downloading LanguageTool...");
    await downloadFile(downloadUrl, zipPath);
  }

  const zip = new AdmZip(zipPath);
  zip.extractAllTo(cacheDir, true);
  await fs.unlink(zipPath).catch(() => undefined);

  const jarPath = await findJarInDir(cacheDir);
  if (!jarPath) {
    throw new Error("Unable to locate languagetool-server.jar after download.");
  }

  return jarPath;
}

export async function resolveLanguageToolJar({
  cacheDir,
  bundledDir,
  downloadUrl = DEFAULT_DOWNLOAD_URL
} = {}) {
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

  const bundledJar = await findJarInDir(bundledDir);
  if (bundledJar) {
    return bundledJar;
  }

  const cachedJar = await findJarInDir(cacheDir);
  if (cachedJar) {
    return cachedJar;
  }

  if (!cacheDir) {
    throw new Error("No cache directory available for LanguageTool download.");
  }

  return ensureDownloaded({ cacheDir, downloadUrl });
}

export async function resolveJavaCommand() {
  const explicitJava = process.env.LANGUAGETOOL_JAVA;
  if (explicitJava && (await exists(explicitJava))) {
    return explicitJava;
  }

  const javaHome = process.env.JAVA_HOME;
  if (javaHome) {
    const javaBin = path.join(javaHome, "bin", "java");
    if (await exists(javaBin)) {
      return javaBin;
    }
  }

  if (process.platform === "darwin") {
    try {
      const { execFile } = await import("child_process");
      const { promisify } = await import("util");
      const execFileAsync = promisify(execFile);
      const { stdout } = await execFileAsync("/usr/libexec/java_home");
      const resolvedHome = stdout.trim();
      if (resolvedHome) {
        const javaBin = path.join(resolvedHome, "bin", "java");
        if (await exists(javaBin)) {
          return javaBin;
        }
      }
    } catch {
      // Fall through to PATH lookup.
    }
  }

  const homeDir = process.env.HOME;
  if (homeDir) {
    const asdfJava = await findAsdfJava(path.join(homeDir, ".asdf", "installs", "java"));
    if (asdfJava) {
      return asdfJava;
    }
  }

  return "java";
}

async function findAsdfJava(installsDir) {
  if (!(await exists(installsDir))) {
    return null;
  }

  const entries = await fs.readdir(installsDir, { withFileTypes: true });
  const versions = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();

  for (const version of versions) {
    const candidate = path.join(installsDir, version, "bin", "java");
    if (await exists(candidate)) {
      return candidate;
    }
  }

  return null;
}
