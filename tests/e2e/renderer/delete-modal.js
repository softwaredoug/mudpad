import { test } from "node:test";
import assert from "node:assert/strict";
import { setupApp } from "./setup.js";

async function setupDeleteApp({ fileServiceOverrides } = {}) {
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

async function openDeleteModal(dom, document) {
  const selectButton = document.querySelector(".select-directory-button");
  selectButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const fileItems = document.querySelectorAll(".file-item");
  const target = fileItems[0];
  target.dispatchEvent(new dom.window.MouseEvent("dblclick", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  target.dispatchEvent(new dom.window.MouseEvent("dblclick", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const deleteButton = document.querySelector("#rename-delete");
  deleteButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test("DeleteModal (e2e)", async (t) => {
  await t.test("opens from rename modal delete", async () => {
    const { dom, document } = await setupDeleteApp();
    await openDeleteModal(dom, document);

    const deleteModal = document.querySelector("#delete-modal");
    assert.ok(deleteModal);
    assert.ok(!deleteModal.classList.contains("hidden"));

    const renameModal = document.querySelector("#rename-modal");
    assert.ok(renameModal.classList.contains("hidden"));
  });

  await t.test("shows file label", async () => {
    const { dom, document } = await setupDeleteApp();
    await openDeleteModal(dom, document);

    const fileLabel = document.querySelector("#delete-file-name");
    assert.ok(fileLabel);
    assert.equal(fileLabel.textContent, "Delete a.md");
  });

  await t.test("cancel closes modal", async () => {
    const { dom, document } = await setupDeleteApp();
    await openDeleteModal(dom, document);

    const cancelButton = document.querySelector("#delete-cancel");
    cancelButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const deleteModal = document.querySelector("#delete-modal");
    assert.ok(deleteModal.classList.contains("hidden"));
  });

  await t.test("confirm triggers delete", async () => {
    const { dom, document, app } = await setupDeleteApp();
    await openDeleteModal(dom, document);

    dom.window.confirm = () => true;
    const confirmButton = document.querySelector("#delete-confirm");
    confirmButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const lastCall = app.fileService.deleteFile.lastCall()[0];
    assert.equal(lastCall.filePath, "/tmp/posts/a.md");
    assert.equal(lastCall.messageShort, "");
    assert.equal(lastCall.messageLong, "");

    const deleteModal = document.querySelector("#delete-modal");
    assert.ok(deleteModal.classList.contains("hidden"));
  });

  await t.test("shows error when delete fails", async () => {
    const { dom, document } = await setupDeleteApp({
      fileServiceOverrides: {
        async deleteFile() {
          return { error: "Delete failed" };
        }
      }
    });
    await openDeleteModal(dom, document);

    dom.window.confirm = () => true;
    const confirmButton = document.querySelector("#delete-confirm");
    confirmButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const errorLabel = document.querySelector("#delete-error");
    assert.equal(errorLabel.textContent, "Delete failed");

    const deleteModal = document.querySelector("#delete-modal");
    assert.ok(!deleteModal.classList.contains("hidden"));
  });

  await t.test("shows git fields when repo available", async () => {
    const { dom, document } = await setupDeleteApp({
      fileServiceOverrides: {
        async getGitSyncStatus() {
          return { available: true, ahead: 0, behind: 0, upstream: true };
        }
      }
    });
    await openDeleteModal(dom, document);

    const gitFields = document.querySelector("#delete-git-fields");
    assert.ok(gitFields);
    assert.ok(!gitFields.classList.contains("hidden"));
  });

  await t.test("requires commit summary when repo available", async () => {
    const { dom, document } = await setupDeleteApp({
      fileServiceOverrides: {
        async getGitSyncStatus() {
          return { available: true, ahead: 0, behind: 0, upstream: true };
        }
      }
    });
    await openDeleteModal(dom, document);

    dom.window.confirm = () => true;
    const summaryInput = document.querySelector("#delete-summary");
    summaryInput.value = "";
    summaryInput.dispatchEvent(new dom.window.InputEvent("input", { bubbles: true }));

    const confirmButton = document.querySelector("#delete-confirm");
    confirmButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const errorLabel = document.querySelector("#delete-error");
    assert.equal(errorLabel.textContent, "Commit summary is required.");
  });

  await t.test("sends git summary and details on delete", async () => {
    const { dom, document, app } = await setupDeleteApp({
      fileServiceOverrides: {
        async getGitSyncStatus() {
          return { available: true, ahead: 0, behind: 0, upstream: true };
        }
      }
    });
    await openDeleteModal(dom, document);

    dom.window.confirm = () => true;
    const summaryInput = document.querySelector("#delete-summary");
    summaryInput.value = "Delete file";
    summaryInput.dispatchEvent(new dom.window.InputEvent("input", { bubbles: true }));

    const detailsInput = document.querySelector("#delete-details");
    detailsInput.value = "More detail";
    detailsInput.dispatchEvent(new dom.window.InputEvent("input", { bubbles: true }));

    const confirmButton = document.querySelector("#delete-confirm");
    confirmButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const lastCall = app.fileService.deleteFile.lastCall()[0];
    assert.equal(lastCall.messageShort, "Delete file");
    assert.equal(lastCall.messageLong, "More detail");
  });
});
