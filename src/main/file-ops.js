import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export async function listMarkdownFiles(directory) {
  if (!directory) {
    return { files: [] };
  }

  const rootDir = directory;
  const ignoredDirs = new Set([".git", "node_modules", "dist", "resources", ".languagetool"]);
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
      if (ext === ".md" || ext === ".markdown") {
        files.push({
          path: fullPath,
          relativePath: path.relative(rootDir, fullPath)
        });
      }
    }
  }

  await walk(rootDir);
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return { files };
}

export async function readFile(filePath) {
  if (!filePath) {
    return null;
  }
  const content = await fs.readFile(filePath, "utf8");
  return { path: filePath, content };
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
    } catch (error) {
      break;
    }
  }

  const frontmatter = [
    "---",
    "layout: post",
    "title: \"New blog article\"",
    "description: \"A new blog by Doug\"",
    "category: blog",
    "draft: true",
    "---",
    ""
  ].join("\n");

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
    } catch (error) {
      // Ignore if not a git repo.
    }
  }
  return { path: filePath, content: frontmatter };
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
  } catch (error) {
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

export async function readSpellingExceptions(directory) {
  if (!directory) {
    return { words: [] };
  }
  const filePath = path.join(directory, ".spelling-exceptions");
  try {
    const content = await fs.readFile(filePath, "utf8");
    const words = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    return { words };
  } catch (error) {
    return { words: [] };
  }
}

export async function addSpellingException({ directory, word }) {
  if (!directory) {
    return { error: "No directory selected." };
  }
  if (!word || !word.trim()) {
    return { error: "No word provided." };
  }

  const filePath = path.join(directory, ".spelling-exceptions");
  let words = [];
  try {
    const content = await fs.readFile(filePath, "utf8");
    words = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    words = [];
  }

  const normalized = word.trim();
  const normalizedLower = normalized.toLowerCase();
  const existing = new Set(words.map((entry) => entry.toLowerCase()));
  if (!existing.has(normalizedLower)) {
    words.push(normalized);
    await fs.writeFile(filePath, `${words.join("\n")}\n`, "utf8");
  }

  return { words };
}

async function resolveRepoRoot(startDir) {
  try {
    const result = await runGit(["rev-parse", "--show-toplevel"], startDir);
    return result.stdout.trim();
  } catch (error) {
    try {
      const inside = await runGit(["rev-parse", "--is-inside-work-tree"], startDir);
      if (inside.stdout.trim() === "true") {
        return startDir;
      }
    } catch (innerError) {
      // ignore
    }
    return null;
  }
}

async function runGit(args, cwd) {
  return execFileAsync("git", args, { cwd });
}

async function normalizePath(targetPath) {
  try {
    return await fs.realpath(targetPath);
  } catch (error) {
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
