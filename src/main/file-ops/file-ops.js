import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import fg from "fast-glob";

const execFileAsync = promisify(execFile);
const DEFAULT_FILE_LIST_LIMIT = 1000;

export async function listTextFiles({ directory, pattern, limit = DEFAULT_FILE_LIST_LIMIT } = {}) {
  if (!directory) {
    return { files: [], tooMany: false };
  }

  const rootDir = directory;
  const ignoredDirs = new Set([".git", "node_modules", "dist", "resources", ".languagetool"]);
  const textExtensions = new Set([
    ".md",
    ".markdown",
    ".mdx",
    ".txt",
    ".yml",
    ".yaml",
    ".json",
    ".toml",
    ".ini",
    ".cfg",
    ".conf",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".py",
    ".rb",
    ".go",
    ".rs",
    ".java",
    ".kt",
    ".swift",
    ".c",
    ".h",
    ".cpp",
    ".hpp",
    ".cs",
    ".php",
    ".sh",
    ".bash",
    ".zsh",
    ".sql",
    ".graphql",
    ".gql",
    ".xml",
    ".html",
    ".css",
    ".scss",
    ".less"
  ]);
  const files = [];

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (ignoredDirs.has(entry.name)) {
          continue;
        }
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (textExtensions.has(ext)) {
        files.push({
          path: fullPath,
          relativePath: path.relative(rootDir, fullPath)
        });
      }
    }
  }

  if (pattern) {
    const matches = await fg(pattern, {
      cwd: rootDir,
      onlyFiles: true,
      dot: false,
      unique: true,
      followSymbolicLinks: false,
      ignore: [
        "**/.git/**",
        "**/node_modules/**",
        "**/dist/**",
        "**/resources/**",
        "**/.languagetool/**"
      ]
    });
    matches.forEach((matchPath) => {
      const ext = path.extname(matchPath).toLowerCase();
      if (!textExtensions.has(ext)) {
        return;
      }
      const fullPath = path.join(rootDir, matchPath);
      files.push({
        path: fullPath,
        relativePath: matchPath
      });
    });
  } else {
    await walk(rootDir);
  }

  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  const maxFiles = Number.isFinite(limit) ? Math.max(0, limit) : DEFAULT_FILE_LIST_LIMIT;
  const tooMany = files.length > maxFiles;
  const trimmedFiles = tooMany ? files.slice(0, maxFiles) : files;
  return { files: trimmedFiles, tooMany };
}

export async function readFile(filePath) {
  if (!filePath) {
    return null;
  }
  const content = await fs.readFile(filePath, "utf8");
  return { path: filePath, content };
}

export async function saveFile({ filePath, content }) {
  if (!filePath) {
    return { error: "No file selected." };
  }
  await fs.writeFile(filePath, content ?? "", "utf8");
  return { path: filePath };
}

export async function createNewFile(directory, { date = new Date() } = {}) {
  if (!directory) {
    return { error: "No directory selected." };
  }

  const baseName = formatNewFileName(date);
  let fileName = `${baseName}.md`;
  let filePath = path.join(directory, fileName);
  let counter = 1;

  while (true) {
    try {
      await fs.access(filePath);
      fileName = `${baseName}-(${counter}).md`;
      filePath = path.join(directory, fileName);
      counter += 1;
    } catch {
      break;
    }
  }

  const defaultFrontmatter = [
    "---",
    "layout: post",
    "title: \"New blog article\"",
    "description: \"A new blog by Doug\"",
    "category: blog",
    "draft: true",
    "---",
    ""
  ].join("\n");
  const frontmatter = await resolveFrontmatter(directory, defaultFrontmatter);

  await fs.writeFile(filePath, frontmatter, "utf8");
  const repoRoot = await resolveRepoRoot(directory);
  if (repoRoot) {
    const repoRootResolved = await normalizePath(repoRoot);
    const filePathResolved = await normalizePath(filePath);
    const relativePath = path.relative(repoRootResolved, filePathResolved);
    if (!relativePath.startsWith("..")) {
      await runGit(["add", "-A", "--", relativePath], repoRootResolved);
      const status = await runGit(["status", "--porcelain", "--", relativePath], repoRootResolved);
      if (status.stdout.trim().startsWith("??")) {
        await runGit(["add", "-f", "--", relativePath], repoRootResolved);
        const forcedStatus = await runGit(["status", "--porcelain", "--", relativePath], repoRootResolved);
        if (forcedStatus.stdout.trim().startsWith("??")) {
          await runGit(["add", "-f", "--", filePathResolved], repoRootResolved);
        }
      }
    } else {
      await runGit(["add", "-f", "--", filePathResolved], repoRootResolved);
    }
  } else {
    try {
      await runGit(["add", "-A", "--", filePath], directory);
    } catch {
      // Ignore if not a git repo.
    }
  }
  return { path: filePath, content: frontmatter };
}

