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
  const api = await LastOpenedAPI.create(app, ipcMain);

  await t.test("readLastDirectory returns concrete values", async () => {
    await api.writeLastDirectory({
      directory: "/tmp/posts",
      display: "Posts"
    });
    const result = await api.readLastDirectory();
    assert.equal(result.path, "/tmp/posts");
    assert.equal(result.display, "Posts");
  });
});
