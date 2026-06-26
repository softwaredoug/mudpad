import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { AppComponent } from "../../src/renderer/components/app-component.js";
import { createFileServiceMock, createCorrectionsServiceMock } from "../helpers/service-mocks.js";
import { loadRendererTemplates, createTemplateFetch } from "../helpers/template-mocks.js";

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
}

describe("AppComponent (e2e)", () => {
  it("renders file list after selecting a directory", async () => {
    const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
      url: "http://localhost/",
      pretendToBeVisual: true
    });
    applyDomGlobals(dom);
    const { document } = dom.window;

    const templates = await loadRendererTemplates();
    global.fetch = createTemplateFetch(templates);

    const fileService = createFileServiceMock({
      async selectDirectory() {
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
    });

    const correctionsService = createCorrectionsServiceMock();
    const app = new AppComponent({
      mountEl: document.getElementById("root"),
      window: dom.window,
      fileService,
      correctionsService
    });

    await app.init();

    const selectButton = document.querySelector(".select-directory-button");
    selectButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const items = Array.from(document.querySelectorAll(".file-item"));
    assert.equal(items.length, 2);
    assert.equal(items[0].textContent, "a.md");
    assert.equal(items[1].textContent, "b.md");
  });

  it("opens a file and updates editor text", async () => {
    const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
      url: "http://localhost/",
      pretendToBeVisual: true
    });
    applyDomGlobals(dom);
    const { document } = dom.window;

    const templates = await loadRendererTemplates();
    global.fetch = createTemplateFetch(templates);

    const fileService = createFileServiceMock({
      async selectDirectory() {
        return { path: "/tmp/posts" };
      },
      async listTextFiles() {
        return {
          files: [{ path: "/tmp/posts/a.md", relativePath: "a.md" }],
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

    const fileItem = document.querySelector(".file-item");
    fileItem.dispatchEvent(new dom.window.MouseEvent("dblclick", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const editorRoot = document.querySelector(".cm-content");
    assert.ok(editorRoot);
    assert.equal(editorRoot.textContent, "Hello from file");
  });
});
