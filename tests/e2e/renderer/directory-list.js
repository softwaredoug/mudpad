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

test("AppComponent (e2e) directory list component", async (t) => {
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
        }
      }
    }));
  });

  await t.test("empty if not clicked", async () => {
    const items = Array.from(document.querySelectorAll(".file-item"));
    assert.equal(items.length, 0);
  });

  await t.test("Sends correct directory path", async () => {
    console.log("Testing directory input");
    const input = document.querySelector(".active-directory");
    input.value = "/tmp/foo/bar";
    await new Promise((resolve) => setTimeout(resolve, 0));
    input.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const fileService = app.fileService;
    assert.equal(fileService.listTextFiles.calls[0][0].directory, "/tmp/foo/bar");
  });

  await t.test("renders file list after selecting a directory", async () => {
    const selectButton = document.querySelector(".select-directory-button");
    selectButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const items = Array.from(document.querySelectorAll(".file-item"));
    assert.equal(items.length, 2);
    assert.equal(items[0].textContent, "a.md");
    assert.equal(items[1].textContent, "b.md");
  });
});
