import { test } from "node:test";
import assert from "node:assert/strict";
import { setupApp } from "./setup.js";

test("AppComponent (e2e) directory list component", async (t) => {
  let dom, document, app;
  t.beforeEach(async () => {
    ({ dom, document, app } = await setupApp({
      fileServiceOverrides: {
        async showDirectoryPicker() {
          return { path: "/tmp/posts" };
        },
        async listTextFiles() {
          return {
            files: [
              { path: "/tmp/posts/a.md", relativePath: "a.md" },
              { path: "/tmp/posts/b.md", relativePath: "b.md" }
            ],
            tooMany: false
          };
        }
      }
    }));
  });

  await t.test("empty if not clicked", async () => {
    const items = Array.from(document.querySelectorAll(".file-item"));
    assert.equal(items.length, 0);
  });

  await t.test("Sends correct directory path", async () => {
    console.log("Testing directory input");
    const input = document.querySelector(".active-directory");
    input.value = "/tmp/foo/bar";
    await new Promise((resolve) => setTimeout(resolve, 0));
    input.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const fileService = app.fileService;
    assert.equal(fileService.listTextFiles.lastCall()[0].directory, "/tmp/foo/bar");
  });

  await t.test("renders file list after selecting a directory", async () => {
    const selectButton = document.querySelector(".select-directory-button");
    selectButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const items = Array.from(document.querySelectorAll(".file-item"));
    assert.equal(items.length, 2);
    assert.equal(items[0].textContent, "a.md");
    assert.equal(items[1].textContent, "b.md");
  });

  await t.test("refreshes git status after selecting a directory", async () => {
    const selectButton = document.querySelector(".select-directory-button");
    selectButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const calls = app.fileService.getGitSyncStatus.calls;
    assert.ok(calls.length > 0);
    assert.equal(calls[0][0], "/tmp/posts");
  });

  await t.test("directory input parses glob pattern", async () => {
    const input = document.querySelector(".active-directory");
    input.value = "/tmp/posts/**/*.md";
    await new Promise((resolve) => setTimeout(resolve, 0));
    input.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const call = app.fileService.listTextFiles.lastCall()[0];
    assert.equal(call.directory, "/tmp/posts");
    assert.equal(call.pattern, "**/*.md");
  });

  await t.test("shows warning when too many files", async () => {
    const { document: warningDocument } = await setupApp({
      fileServiceOverrides: {
        async showDirectoryPicker() {
          return { path: "/tmp/posts" };
        },
        async listTextFiles() {
          return {
            files: [
              { path: "/tmp/posts/a.md", relativePath: "a.md" },
              { path: "/tmp/posts/b.md", relativePath: "b.md" }
            ],
            tooMany: true
          };
        }
      }
    });

    const selectButton = warningDocument.querySelector(".select-directory-button");
    selectButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const warning = warningDocument.querySelector(".files-warning");
    assert.ok(warning);
    assert.equal(warning.textContent, "⚠️ Too many files to list. Showing first 1000.");
  });
});
