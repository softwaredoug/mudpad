import { test } from "node:test";
import assert from "node:assert/strict";
import { setupApp } from "./setup.js";

async function setupRenameApp({ fileServiceOverrides } = {}) {
  return setupApp({
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
      },
      ...fileServiceOverrides
    }
  });
}

async function openRenameModal(dom, document) {
  const selectButton = document.querySelector(".select-directory-button");
  selectButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const fileItems = document.querySelectorAll(".file-item");
  const target = fileItems[0];
  target.dispatchEvent(new dom.window.MouseEvent("dblclick", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  target.dispatchEvent(new dom.window.MouseEvent("dblclick", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test("RenameModal (e2e)", async (t) => {
  await t.test("opens on active file double-click", async () => {
    const { dom, document } = await setupRenameApp();
    await openRenameModal(dom, document);

    const renameModal = document.querySelector("#rename-modal");
    assert.ok(renameModal);
    assert.ok(!renameModal.classList.contains("hidden"));
    assert.equal(renameModal.getAttribute("aria-hidden"), "false");
  });

  await t.test("renames file and closes modal", async () => {
    const { dom, document, app } = await setupRenameApp();
    await openRenameModal(dom, document);

    const input = document.querySelector("#rename-input");
    input.value = "renamed.md";
    input.dispatchEvent(new dom.window.InputEvent("input", { bubbles: true }));

    const confirmButton = document.querySelector("#rename-confirm");
    confirmButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const lastCall = app.fileService.renameFile.lastCall()[0];
    assert.equal(lastCall.oldPath, "/tmp/posts/a.md");
    assert.equal(lastCall.newName, "renamed.md");

    const renameModal = document.querySelector("#rename-modal");
    assert.ok(renameModal.classList.contains("hidden"));
    assert.equal(renameModal.getAttribute("aria-hidden"), "true");
  });

  await t.test("shows error when rename fails", async () => {
    const { dom, document } = await setupRenameApp({
      fileServiceOverrides: {
        async renameFile() {
          return { error: "Rename failed" };
        }
      }
    });
    await openRenameModal(dom, document);

    const confirmButton = document.querySelector("#rename-confirm");
    confirmButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const errorLabel = document.querySelector("#rename-error");
    assert.equal(errorLabel.textContent, "Rename failed");

    const renameModal = document.querySelector("#rename-modal");
    assert.ok(!renameModal.classList.contains("hidden"));
  });

  await t.test("cancel closes modal", async () => {
    const { dom, document } = await setupRenameApp();
    await openRenameModal(dom, document);

    const cancelButton = document.querySelector("#rename-cancel");
    cancelButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const renameModal = document.querySelector("#rename-modal");
    assert.ok(renameModal.classList.contains("hidden"));
  });

  await t.test("delete opens delete modal", async () => {
    const { dom, document } = await setupRenameApp();
    await openRenameModal(dom, document);

    const deleteButton = document.querySelector("#rename-delete");
    deleteButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const deleteModal = document.querySelector("#delete-modal");
    assert.ok(deleteModal);
    assert.ok(!deleteModal.classList.contains("hidden"));

    const renameModal = document.querySelector("#rename-modal");
    assert.ok(renameModal.classList.contains("hidden"));
  });

  await t.test("shows git fields when repo available", async () => {
    const { dom, document } = await setupRenameApp({
      fileServiceOverrides: {
        async getGitSyncStatus() {
          return { available: true, ahead: 0, behind: 0, upstream: true };
        }
      }
    });
    await openRenameModal(dom, document);

    const gitFields = document.querySelector("#rename-git-fields");
    assert.ok(gitFields);
    assert.ok(!gitFields.classList.contains("hidden"));
  });

  await t.test("requires commit summary when repo available", async () => {
    const { dom, document } = await setupRenameApp({
      fileServiceOverrides: {
        async getGitSyncStatus() {
          return { available: true, ahead: 0, behind: 0, upstream: true };
        }
      }
    });
    await openRenameModal(dom, document);

    const summaryInput = document.querySelector("#rename-summary");
    summaryInput.value = "";
    summaryInput.dispatchEvent(new dom.window.InputEvent("input", { bubbles: true }));

    const confirmButton = document.querySelector("#rename-confirm");
    confirmButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const errorLabel = document.querySelector("#rename-error");
    assert.equal(errorLabel.textContent, "Commit summary is required.");
  });

  await t.test("sends git summary and details on rename", async () => {
    const { dom, document, app } = await setupRenameApp({
      fileServiceOverrides: {
        async getGitSyncStatus() {
          return { available: true, ahead: 0, behind: 0, upstream: true };
        }
      }
    });
    await openRenameModal(dom, document);

    const input = document.querySelector("#rename-input");
    input.value = "renamed.md";
    input.dispatchEvent(new dom.window.InputEvent("input", { bubbles: true }));

    const summaryInput = document.querySelector("#rename-summary");
    summaryInput.value = "Rename file";
    summaryInput.dispatchEvent(new dom.window.InputEvent("input", { bubbles: true }));

    const detailsInput = document.querySelector("#rename-details");
    detailsInput.value = "More detail";
    detailsInput.dispatchEvent(new dom.window.InputEvent("input", { bubbles: true }));

    const confirmButton = document.querySelector("#rename-confirm");
    confirmButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const lastCall = app.fileService.renameFile.lastCall()[0];
    assert.equal(lastCall.messageShort, "Rename file");
    assert.equal(lastCall.messageLong, "More detail");
  });
});