export async function createFolder({ directory, name }) {
  if (!directory) {
    return { error: "No directory selected." };
  }
  if (!name || !name.trim()) {
    return { error: "Folder name is required." };
  }
  if (name.includes("/") || name.includes("\\")) {
    return { error: "Folder name must not include path separators." };
  }

  const folderPath = path.join(directory, name.trim());
  try {
    await fs.mkdir(folderPath);
    return { path: folderPath };
  } catch (error) {
    if (error.code === "EEXIST") {
      return { error: "Folder already exists." };
    }
    return { error: error?.message || "Failed to create folder." };
  }
}

export async function saveImage({ directory, filePath, sourcePath, buffer, extension, mimeType } = {}) {
  const startDir = directory || (filePath ? path.dirname(filePath) : null);
  if (!startDir) {
    return { error: "No directory selected." };
  }

  const repoRoot = await resolveRepoRoot(startDir);
  if (!repoRoot) {
    return { error: "No git repository found." };
  }

  const resolvedImagesDir = await resolveImagesDirectory({ filePath, repoRoot });
  if (resolvedImagesDir?.error) {
    return { error: resolvedImagesDir.error };
  }
  const imagesDir = resolvedImagesDir?.path ?? path.join(repoRoot, "images");
  await fs.mkdir(imagesDir, { recursive: true });

  const ext = resolveImageExtension({ sourcePath, extension, mimeType });
  const nextIndex = await resolveNextImageIndex(imagesDir);
  const fileName = `image${nextIndex}${ext}`;
  const targetPath = path.join(imagesDir, fileName);

  try {
    if (sourcePath) {
      await fs.copyFile(sourcePath, targetPath);
    } else if (buffer) {
      const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
      await fs.writeFile(targetPath, data);
    } else {
      return { error: "No image data provided." };
    }
  } catch (error) {
    return { error: error?.message || "Failed to save image." };
  }

  const relativePath = path.relative(repoRoot, targetPath);
  try {
    await runGit(["add", "-A", "--", relativePath], repoRoot);
  } catch (error) {
    return { error: error?.stderr || error?.message || "Failed to stage image." };
  }

  return { path: targetPath, relativePath, repoRoot, fileName };
}

export async function saveAndCommit({ path: filePath, content, messageShort, messageLong }) {
  if (!filePath) {
    return { error: "No file selected." };
  }
  if (!messageShort || !messageShort.trim()) {
    return { error: "Commit summary is required." };
  }

  try {
    const repoRoot = await resolveRepoRoot(path.dirname(filePath));
    if (!repoRoot) {
      return { error: "No git repository found for this file." };
    }

    await fs.writeFile(filePath, content ?? "", "utf8");
    const repoRootResolved = await normalizePath(repoRoot);
    const filePathResolved = await normalizePath(filePath);
    const relativePath = path.relative(repoRootResolved, filePathResolved);
    if (relativePath.startsWith("..")) {
      return { error: "File is outside the git repository." };
    }

    await runGit(["add", relativePath], repoRootResolved);
    const commitArgs = ["commit", "-m", messageShort.trim()];
    if (messageLong && messageLong.trim()) {
      commitArgs.push("-m", messageLong.trim());
    }
    await runGit(commitArgs, repoRootResolved);
    return { path: filePath };
  } catch (error) {
    const detail = error?.stderr || error?.message || "Commit failed.";
    return { error: detail };
  }
}

