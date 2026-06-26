import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { RepoModal } from "../../src/renderer/modals/repo-modal.js";
import { createFileServiceMock } from "../helpers/service-mocks.js";
import { loadRendererTemplates, createTemplateFetch } from "../helpers/template-mocks.js";

function createDom() {
  return new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/"
  });
}

describe("RepoModal", () => {
  it("renders status and syncs with origin", async () => {
    const dom = createDom();
    const { window } = dom;
    const { document } = window;
    const templates = await loadRendererTemplates();
    global.fetch = createTemplateFetch(templates);

    let repoStatus = {
      available: true,
      upstream: "origin/main",
      ahead: 1,
      behind: 2,
      dirty: true,
      branch: "main",
      statusSummary: "Status summary",
      fetchError: null
    };
    let setRepoStatusArg = null;
    const fileService = createFileServiceMock({
      async syncWithOrigin() {
        return {
          available: true,
          upstream: "origin/main",
          ahead: 0,
          behind: 0,
          dirty: false,
          branch: "main",
          statusSummary: "Up to date",
          fetchError: null
        };
      }
    });

    const repoModal = new RepoModal({
      mountEl: document.body,
      window,
      fileService,
      getRepoStatus: () => repoStatus,
      setRepoStatus: (next) => {
        setRepoStatusArg = next;
        repoStatus = next;
      },
      getActiveDirectory: () => "/repo"
    });

    await repoModal.open();
    const summary = document.getElementById("repo-status-summary");
    const details = document.getElementById("repo-status-details");
    const syncButton = document.getElementById("repo-sync");

    assert.equal(summary.textContent, "Status summary");
    assert.ok(details.textContent.includes("Ahead 1, behind 2"));
    assert.equal(syncButton.disabled, false);

    syncButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.ok(setRepoStatusArg);
    assert.equal(setRepoStatusArg.ahead, 0);
    assert.ok(details.textContent.includes("Ahead 0, behind 0"));
  });

  it("shows sync errors", async () => {
    const dom = createDom();
    const { window } = dom;
    const { document } = window;
    const templates = await loadRendererTemplates();
    global.fetch = createTemplateFetch(templates);

    const fileService = createFileServiceMock({
      async syncWithOrigin() {
        return { error: "Sync failed" };
      }
    });
    const repoModal = new RepoModal({
      mountEl: document.body,
      window,
      fileService,
      getRepoStatus: () => ({
        available: true,
        upstream: "origin/main",
        ahead: 0,
        behind: 0,
        dirty: false,
        branch: "main",
        statusSummary: "Status summary",
        fetchError: null
      }),
      setRepoStatus: () => {},
      getActiveDirectory: () => "/repo"
    });

    await repoModal.open();
    const syncButton = document.getElementById("repo-sync");
    const errorLabel = document.getElementById("repo-status-error");

    syncButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(errorLabel.textContent, "Sync failed");
  });
});
