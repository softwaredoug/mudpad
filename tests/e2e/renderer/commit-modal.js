import { test } from "node:test";
import assert from "node:assert/strict";
import { setupApp } from "./setup.js";

async function setupCommitApp({ fileServiceOverrides } = {}) {
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

async function openCommitModal(dom, document) {
  const selectButton = document.querySelector(".select-directory-button");
  selectButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const fileItems = document.querySelectorAll(".file-item");
  const target = fileItems[0];
  target.dispatchEvent(new dom.window.MouseEvent("dblclick", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const editorRoot = document.querySelector(".cm-content");
  editorRoot.dispatchEvent(new dom.window.KeyboardEvent("keydown", {
    key: "s",
    metaKey: true,
    bubbles: true
  }));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test("CommitModal (e2e)", async (t) => {
  await t.test("opens on cmd+s", async () => {
    const { dom, document } = await setupCommitApp();
    await openCommitModal(dom, document);

    const commitModal = document.querySelector("#commit-modal");
    assert.ok(commitModal);
    assert.ok(!commitModal.classList.contains("hidden"));
    assert.equal(commitModal.getAttribute("aria-hidden"), "false");
  });

  await t.test("cancel closes modal", async () => {
    const { dom, document } = await setupCommitApp();
    await openCommitModal(dom, document);

    const cancelButton = document.querySelector("#commit-cancel");
    cancelButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const commitModal = document.querySelector("#commit-modal");
    assert.ok(commitModal.classList.contains("hidden"));
    assert.equal(commitModal.getAttribute("aria-hidden"), "true");
  });

  await t.test("requires summary", async () => {
    const { dom, document } = await setupCommitApp();
    await openCommitModal(dom, document);

    const summaryInput = document.querySelector("#commit-summary");
    summaryInput.value = "";
    summaryInput.dispatchEvent(new dom.window.InputEvent("input", { bubbles: true }));

    const confirmButton = document.querySelector("#commit-confirm");
    confirmButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const errorLabel = document.querySelector("#commit-error");
    assert.equal(errorLabel.textContent, "Summary is required.");

    const commitModal = document.querySelector("#commit-modal");
    assert.ok(!commitModal.classList.contains("hidden"));
  });

  await t.test("submits commit", async () => {
    const { dom, document, app } = await setupCommitApp();
    await openCommitModal(dom, document);

    const summaryInput = document.querySelector("#commit-summary");
    summaryInput.value = "Commit title";
    summaryInput.dispatchEvent(new dom.window.InputEvent("input", { bubbles: true }));

    const detailsInput = document.querySelector("#commit-details");
    detailsInput.value = "Commit details";
    detailsInput.dispatchEvent(new dom.window.InputEvent("input", { bubbles: true }));

    const confirmButton = document.querySelector("#commit-confirm");
    confirmButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const lastCall = app.fileService.saveAndCommit.lastCall()[0];
    assert.equal(lastCall.path, "/tmp/posts/a.md");
    assert.equal(lastCall.content, "Hello from file");
    assert.equal(lastCall.messageShort, "Commit title");
    assert.equal(lastCall.messageLong, "Commit details");

    const commitModal = document.querySelector("#commit-modal");
    assert.ok(commitModal.classList.contains("hidden"));
  });

  await t.test("shows error when commit fails", async () => {
    const { dom, document } = await setupCommitApp({
      fileServiceOverrides: {
        async saveAndCommit() {
          return { error: "Commit failed" };
        }
      }
    });
    await openCommitModal(dom, document);

    const summaryInput = document.querySelector("#commit-summary");
    summaryInput.value = "Commit title";
    summaryInput.dispatchEvent(new dom.window.InputEvent("input", { bubbles: true }));

    const confirmButton = document.querySelector("#commit-confirm");
    confirmButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const errorLabel = document.querySelector("#commit-error");
    assert.equal(errorLabel.textContent, "Commit failed");

    const commitModal = document.querySelector("#commit-modal");
    assert.ok(!commitModal.classList.contains("hidden"));
  });

  await t.test("does not open without active file", async () => {
    const { dom, document } = await setupCommitApp();

    const editorRoot = document.querySelector(".cm-content");
    editorRoot.dispatchEvent(new dom.window.KeyboardEvent("keydown", {
      key: "s",
      metaKey: true,
      bubbles: true
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const commitModal = document.querySelector("#commit-modal");
    assert.strictEqual(commitModal, null);
  });
});
