import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { FileOpsAPI } from "../../../src/main/file-ops/api.js";

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

async function withTempDir(testFn) {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "editor-file-ops-"));
  try {
    await testFn(tmpDir);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

async function withBareRemote(testFn) {
  const remoteDir = await mkdtemp(path.join(os.tmpdir(), "editor-file-ops-remote-"));
  try {
    await runGit(["init", "--bare"], remoteDir);
    await testFn(remoteDir);
  } finally {
    await rm(remoteDir, { recursive: true, force: true });
  }
}

describe("file ops API", () => {
  describe("list scenarios", () => {
    it("lists text files recursively without a glob", async () => {
      await withTempRepo(async (tmpDir) => {
        const api = new FileOpsAPI();
        await writeFile(path.join(tmpDir, "a.md"), "", "utf8");
        await writeFile(path.join(tmpDir, "b.yml"), "", "utf8");
        await writeFile(path.join(tmpDir, "c.txt"), "", "utf8");
        await writeFile(path.join(tmpDir, "image.png"), "", "utf8");

        const nestedDir = path.join(tmpDir, "nested");
        await mkdir(nestedDir, { recursive: true });
        await writeFile(path.join(nestedDir, "n.md"), "", "utf8");
        await writeFile(path.join(nestedDir, "n.yml"), "", "utf8");

        const result = await api.listTextFiles({ directory: tmpDir });
        const names = result.files.map((file) => file.relativePath).sort();

        assert.deepEqual(names, ["a.md", "b.yml", "c.txt", "nested/n.md", "nested/n.yml"]);
      });
    });

    it("applies a non-recursive glob", async () => {
      await withTempRepo(async (tmpDir) => {
        const api = new FileOpsAPI();
        await writeFile(path.join(tmpDir, "a.md"), "", "utf8");
        await writeFile(path.join(tmpDir, "b.yml"), "", "utf8");

        const nestedDir = path.join(tmpDir, "nested");
        await mkdir(nestedDir, { recursive: true });
        await writeFile(path.join(nestedDir, "n.md"), "", "utf8");

        const result = await api.listTextFiles({ directory: tmpDir, pattern: "*.md" });
        const names = result.files.map((file) => file.relativePath).sort();

        assert.deepEqual(names, ["a.md"]);
      });
    });

    it("applies a recursive glob", async () => {
      await withTempRepo(async (tmpDir) => {
        const api = new FileOpsAPI();
        await writeFile(path.join(tmpDir, "a.md"), "", "utf8");
        await writeFile(path.join(tmpDir, "b.yml"), "", "utf8");

        const nestedDir = path.join(tmpDir, "nested");
        await mkdir(nestedDir, { recursive: true });
        await writeFile(path.join(nestedDir, "n.md"), "", "utf8");

        const result = await api.listTextFiles({ directory: tmpDir, pattern: "**/*.md" });
        const names = result.files.map((file) => file.relativePath).sort();

        assert.deepEqual(names, ["a.md", "nested/n.md"]);
      });
    });

    it("truncates file list to the limit and flags too many", async () => {
      await withTempRepo(async (tmpDir) => {
        const api = new FileOpsAPI();
        await writeFile(path.join(tmpDir, "a.md"), "", "utf8");
        await writeFile(path.join(tmpDir, "b.md"), "", "utf8");
        await writeFile(path.join(tmpDir, "c.md"), "", "utf8");

        const result = await api.listTextFiles({ directory: tmpDir, limit: 2 });
        const names = result.files.map((file) => file.relativePath).sort();

        assert.equal(result.tooMany, true);
        assert.deepEqual(names, ["a.md", "b.md"]);
      });
    });

    it("lists files in worker", async () => {
      await withTempRepo(async (tmpDir) => {
        const api = new FileOpsAPI();
        await writeFile(path.join(tmpDir, "a.md"), "", "utf8");
        const result = await api.listTextFilesInWorker({ directory: tmpDir });
        const names = result.files.map((file) => file.relativePath).sort();

        assert.deepEqual(names, ["a.md"]);
        assert.equal(result.tooMany, false);
        assert.equal(result.error, undefined);
      });
    });

    it("returns an error when worker cannot list files", async () => {
      const api = new FileOpsAPI();
      const result = await api.listTextFilesInWorker({ directory: "/missing-directory" });

      assert.deepEqual(result.files, []);
      assert.equal(result.tooMany, false);
      assert.ok(result.error);
    });
  });

  describe("create scenarios", () => {
    it("creates a new file, stages it, and deletes with commit", async () => {
      await withTempRepo(async (tmpDir) => {
        const api = new FileOpsAPI();
        const date = new Date("2026-06-23T10:00:00");
        const created = await api.createNewFile(tmpDir, { date });
        assert.ok(created.path, "new file path returned");

        const statusAfterCreate = (await runGit(["status", "--porcelain"], tmpDir)).stdout.trim();
        assert.match(statusAfterCreate, /^A\s+/m);

        await runGit(["commit", "-m", "Initial add"], tmpDir);

        const deleteResult = await api.deleteFile({
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
        const api = new FileOpsAPI();
        const subDir = path.join(tmpDir, "posts");
        await mkdir(subDir, { recursive: true });

        const date = new Date("2026-06-23T10:00:00");
        const created = await api.createNewFile(subDir, { date });
        assert.ok(created.path, "new file path returned");
        assert.ok(created.path.includes("posts"), "file created in subdirectory");

        const statusAfterCreate = (await runGit(["status", "--porcelain"], tmpDir)).stdout.trim();
        assert.match(statusAfterCreate, /^A\s+posts\//m);
      });
    });

    it("uses generic default frontmatter when none exists", async () => {
      await withTempRepo(async (tmpDir) => {
        const api = new FileOpsAPI();
        const date = new Date("2026-06-23T10:00:00");

        const created = await api.createNewFile(tmpDir, { date });
        const expected = [
          "---",
          "layout: post",
          "title: \"New post\"",
          "date: 2026-06-23",
          "categories: []",
          "tags: []",
          "draft: true",
          "---",
          ""
        ].join("\n");

        assert.equal(created.content, expected);
      });
    });

    it("uses repo frontmatter when creating in a subdirectory", async () => {
      await withTempRepo(async (tmpDir) => {
        const api = new FileOpsAPI();
        const frontmatter = "---\nlayout: note\ntitle: \"Custom\"\n---\n";
        await writeFile(path.join(tmpDir, ".frontmatter.txt"), frontmatter, "utf8");

        const subDir = path.join(tmpDir, "posts");
        await mkdir(subDir, { recursive: true });

        const date = new Date("2026-06-23T10:00:00");
        const created = await api.createNewFile(subDir, { date });

        assert.equal(created.content, frontmatter);
      });
    });

    it("prefers the closest frontmatter file when multiple exist", async () => {
      await withTempRepo(async (tmpDir) => {
        const api = new FileOpsAPI();
        const rootFrontmatter = "---\nlayout: root\n---\n";
        await writeFile(path.join(tmpDir, ".frontmatter.txt"), rootFrontmatter, "utf8");

        const subDir = path.join(tmpDir, "posts");
        await mkdir(subDir, { recursive: true });
        const nestedFrontmatter = "---\nlayout: nested\n---\n";
        await writeFile(path.join(subDir, ".frontmatter.txt"), nestedFrontmatter, "utf8");

        const date = new Date("2026-06-23T10:00:00");
        const created = await api.createNewFile(subDir, { date });

        assert.equal(created.content, nestedFrontmatter);
      });
    });
  });

  describe("folder scenarios", () => {
    it("creates a folder in a directory", async () => {
      await withTempRepo(async (tmpDir) => {
        const api = new FileOpsAPI();
        const result = await api.createFolder({ directory: tmpDir, name: "drafts" });
        assert.ok(result.path);
        assert.equal(path.basename(result.path), "drafts");
      });
    });

    it("rejects a duplicate folder name", async () => {
      await withTempRepo(async (tmpDir) => {
        const api = new FileOpsAPI();
        await mkdir(path.join(tmpDir, "drafts"));
        const result = await api.createFolder({ directory: tmpDir, name: "drafts" });
        assert.match(result.error, /already exists/);
      });
    });

    it("rejects a nested folder name", async () => {
      await withTempRepo(async (tmpDir) => {
        const api = new FileOpsAPI();
        const result = await api.createFolder({ directory: tmpDir, name: "bad/name" });
        assert.match(result.error, /must not include path separators/);
      });
    });
  });

  describe("delete scenarios", () => {
    it("deletes a staged file", async () => {
      await withTempRepo(async (tmpDir) => {
        const api = new FileOpsAPI();
        const filePath = path.join(tmpDir, "staged.md");
        await writeFile(filePath, "Hello", "utf8");
        await runGit(["add", "staged.md"], tmpDir);

        const statusBefore = (await runGit(["status", "--porcelain"], tmpDir)).stdout.trim();
        assert.match(statusBefore, /^A\s+staged.md/m);

        const deleteResult = await api.deleteFile({
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
        const api = new FileOpsAPI();
        const filePath = path.join(tmpDir, "staged-changes.md");
        await writeFile(filePath, "First", "utf8");
        await runGit(["add", "staged-changes.md"], tmpDir);
        await writeFile(filePath, "Second", "utf8");

        const statusBefore = (await runGit(["status", "--porcelain"], tmpDir)).stdout.trim();
        assert.match(statusBefore, /^AM\s+staged-changes.md/m);

        const deleteResult = await api.deleteFile({
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
        const api = new FileOpsAPI();
        const filePath = path.join(tmpDir, "tracked.md");
        await writeFile(filePath, "Baseline", "utf8");
        await runGit(["add", "tracked.md"], tmpDir);
        await runGit(["commit", "-m", "Add tracked file"], tmpDir);

        await writeFile(filePath, "Modified", "utf8");

        const statusBefore = (await runGit(["status", "--porcelain"], tmpDir)).stdout.trim();
        assert.match(statusBefore, /^M\s+tracked.md/m);

        const deleteResult = await api.deleteFile({
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
        const api = new FileOpsAPI();
        const filePath = path.join(tmpDir, "temp.md");
        await writeFile(filePath, "Temp", "utf8");
        await runGit(["add", "temp.md"], tmpDir);

        const deleteResult = await api.deleteFile({
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

  describe("rename scenarios", () => {
    it("renames a file in a repo and commits", async () => {
      await withTempRepo(async (tmpDir) => {
        const api = new FileOpsAPI();
        const repoDir = await realpath(tmpDir);
        const filePath = path.join(repoDir, "rename.md");
        await writeFile(filePath, "Hello", "utf8");
        await runGit(["add", "rename.md"], repoDir);
        await runGit(["commit", "-m", "Add rename"], repoDir);

        const result = await api.renameFile({
          oldPath: filePath,
          newName: "renamed.md",
          messageShort: "Rename file",
          messageLong: ""
        });

        assert.equal(result.error, undefined);
        assert.ok(result.path.endsWith("renamed.md"));
        const statusAfter = (await runGit(["status", "--porcelain"], repoDir)).stdout.trim();
        assert.equal(statusAfter, "");
      });
    });

    it("renames a file outside a repo without committing", async () => {
      await withTempDir(async (tmpDir) => {
        const api = new FileOpsAPI();
        const filePath = path.join(tmpDir, "rename.md");
        await writeFile(filePath, "Hello", "utf8");

        const result = await api.renameFile({
          oldPath: filePath,
          newName: "renamed.md"
        });

        assert.equal(result.error, undefined);
        assert.ok(result.path.endsWith("renamed.md"));
      });
    });
  });

  describe("save scenarios", () => {
    it("writes file contents without staging", async () => {
      await withTempRepo(async (tmpDir) => {
        const api = new FileOpsAPI();
        const filePath = path.join(tmpDir, "draft.md");
        await writeFile(filePath, "Initial", "utf8");
        await runGit(["add", "draft.md"], tmpDir);
        await runGit(["commit", "-m", "Add draft"], tmpDir);

        const result = await api.saveFile({ filePath, content: "Updated" });
        assert.equal(result?.error, undefined);

        const statusAfter = (await runGit(["status", "--porcelain"], tmpDir)).stdout.trim();
        assert.match(statusAfter, /^M\s+draft\.md$/m);
      });
    });
  });

  describe("image save scenarios", () => {
    it("saves a clipboard image to the repo images directory and stages it", async () => {
      await withTempRepo(async (tmpDir) => {
        const api = new FileOpsAPI();
        const imagesDir = path.join(tmpDir, "images");
        await mkdir(imagesDir, { recursive: true });

        await writeFile(path.join(imagesDir, "image1.png"), "one", "utf8");
        await writeFile(path.join(imagesDir, "image3.png"), "three", "utf8");

        const result = await api.saveImage({
          directory: tmpDir,
          buffer: Buffer.from("clipboard"),
          extension: "png"
        });

        assert.equal(result.error, undefined);
        assert.equal(result.relativePath, "images/image4.png");

        const statusAfter = (await runGit(["status", "--porcelain"], tmpDir)).stdout.trim();
        assert.match(statusAfter, /^A\s+images\/image4\.png$/m);
      });
    });

    it("uses repo-root images_dir from frontmatter", async () => {
      await withTempRepo(async (tmpDir) => {
        const api = new FileOpsAPI();
        const postsDir = path.join(tmpDir, "posts");
        await mkdir(postsDir, { recursive: true });
        const filePath = path.join(postsDir, "draft.md");
        const frontmatter = [
          "---",
          "title: Test",
          "images_dir: /assets/images/",
          "---",
          ""
        ].join("\n");
        await writeFile(filePath, frontmatter, "utf8");

        const result = await api.saveImage({
          filePath,
          buffer: Buffer.from("clipboard"),
          extension: "png"
        });

        assert.equal(result.error, undefined);
        assert.equal(result.relativePath, "assets/images/image1.png");

        const statusAfter = (await runGit(["status", "--porcelain"], tmpDir)).stdout.trim();
        assert.match(statusAfter, /^A\s+assets\/images\/image1\.png$/m);
      });
    });

    it("uses relative images_dir from frontmatter", async () => {
      await withTempRepo(async (tmpDir) => {
        const api = new FileOpsAPI();
        const postsDir = path.join(tmpDir, "posts");
        await mkdir(postsDir, { recursive: true });
        const filePath = path.join(postsDir, "draft.md");
        const frontmatter = [
          "---",
          "title: Test",
          "images_dir: \"media/images\"",
          "---",
          ""
        ].join("\n");
        await writeFile(filePath, frontmatter, "utf8");

        const result = await api.saveImage({
          filePath,
          buffer: Buffer.from("clipboard"),
          extension: "png"
        });

        assert.equal(result.error, undefined);
        assert.equal(result.relativePath, "posts/media/images/image1.png");

        const statusAfter = (await runGit(["status", "--porcelain"], tmpDir)).stdout.trim();
        assert.match(statusAfter, /^A\s+posts\/media\/images\/image1\.png$/m);
      });
    });

    it("creates images_dir when missing", async () => {
      await withTempRepo(async (tmpDir) => {
        const api = new FileOpsAPI();
        const postsDir = path.join(tmpDir, "posts");
        await mkdir(postsDir, { recursive: true });
        const filePath = path.join(postsDir, "draft.md");
        const frontmatter = [
          "---",
          "title: Test",
          "images_dir: assets/missing-images",
          "---",
          ""
        ].join("\n");
        await writeFile(filePath, frontmatter, "utf8");

        const result = await api.saveImage({
          filePath,
          buffer: Buffer.from("clipboard"),
          extension: "png"
        });

        assert.equal(result.error, undefined);
        assert.equal(result.relativePath, "posts/assets/missing-images/image1.png");

        const statusAfter = (await runGit(["status", "--porcelain"], tmpDir)).stdout.trim();
        assert.match(statusAfter, /^A\s+posts\/assets\/missing-images\/image1\.png$/m);
      });
    });

    it("saves a dragged file into images and increments across extensions", async () => {
      await withTempRepo(async (tmpDir) => {
        const api = new FileOpsAPI();
        const imagesDir = path.join(tmpDir, "images");
        await mkdir(imagesDir, { recursive: true });

        await writeFile(path.join(imagesDir, "image2.jpg"), "two", "utf8");
        await writeFile(path.join(imagesDir, "image5.png"), "five", "utf8");

        const sourcePath = path.join(tmpDir, "drop.gif");
        await writeFile(sourcePath, "gif", "utf8");

        const result = await api.saveImage({
          directory: tmpDir,
          sourcePath
        });

        assert.equal(result.error, undefined);
        assert.equal(result.relativePath, "images/image6.gif");

        const statusAfter = (await runGit(["status", "--porcelain"], tmpDir)).stdout.trim();
        assert.match(statusAfter, /^A\s+images\/image6\.gif$/m);
      });
    });

    it("returns an error when saving without a repo", async () => {
      await withTempDir(async (tmpDir) => {
        const api = new FileOpsAPI();
        const imagesDir = path.join(tmpDir, "images");
        await mkdir(imagesDir, { recursive: true });

        const result = await api.saveImage({
          directory: tmpDir,
          buffer: Buffer.from("clipboard"),
          extension: "png"
        });

        assert.ok(result.error);
      });
    });
  });

  describe("commit scenarios", () => {
    it("saves and commits a file in a repo", async () => {
      await withTempRepo(async (tmpDir) => {
        const api = new FileOpsAPI();
        const filePath = path.join(tmpDir, "draft.md");
        await writeFile(filePath, "Initial", "utf8");
        await runGit(["add", "draft.md"], tmpDir);
        await runGit(["commit", "-m", "Add draft"], tmpDir);

        const result = await api.saveAndCommit({
          path: filePath,
          content: "Updated",
          messageShort: "Update draft",
          messageLong: ""
        });

        assert.equal(result?.error, undefined);
        const log = (await runGit(["log", "--oneline", "-1"], tmpDir)).stdout.trim();
        assert.match(log, /Update draft/);
      });
    });

    it("returns an error when save and commit has no repo", async () => {
      await withTempDir(async (tmpDir) => {
        const api = new FileOpsAPI();
        const filePath = path.join(tmpDir, "draft.md");
        await writeFile(filePath, "Initial", "utf8");

        const result = await api.saveAndCommit({
          path: filePath,
          content: "Updated",
          messageShort: "Update draft",
          messageLong: ""
        });

        assert.ok(result.error);
      });
    });
  });

  describe("git status scenarios", () => {
    it("returns unavailable for non-git directories", async () => {
      await withTempDir(async (tmpDir) => {
        const api = new FileOpsAPI();
        const result = await api.getGitStatus(tmpDir, { fetch: false });
        assert.equal(result.available, false);
      });
    });

    it("returns status with upstream when configured", async () => {
      await withBareRemote(async (remoteDir) => {
        await withTempRepo(async (tmpDir) => {
          const api = new FileOpsAPI();
          await runGit(["remote", "add", "origin", remoteDir], tmpDir);
          await writeFile(path.join(tmpDir, "readme.md"), "Hello", "utf8");
          await runGit(["add", "readme.md"], tmpDir);
          await runGit(["commit", "-m", "Initial"], tmpDir);
          await runGit(["push", "-u", "origin", "HEAD"], tmpDir);

          const status = await api.getGitStatus(tmpDir, { fetch: false });
          assert.equal(status.available, true);
          assert.ok(status.upstream);
          assert.equal(status.ahead, 0);
          assert.equal(status.behind, 0);
        });
      });
    });
  });

  describe("sync scenarios", () => {
    it("pushes when ahead of origin", async () => {
      await withBareRemote(async (remoteDir) => {
        await withTempRepo(async (tmpDir) => {
          const api = new FileOpsAPI();
          await runGit(["remote", "add", "origin", remoteDir], tmpDir);
          await writeFile(path.join(tmpDir, "readme.md"), "Hello", "utf8");
          await runGit(["add", "readme.md"], tmpDir);
          await runGit(["commit", "-m", "Initial"], tmpDir);
          await runGit(["push", "-u", "origin", "HEAD"], tmpDir);

          await writeFile(path.join(tmpDir, "readme.md"), "Hello again", "utf8");
          await runGit(["add", "readme.md"], tmpDir);
          await runGit(["commit", "-m", "Update"], tmpDir);

          const status = await api.syncWithOrigin(tmpDir);
          assert.equal(status.error, undefined);
          assert.equal(status.available, true);
          assert.equal(status.ahead, 0);
        });
      });
    });

    it("pulls when behind origin", async () => {
      await withBareRemote(async (remoteDir) => {
        await withTempRepo(async (tmpDir) => {
          const api = new FileOpsAPI();
          await runGit(["remote", "add", "origin", remoteDir], tmpDir);
          await writeFile(path.join(tmpDir, "readme.md"), "Hello", "utf8");
          await runGit(["add", "readme.md"], tmpDir);
          await runGit(["commit", "-m", "Initial"], tmpDir);
          await runGit(["push", "-u", "origin", "HEAD"], tmpDir);

          const cloneDir = await mkdtemp(path.join(os.tmpdir(), "editor-file-ops-clone-"));
          try {
            await runGit(["clone", remoteDir, cloneDir], os.tmpdir());
            await runGit(["config", "user.email", "test@example.com"], cloneDir);
            await runGit(["config", "user.name", "Test User"], cloneDir);
            await writeFile(path.join(cloneDir, "readme.md"), "Remote update", "utf8");
            await runGit(["add", "readme.md"], cloneDir);
            await runGit(["commit", "-m", "Remote update"], cloneDir);
            await runGit(["push"], cloneDir);
          } finally {
            await rm(cloneDir, { recursive: true, force: true });
          }

          const status = await api.syncWithOrigin(tmpDir);
          assert.equal(status.error, undefined);
          assert.equal(status.available, true);
          assert.equal(status.behind, 0);
        });
      });
    });
  });
});
