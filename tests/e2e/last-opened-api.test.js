import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { LastOpenedAPI } from "../../src/main/last-opened/api.js";


test("LastOpenedAPI read/write", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mudpad-last-opened-"));
  t.after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const app = {
    getPath: () => tempDir
  };
  const ipcMain = {
    handle: () => {}
  };

  t.afterEach(async () => {
    // Clear the last-directory.json file after each test
    const lastOpenedFilePath = path.join(tempDir, "last-directory.json");
    await fs.rm(lastOpenedFilePath, { force: true });
  });

  await t.test("readLastDirectory returns written values", async () => {
    const api = await LastOpenedAPI.create(app, ipcMain);
    await api.writeLastDirectory({
      directory: "/tmp/posts",
      display: "Posts"
    });
    const result = await api.readLastDirectory();
    assert.equal(result.path, "/tmp/posts");
    assert.equal(result.display, "Posts");
  });

  await t.test("just writing directory leaves file null", async () => {
    const api = await LastOpenedAPI.create(app, ipcMain);
    await api.writeLastDirectory({
      directory: "/tmp/posts",
      display: "Posts"
    });
    const result = await api.readLastFilePath();
    assert.equal(result.lastFilePath, null);
  });

  await t.test("reading last file", async () => {
    const api = await LastOpenedAPI.create(app, ipcMain);
    await api.writeLastFilePath({lastFilePath: "/tmp/posts/post1.md"});
    const result = await api.readLastFilePath();
    assert.equal(result.lastFilePath, "/tmp/posts/post1.md");
  });
});
