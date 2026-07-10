import path from "path";
import fs from "fs/promises";
import https from "https";
import { execFile } from "child_process";
import { fileURLToPath } from "url";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");
const version = process.env.JRE_VERSION ?? "17";
const arch = process.env.JRE_ARCH ?? (process.arch === "arm64" ? "arm64" : "x64");
const adoptiumArch = arch === "arm64" ? "aarch64" : arch === "x64" ? "x64" : null;

if (!adoptiumArch) {
  throw new Error(`Unsupported macOS architecture: ${process.arch}`);
}

const outputDir = path.join(rootDir, "resources", "jre", arch);
const tempDir = path.join(rootDir, ".cache", `jre-${arch}`);
const downloadUrl =
  process.env.JRE_DOWNLOAD_URL ??
  `https://api.adoptium.net/v3/binary/latest/${version}/ga/mac/${adoptiumArch}/jdk/hotspot/normal/eclipse`;
const modules = [
  "java.base",
  "java.compiler",
  "java.datatransfer",
  "java.desktop",
  "java.logging",
  "java.management",
  "java.naming",
  "java.net.http",
  "java.prefs",
  "java.rmi",
  "java.scripting",
  "java.security.jgss",
  "java.security.sasl",
  "java.sql",
  "java.transaction.xa",
  "java.xml",
  "jdk.crypto.ec",
  "jdk.httpserver",
  "jdk.unsupported"
].join(",");

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        resolve(downloadFile(response.headers.location, destination));
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`JRE download failed (${response.statusCode})`));
        return;
      }
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", async () => {
        try {
          await fs.writeFile(destination, Buffer.concat(chunks));
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    }).on("error", reject);
  });
}

async function findJmods(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "jmods") {
        return candidate;
      }
      const found = await findJmods(candidate);
      if (found) return found;
    }
  }
  return null;
}

await fs.mkdir(path.dirname(outputDir), { recursive: true });
if (await exists(path.join(outputDir, "bin", "java")) && process.env.FORCE_JRE !== "1") {
  console.log(`Bundled ${arch} JRE already exists at ${outputDir}`);
  process.exit(0);
}

await fs.rm(tempDir, { recursive: true, force: true });
await fs.mkdir(tempDir, { recursive: true });
const archivePath = path.join(tempDir, "jdk.tar.gz");
console.log(`Downloading ${arch} JDK from Adoptium...`);
await downloadFile(downloadUrl, archivePath);
await execFileAsync("tar", ["-xzf", archivePath, "-C", tempDir]);

const jmodsDir = await findJmods(tempDir);
if (!jmodsDir) {
  throw new Error("Unable to locate JDK jmods directory.");
}
const javaHome = path.dirname(jmodsDir);
const jlink = path.join(javaHome, "bin", "jlink");
if (!(await exists(jlink))) {
  throw new Error(`Unable to locate jlink at ${jlink}.`);
}

await fs.rm(outputDir, { recursive: true, force: true });
await execFileAsync(jlink, [
  "--module-path", jmodsDir,
  "--add-modules", modules,
  "--strip-debug",
  "--no-man-pages",
  "--no-header-files",
  "--compress=2",
  "--output", outputDir
]);
await fs.rm(tempDir, { recursive: true, force: true });
console.log(`Bundled ${arch} JRE at ${outputDir}`);
