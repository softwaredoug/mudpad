import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createNewFile, deleteFile, listTextFiles, saveFile } from "../../src/main/file-ops/file-ops.js";

const execFileAsync = promisify(execFile);

async function runGit(args, cwd) {
  return execFileAsync("git", args, { cwd });
}

async function withTempRepo(testFn) {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "editor-file-ops-"));
  try {
    await runGit(["init"], tmpDir);
    await runGit(["config", "user.email", "test@example.com"], tmpDir);
    await runGit(["config", "user.name", "Test User"], tmpDir);
    await testFn(tmpDir);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

describe("file operations with git", () => {
  describe("list scenarios", () => {
    it("lists text files recursively without a glob", async () => {
      await withTempRepo(async (tmpDir) => {
        await writeFile(path.join(tmpDir, "a.md"), "", "utf8");
        await writeFile(path.join(tmpDir, "b.yml"), "", "utf8");
        await writeFile(path.join(tmpDir, "c.txt"), "", "utf8");
        await writeFile(path.join(tmpDir, "image.png"), "", "utf8");

        const nestedDir = path.join(tmpDir, "nested");
        await mkdir(nestedDir, { recursive: true });
        await writeFile(path.join(nestedDir, "n.md"), "", "utf8");
        await writeFile(path.join(nestedDir, "n.yml"), "", "utf8");

        const result = await listTextFiles({ directory: tmpDir });
        const names = result.files.map((file) => file.relativePath).sort();

        assert.deepEqual(names, ["a.md", "b.yml", "c.txt", "nested/n.md", "nested/n.yml"]);
      });
    });

    it("applies a non-recursive glob", async () => {
      await withTempRepo(async (tmpDir) => {
        await writeFile(path.join(tmpDir, "a.md"), "", "utf8");
        await writeFile(path.join(tmpDir, "b.yml"), "", "utf8");

        const nestedDir = path.join(tmpDir, "nested");
        await mkdir(nestedDir, { recursive: true });
        await writeFile(path.join(nestedDir, "n.md"), "", "utf8");

        const result = await listTextFiles({ directory: tmpDir, pattern: "*.md" });
        const names = result.files.map((file) => file.relativePath).sort();

        assert.deepEqual(names, ["a.md"]);
      });
    });

    it("applies a recursive glob", async () => {
      await withTempRepo(async (tmpDir) => {
        await writeFile(path.join(tmpDir, "a.md"), "", "utf8");
        await writeFile(path.join(tmpDir, "b.yml"), "", "utf8");

        const nestedDir = path.join(tmpDir, "nested");
        await mkdir(nestedDir, { recursive: true });
        await writeFile(path.join(nestedDir, "n.md"), "", "utf8");

        const result = await listTextFiles({ directory: tmpDir, pattern: "**/*.md" });
        const names = result.files.map((file) => file.relativePath).sort();

        assert.deepEqual(names, ["a.md", "nested/n.md"]);
      });
    });

    it("truncates file list to the limit and flags too many", async () => {
      await withTempRepo(async (tmpDir) => {
        await writeFile(path.join(tmpDir, "a.md"), "", "utf8");
        await writeFile(path.join(tmpDir, "b.md"), "", "utf8");
        await writeFile(path.join(tmpDir, "c.md"), "", "utf8");

        const result = await listTextFiles({ directory: tmpDir, limit: 2 });
        const names = result.files.map((file) => file.relativePath).sort();

        assert.equal(result.tooMany, true);
        assert.deepEqual(names, ["a.md", "b.md"]);
      });
    });
  });

  describe("create scenarios", () => {
    it("creates a new file, stages it, and deletes with commit", async () => {
      await withTempRepo(async (tmpDir) => {
        const date = new Date("2026-06-23T10:00:00");
        const created = await createNewFile(tmpDir, { date });
        assert.ok(created.path, "new file path returned");

        const statusAfterCreate = (await runGit(["status", "--porcelain"], tmpDir)).stdout.trim();
        assert.match(statusAfterCreate, /^A\s+/m);

        await runGit(["commit", "-m", "Initial add"], tmpDir);

        const deleteResult = await deleteFile({
          filePath: created.path,
          messageShort: "Deleted file test",
          messageLong: ""
        });
        assert.equal(deleteResult.error, undefined);

        const statusAfterDelete = (await runGit(["status", "--porcelain"], tmpDir)).stdout.trim();
        assert.equal(statusAfterDelete, "");

        const log = (await runGit(["log", "--oneline", "-1"], tmpDir)).stdout.trim();
        assert.match(log, /Deleted file test/);
      });
    });

    it("creates a new file in a subdirectory of a repo", async () => {
      await withTempRepo(async (tmpDir) => {
        const subDir = path.join(tmpDir, "posts");
        await mkdir(subDir, { recursive: true });

        const date = new Date("2026-06-23T10:00:00");
        const created = await createNewFile(subDir, { date });
        assert.ok(created.path, "new file path returned");
        assert.ok(created.path.includes("posts"), "file created in subdirectory");

        const statusAfterCreate = (await runGit(["status", "--porcelain"], tmpDir)).stdout.trim();
        assert.match(statusAfterCreate, /^A\s+posts\//m);
      });
    });
  });

  describe("delete scenarios", () => {
    it("deletes a staged file", async () => {
      await withTempRepo(async (tmpDir) => {
        const filePath = path.join(tmpDir, "staged.md");
        await writeFile(filePath, "Hello", "utf8");
        await runGit(["add", "staged.md"], tmpDir);

        const statusBefore = (await runGit(["status", "--porcelain"], tmpDir)).stdout.trim();
        assert.match(statusBefore, /^A\s+staged.md/m);

        const deleteResult = await deleteFile({
          filePath,
          messageShort: "Delete staged file",
          messageLong: ""
        });
        assert.equal(deleteResult.error, undefined);

        const statusAfter = (await runGit(["status", "--porcelain"], tmpDir)).stdout.trim();
        assert.equal(statusAfter, "");
      });
    });

    it("deletes a staged file with working copy changes", async () => {
      await withTempRepo(async (tmpDir) => {
        const filePath = path.join(tmpDir, "staged-changes.md");
        await writeFile(filePath, "First", "utf8");
        await runGit(["add", "staged-changes.md"], tmpDir);
        await writeFile(filePath, "Second", "utf8");

        const statusBefore = (await runGit(["status", "--porcelain"], tmpDir)).stdout.trim();
        assert.match(statusBefore, /^AM\s+staged-changes.md/m);

        const deleteResult = await deleteFile({
          filePath,
          messageShort: "Delete staged file with changes",
          messageLong: ""
        });
        assert.equal(deleteResult.error, undefined);

        const statusAfter = (await runGit(["status", "--porcelain"], tmpDir)).stdout.trim();
        assert.equal(statusAfter, "");
      });
    });

    it("deletes a tracked file with unstaged changes", async () => {
      await withTempRepo(async (tmpDir) => {
        const filePath = path.join(tmpDir, "tracked.md");
        await writeFile(filePath, "Baseline", "utf8");
        await runGit(["add", "tracked.md"], tmpDir);
        await runGit(["commit", "-m", "Add tracked file"], tmpDir);

        await writeFile(filePath, "Modified", "utf8");

        const statusBefore = (await runGit(["status", "--porcelain"], tmpDir)).stdout.trim();
        assert.match(statusBefore, /^M\s+tracked.md/m);

        const deleteResult = await deleteFile({
          filePath,
          messageShort: "Delete tracked file",
          messageLong: ""
        });
        assert.equal(deleteResult.error, undefined);

        const statusAfter = (await runGit(["status", "--porcelain"], tmpDir)).stdout.trim();
        assert.equal(statusAfter, "");
      });
    });

    it("deletes a staged file that was added and then deleted", async () => {
      await withTempRepo(async (tmpDir) => {
        const filePath = path.join(tmpDir, "temp.md");
        await writeFile(filePath, "Temp", "utf8");
        await runGit(["add", "temp.md"], tmpDir);

        const deleteResult = await deleteFile({
          filePath,
          messageShort: "Delete temp file",
          messageLong: ""
        });
        assert.equal(deleteResult.error, undefined);

        const statusAfter = (await runGit(["status", "--porcelain"], tmpDir)).stdout.trim();
        assert.equal(statusAfter, "");
      });
    });
  });

  describe("save scenarios", () => {
    it("writes file contents without staging", async () => {
      await withTempRepo(async (tmpDir) => {
        const filePath = path.join(tmpDir, "draft.md");
        await writeFile(filePath, "Initial", "utf8");
        await runGit(["add", "draft.md"], tmpDir);
        await runGit(["commit", "-m", "Add draft"], tmpDir);

        const result = await saveFile({ filePath, content: "Updated" });
        assert.equal(result?.error, undefined);

        const statusAfter = (await runGit(["status", "--porcelain"], tmpDir)).stdout.trim();
        assert.match(statusAfter, /^M\s+draft\.md$/m);
      });
    });
  });
});
