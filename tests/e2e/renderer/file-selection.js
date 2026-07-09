import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { AppComponent } from "../../../src/renderer/components/app-component.js";
import { createFileServiceMock, createCorrectionsServiceMock } from "../../helpers/service-mocks.js";
import { loadRendererTemplates, createTemplateFetch } from "../../helpers/template-mocks.js";

function applyDomGlobals(dom) {
  global.window = dom.window;
  global.document = dom.window.document;
  global.Window = dom.window.Window;
  global.MutationObserver = dom.window.MutationObserver;
  global.HTMLElement = dom.window.HTMLElement;
  global.Node = dom.window.Node;
  global.getComputedStyle = dom.window.getComputedStyle;
  global.requestAnimationFrame = dom.window.requestAnimationFrame;
  global.cancelAnimationFrame = dom.window.cancelAnimationFrame;
  if (dom.window.Range && !dom.window.Range.prototype.getClientRects) {
    dom.window.Range.prototype.getClientRects = () => [];
  }
}

test("AppComponent, file selection", async (t) => {
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true
  });
  applyDomGlobals(dom);
  const { document } = dom.window;

  const templates = await loadRendererTemplates();
  global.fetch = createTemplateFetch(templates);

  const fileService = createFileServiceMock({
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
  });

  const app = new AppComponent({
    mountEl: document.getElementById("root"),
    window: dom.window,
    fileService,
    correctionsService: createCorrectionsServiceMock()
  });

  await app.init();

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
    const lastCall = fileService.setLastFilePath.calls[fileService.setLastFilePath.calls.length - 1];
    assert.equal(lastCall[0], "/tmp/posts/b.md");
  });
});
