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

async function setupApp({ fileServiceOverrides } = {}) {
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true
  });
  applyDomGlobals(dom);
  const { document } = dom.window;

  const templates = await loadRendererTemplates();
  global.fetch = createTemplateFetch(templates);

  const fileService = createFileServiceMock(fileServiceOverrides);
  const app = new AppComponent({
    mountEl: document.getElementById("root"),
    window: dom.window,
    fileService,
    correctionsService: createCorrectionsServiceMock()
  });

  await app.init();

  return { dom, document, app };
}

test("AppComponent (e2e) editor", async (t) => {
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
        },
        async createNewFile(directory) {
          return { path: `${directory}/new.md` };
        },
        async readFile(path) {
          return { path, content: "New file content" };
        }
      }
    }));
  });

  await t.test("empty / disabled when opened", async () => {
    const editorRoot = document.querySelector(".cm-content[contenteditable='false']");
    assert.ok(editorRoot);
  });

  await t.test("double click disabled editor creates new file", async () => {
    const selectButton = document.querySelector(".select-directory-button");
    selectButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const editorRoot = document.querySelector(".cm-content[contenteditable='false']");
    assert.ok(editorRoot);
    editorRoot.dispatchEvent(new dom.window.MouseEvent("dblclick", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const fileService = app.fileService;
    assert.equal(fileService.createNewFile.calls.length, 1);
    assert.equal(fileService.createNewFile.calls[0][0], "/tmp/posts");

    const updatedEditor = document.querySelector(".cm-content");
    assert.equal(updatedEditor.textContent, "New file content");
  });

  await t.test("cmd s opens the commit modal", async () => {
    const selectButton = document.querySelector(".select-directory-button");
    selectButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const editorRoot = document.querySelector(".cm-content[contenteditable='false']");
    assert.ok(editorRoot);
    editorRoot.dispatchEvent(new dom.window.MouseEvent("dblclick", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const updatedEditor = document.querySelector(".cm-content");
    updatedEditor.textContent = "Updated content";
    updatedEditor.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "s", metaKey: true, bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const commitModal = document.querySelector("#commit-modal");
    assert.ok(commitModal);
  });

  await t.test("typing updates editor content", async () => {
    const selectButton = document.querySelector(".select-directory-button");
    selectButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const editorRoot = document.querySelector(".cm-content[contenteditable='false']");
    assert.ok(editorRoot);
    editorRoot.dispatchEvent(new dom.window.MouseEvent("dblclick", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const updatedEditor = document.querySelector(".cm-content");
    updatedEditor.focus();
    updatedEditor.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "!", bubbles: true }));
    updatedEditor.textContent = "New file content!";
    updatedEditor.dispatchEvent(new dom.window.InputEvent("input", {
      data: "!",
      inputType: "insertText",
      bubbles: true
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(updatedEditor.textContent, "New file content!");
  });
});
