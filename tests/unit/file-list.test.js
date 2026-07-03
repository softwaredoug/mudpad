import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { FileList } from "../../src/renderer/components/file-list.js";
import { createFileServiceMock } from "../helpers/service-mocks.js";
import { loadRendererTemplates, createTemplateFetch } from "../helpers/template-mocks.js";


test("FileList", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body><div id=\"files\"></div></body></html>", {
    url: "http://localhost/"
  });
  const { document } = dom.window;
  const mountEl = document.getElementById("files");
  const templates = await loadRendererTemplates();
  global.fetch = createTemplateFetch(templates);

  var opened = null;
  const fileList = new FileList({
    mountEl,
    fileService: createFileServiceMock(),
    modalMount: document.body,
    window: dom.window,
    onFileOpen: (path) => {
      opened = path;
    }
  });
  await fileList.ensureReady();

  await t.test("renders items and handles double-click", async () => {
    fileList.setFiles({
      activeDirectory: "/tmp",
      files: [
        { path: "/tmp/a.md", relativePath: "a.md" },
        { path: "/tmp/b.md", relativePath: "b.md" }
      ]
    });
    fileList.setActiveFilePath("/tmp/b.md");

    const items = mountEl.querySelectorAll(".file-item");
    assert.equal(items.length, 2);
    assert.ok(items[1].classList.contains("active"));

    items[0].dispatchEvent(new dom.window.MouseEvent("dblclick", { bubbles: true }));
    assert.equal(opened, "/tmp/a.md");
  });

  await t.test("shows empty copy based on directory state", async () => {
    fileList.setFiles({ activeDirectory: null, files: [] });
    const listEl = mountEl.querySelector(".files-list");
    assert.equal(listEl.textContent.trim(), "Select a folder to begin");
  });

  await t.test("shows a warning when too many files are listed", async () => {
    fileList.setFiles({
      activeDirectory: "/tmp",
      files: [{ path: "/tmp/a.md", relativePath: "a.md" }],
      tooMany: true
    });

    const warning = mountEl.querySelector(".files-warning");
    assert.ok(warning);
    assert.match(warning.textContent, /Too many files to list/);
    assert.match(warning.textContent, /⚠️/);
  });
});


test("Updating file list", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body><div id=\"files\"></div></body></html>", {
    url: "http://localhost/"
  });
  const { document } = dom.window;
  const mountEl = document.getElementById("files");
  const templates = await loadRendererTemplates();
  global.fetch = createTemplateFetch(templates);

  var overrides = {
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

  const fileList = new FileList({
    mountEl,
    fileService: createFileServiceMock(
      overrides
    ),
    modalMount: document.body,
    window: dom.window,
    onFileOpen: (_path) => {
    }
  });
  await fileList.ensureReady();
  const listEl = mountEl.querySelector(".files-list");
  assert.ok(listEl);

  await t.test("once fulfilled it populates", async () => {
    var result = fileList.refreshFileList({
      directory: "/tmp/posts",
      pattern: "*"});
    // confirm something is rendered
    result.then(() => {
      const listEl = mountEl.querySelector(".files-list");
      assert.ok(listEl);
      const items = mountEl.querySelectorAll(".file-item");
      assert.equal(items.length, 2);
    });
  })

});