export async function renameFile({ oldPath, newName, messageShort, messageLong }) {
  if (!oldPath) {
    return { error: "No file selected." };
  }
  if (!newName || !newName.trim()) {
    return { error: "New filename is required." };
  }
  if (newName.includes("/") || newName.includes("\\")) {
    return { error: "Filename must not include path separators." };
  }

  const directory = path.dirname(oldPath);
  const newPath = path.join(directory, newName.trim());

  try {
    await fs.access(newPath);
    return { error: "A file with that name already exists." };
  } catch {
    // continue
  }

  const repoRoot = await resolveRepoRoot(directory);
  if (repoRoot) {
    if (!messageShort || !messageShort.trim()) {
      return { error: "Commit summary is required." };
    }
    const repoRootResolved = await normalizePath(repoRoot);
    const oldPathResolved = await normalizePath(oldPath);
    const newPathResolved = await normalizePath(newPath);
    const relativeOld = path.relative(repoRootResolved, oldPathResolved);
    const relativeNew = path.relative(repoRootResolved, newPathResolved);
    if (relativeOld.startsWith("..") || relativeNew.startsWith("..")) {
      return { error: "File is outside the git repository." };
    }
    try {
      await runGit(["mv", relativeOld, relativeNew], repoRootResolved);
    } catch (error) {
      const message = error?.stderr || error?.message || "";
      if (!message.includes("not under version control")) {
        return { error: message || "Rename failed." };
      }
      try {
        await fs.rename(oldPath, newPath);
        await runGit(["add", "-A", relativeOld, relativeNew], repoRootResolved);
      } catch (renameError) {
        return { error: renameError?.message || "Rename failed." };
      }
    }

    try {
      const commitArgs = ["commit", "-m", messageShort.trim()];
      if (messageLong && messageLong.trim()) {
        commitArgs.push("-m", messageLong.trim());
      }
      await runGit(commitArgs, repoRootResolved);
      return { path: newPath };
    } catch (error) {
      return { error: error?.stderr || error?.message || "Commit failed." };
    }
  }

  try {
    await fs.rename(oldPath, newPath);
    return { path: newPath };
  } catch (error) {
    return { error: error?.message || "Rename failed." };
  }
}

export async function deleteFile({ filePath, messageShort, messageLong }) {
  if (!filePath) {
    return { error: "No file selected." };
  }

  const directory = path.dirname(filePath);
  const repoRoot = await resolveRepoRoot(directory);
  if (repoRoot) {
    if (!messageShort || !messageShort.trim()) {
      return { error: "Commit summary is required." };
    }
    const repoRootResolved = await normalizePath(repoRoot);
    const filePathResolved = await normalizePath(filePath);
    const relativePath = path.relative(repoRootResolved, filePathResolved);
    if (relativePath.startsWith("..")) {
      return { error: "File is outside the git repository." };
    }
    try {
      await runGit(["rm", relativePath], repoRootResolved);
    } catch (error) {
      const message = error?.stderr || error?.message || "";
      if (
        message.includes("changes staged in the index") ||
        message.includes("staged content different") ||
        message.includes("local modifications")
      ) {
        try {
          await runGit(["rm", "-f", relativePath], repoRootResolved);
        } catch (forceError) {
          return { error: forceError?.stderr || forceError?.message || "Delete failed." };
        }
      } else if (message.includes("restore --staged")) {
        try {
          await runGit(["restore", "--staged", relativePath], repoRootResolved);
          await runGit(["rm", relativePath], repoRootResolved);
        } catch (retryError) {
          return { error: retryError?.stderr || retryError?.message || "Delete failed." };
        }
      } else {
        return { error: message || "Delete failed." };
      }
    }

    const statusAfter = (await runGit(["status", "--porcelain"], repoRootResolved)).stdout.trim();
    if (!statusAfter) {
      return { path: null };
    }

    try {
      const commitArgs = ["commit", "-m", messageShort.trim()];
      if (messageLong && messageLong.trim()) {
        commitArgs.push("-m", messageLong.trim());
      }
      await runGit(commitArgs, repoRootResolved);
      return { path: null };
    } catch (error) {
      const message = error?.stderr || error?.message || "Commit failed.";
      if (message.includes("nothing to commit") || message.includes("no changes added")) {
        return { path: null };
      }
      return { error: message };
    }
  }

  try {
    await fs.unlink(filePath);
    return { path: null };
  } catch (error) {
    return { error: error?.message || "Delete failed." };
  }
}

