import { test } from "node:test";
import assert from "node:assert/strict";
import { setupApp } from "./setup.js";

const defaultRepoStatus = {
  available: true,
  statusSummary: "Clean",
  branch: "main",
  upstream: "origin/main",
  ahead: 0,
  behind: 0,
  dirty: false,
  fetchError: null
};

async function setupRepoApp({ fileServiceOverrides } = {}) {
  return setupApp({
    fileServiceOverrides: {
      async showDirectoryPicker() {
        return { path: "/tmp/posts" };
      },
      async listTextFiles() {
        return {
          files: [
            { path: "/tmp/posts/a.md", relativePath: "a.md" }
          ],
          tooMany: false
        };
      },
      async getGitSyncStatus() {
        return defaultRepoStatus;
      },
      ...fileServiceOverrides
    }
  });
}

async function openRepoModal(document) {
  const selectButton = document.querySelector(".select-directory-button");
  selectButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const repoButton = document.querySelector("#repo-status");
  repoButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test("RepoModal (e2e)", async (t) => {
  await t.test("opens from repo status button", async () => {
    const { document } = await setupRepoApp();
    await openRepoModal(document);

    const repoModal = document.querySelector("#repo-modal");
    assert.ok(repoModal);
    assert.ok(!repoModal.classList.contains("hidden"));
    assert.equal(repoModal.getAttribute("aria-hidden"), "false");
  });

  await t.test("does not open when repo unavailable", async () => {
    const { document } = await setupRepoApp({
      fileServiceOverrides: {
        async getGitSyncStatus() {
          return { available: false };
        }
      }
    });

    const selectButton = document.querySelector(".select-directory-button");
    selectButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const repoButton = document.querySelector("#repo-status");
    assert.ok(repoButton.classList.contains("hidden"));

    repoButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const repoModal = document.querySelector("#repo-modal");
    assert.equal(repoModal, null);
  });

  await t.test("renders repo status details", async () => {
    const { document } = await setupRepoApp({
      fileServiceOverrides: {
        async getGitSyncStatus() {
          return {
            ...defaultRepoStatus,
            statusSummary: "Ahead 2",
            branch: "feature",
            upstream: "origin/feature",
            ahead: 2,
            behind: 1,
            dirty: true
          };
        }
      }
    });
    await openRepoModal(document);

    const summary = document.querySelector("#repo-status-summary");
    const details = document.querySelector("#repo-status-details");
    assert.equal(summary.textContent, "Ahead 2");
    assert.ok(details.textContent.includes("Branch: feature"));
    assert.ok(details.textContent.includes("Upstream: origin/feature"));
    assert.ok(details.textContent.includes("Ahead 2, behind 1"));
    assert.ok(details.textContent.includes("Working tree: dirty"));
  });

  await t.test("sync button triggers syncWithOrigin", async () => {
    const { document, app } = await setupRepoApp({
      fileServiceOverrides: {
        async syncWithOrigin() {
          return { ...defaultRepoStatus, statusSummary: "Synced" };
        }
      }
    });
    await openRepoModal(document);

    const syncButton = document.querySelector("#repo-sync");
    syncButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const lastCall = app.fileService.syncWithOrigin.lastCall()[0];
    assert.equal(lastCall, "/tmp/posts");
  });

  await t.test("sync error shows message", async () => {
    const { document } = await setupRepoApp({
      fileServiceOverrides: {
        async syncWithOrigin() {
          return { error: "Sync failed" };
        }
      }
    });
    await openRepoModal(document);

    const syncButton = document.querySelector("#repo-sync");
    syncButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const errorLabel = document.querySelector("#repo-status-error");
    assert.equal(errorLabel.textContent, "Sync failed");
  });

  await t.test("close hides modal", async () => {
    const { document } = await setupRepoApp();
    await openRepoModal(document);

    const closeButton = document.querySelector("#repo-close");
    closeButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const repoModal = document.querySelector("#repo-modal");
    assert.ok(repoModal.classList.contains("hidden"));
    assert.equal(repoModal.getAttribute("aria-hidden"), "true");
  });

  await t.test("sync refreshes status", async () => {
    const { document } = await setupRepoApp({
      fileServiceOverrides: {
        async syncWithOrigin() {
          return {
            ...defaultRepoStatus,
            statusSummary: "Synced",
            ahead: 0,
            behind: 0
          };
        }
      }
    });
    await openRepoModal(document);

    const syncButton = document.querySelector("#repo-sync");
    syncButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const summary = document.querySelector("#repo-status-summary");
    assert.equal(summary.textContent, "Synced");
  });
});
