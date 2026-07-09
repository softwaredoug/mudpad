import { test } from "node:test";
import assert from "node:assert/strict";
import { setupApp } from "./setup.js";

test("AppComponent, file selection", async (t) => {
  const { dom, document, app } = await setupApp({
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
      },
      async readFile(path) {
        return { path, content: "Hello from file" };
      }
    }
  });

  const fileService = app.fileService;

  const selectButton = document.querySelector(".select-directory-button");
  selectButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  await t.test("select directory and open file", async () => {
    const fileItem = document.querySelector(".file-item");
    fileItem.dispatchEvent(new dom.window.MouseEvent("dblclick", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const editorRoot = document.querySelector(".cm-content");
    assert.ok(editorRoot);
    assert.equal(editorRoot.textContent, "Hello from file");
  });

  await t.test("selecting file makes it active", async () => {
    const fileItems = document.querySelectorAll(".file-item");
    assert.equal(fileItems.length, 2);
    fileItems[1].dispatchEvent(new dom.window.MouseEvent("dblclick", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const activeFileItems = document.querySelectorAll(".file-item.active");
    assert.equal(activeFileItems.length, 1);
    assert.equal(activeFileItems[0].textContent, "b.md");
  });

  await t.test("select file saves last file", async () => {
    const fileItems = document.querySelectorAll(".file-item");
    fileItems[1].dispatchEvent(new dom.window.MouseEvent("dblclick", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const lastCall = fileService.setLastFilePath.lastCall();
    assert.equal(lastCall[0], "/tmp/posts/b.md");
  });

  await t.test("rename modal opens for active file", async () => {
    const fileItems = document.querySelectorAll(".file-item");
    const target = fileItems[0];
    target.dispatchEvent(new dom.window.MouseEvent("dblclick", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    target.dispatchEvent(new dom.window.MouseEvent("dblclick", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const renameModal = document.querySelector("#rename-modal");
    assert.ok(renameModal);
    assert.ok(!renameModal.classList.contains("hidden"));
  });

  await t.test("delete modal opens from rename modal", async () => {
    const fileItems = document.querySelectorAll(".file-item");
    const target = fileItems[0];
    target.dispatchEvent(new dom.window.MouseEvent("dblclick", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    target.dispatchEvent(new dom.window.MouseEvent("dblclick", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const deleteButton = document.querySelector("#rename-delete");
    deleteButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const deleteModal = document.querySelector("#delete-modal");
    assert.ok(deleteModal);
    assert.ok(!deleteModal.classList.contains("hidden"));
  });

  await t.test("new folder modal opens", async () => {
    const newFolderButton = document.querySelector(".new-folder-button");
    newFolderButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const newFolderModal = document.querySelector("#new-folder-modal");
    assert.ok(newFolderModal);
    assert.ok(!newFolderModal.classList.contains("hidden"));
  });
});