export async function getGitStatus(directory, { fetch = true } = {}) {
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

  let branch;
  let upstream;
  let ahead = 0;
  let behind = 0;
  let dirty;
  let statusSummary;

  try {
    branch = (await runGit(["rev-parse", "--abbrev-ref", "HEAD"], repoRoot)).stdout.trim();
  } catch {
    branch = "";
  }

  try {
    upstream = (
      await runGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], repoRoot)
    ).stdout.trim();
  } catch {
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
    } catch {
      ahead = 0;
      behind = 0;
    }
  }

  try {
    dirty = (await runGit(["status", "--porcelain"], repoRoot)).stdout.trim().length > 0;
    statusSummary = (await runGit(["status", "-sb"], repoRoot)).stdout.trim();
  } catch {
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

export async function syncWithOrigin(directory) {
  if (!directory) {
    return { error: "No directory selected." };
  }

  const status = await getGitStatus(directory, { fetch: true });
  if (!status.available) {
    return { error: "No git repository found." };
  }
  if (!status.upstream) {
    return { error: "No upstream configured for this branch." };
  }

  try {
    if (status.behind > 0) {
      await runGit(["pull", "--rebase"], status.repoRoot);
    }
    if (status.ahead > 0) {
      await runGit(["push"], status.repoRoot);
    }
    return getGitStatus(status.repoRoot, { fetch: true });
  } catch (error) {
    return { error: error?.stderr || error?.message || "Sync failed." };
  }
}


async function resolveRepoRoot(startDir) {
  try {
    const result = await runGit(["rev-parse", "--show-toplevel"], startDir);
    return result.stdout.trim();
  } catch {
    try {
      const inside = await runGit(["rev-parse", "--is-inside-work-tree"], startDir);
      if (inside.stdout.trim() === "true") {
        return startDir;
      }
    } catch {
      // ignore
    }
    return null;
  }
}

async function resolveFrontmatter(startDir, fallback) {
  try {
    const repoRoot = await resolveRepoRoot(startDir);
    if (!repoRoot) {
      return fallback;
    }

    let currentDir = await normalizePath(startDir);
    const repoRootResolved = await normalizePath(repoRoot);

    while (true) {
      const candidate = path.join(currentDir, ".frontmatter.txt");
      try {
        await fs.access(candidate);
        return await fs.readFile(candidate, "utf8");
      } catch {
        // ignore
      }

      if (currentDir === repoRootResolved) {
        break;
      }

      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        break;
      }
      currentDir = parentDir;
    }
  } catch {
    // ignore
  }

  return fallback;
}

async function resolveImagesDirectory({ filePath, repoRoot } = {}) {
  const fallback = { path: path.join(repoRoot, "images") };
  if (!filePath) {
    return fallback;
  }

  let content;
  try {
    content = await fs.readFile(filePath, "utf8");
  } catch {
    return fallback;
  }

  const frontmatter = extractFrontmatterBlock(content);
  if (!frontmatter) {
    return fallback;
  }

  const imagesDirValue = parseFrontmatterValue(frontmatter, "images_dir");
  if (!imagesDirValue) {
    return fallback;
  }

  const trimmed = imagesDirValue.replace(/\/+$/, "").trim();
  if (!trimmed) {
    return fallback;
  }

  const repoRootResolved = await normalizePath(repoRoot);
  const fileDirResolved = await normalizePath(path.dirname(filePath));
  const targetDir = trimmed.startsWith("/")
    ? path.join(repoRootResolved, trimmed.slice(1))
    : path.resolve(fileDirResolved, trimmed);
  const targetResolved = await normalizePath(targetDir);
  const relative = path.relative(repoRootResolved, targetResolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return { error: "images_dir is outside the git repository." };
  }

  return { path: targetDir };
}

function extractFrontmatterBlock(content) {
  if (!content) {
    return null;
  }
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)\r?\n/);
  return match ? match[0] : null;
}

function parseFrontmatterValue(frontmatter, key) {
  if (!frontmatter || !key) {
    return null;
  }
  const regex = new RegExp(`^\\s*${key}\\s*:\\s*(.+)\\s*$`, "m");
  const match = frontmatter.match(regex);
  if (!match) {
    return null;
  }
  let value = match[1].trim();
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value || null;
}

async function runGit(args, cwd) {
  return execFileAsync("git", args, { cwd });
}

async function normalizePath(targetPath) {
  try {
    return await fs.realpath(targetPath);
  } catch {
    return path.resolve(targetPath);
  }
}

function formatNewFileName(date) {
  const pad = (value) => String(value).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  return `${year}-${month}-${day}-new-file`;
}

function resolveImageExtension({ sourcePath, extension, mimeType } = {}) {
  if (sourcePath) {
    const fromPath = path.extname(sourcePath).toLowerCase();
    if (fromPath) {
      return fromPath;
    }
  }

  if (extension) {
    const normalized = extension.startsWith(".") ? extension : `.${extension}`;
    return normalized.toLowerCase();
  }

  if (mimeType) {
    const lower = mimeType.toLowerCase();
    if (lower.includes("png")) return ".png";
    if (lower.includes("jpeg")) return ".jpg";
    if (lower.includes("jpg")) return ".jpg";
    if (lower.includes("gif")) return ".gif";
    if (lower.includes("webp")) return ".webp";
  }

  return ".png";
}

async function resolveNextImageIndex(imagesDir) {
  let maxIndex = 0;
  try {
    const entries = await fs.readdir(imagesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      const match = entry.name.match(/^image(\d+)\.[^.]+$/i);
      if (!match) {
        continue;
      }
      const value = Number(match[1]);
      if (Number.isFinite(value)) {
        maxIndex = Math.max(maxIndex, value);
      }
    }
  } catch {
    // ignore
  }

  return maxIndex + 1;
}
