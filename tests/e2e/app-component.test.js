import { test } from "node:test";
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
    async selectDirectory() {
      return { path: "/tmp/posts" };
    },
    async listTextFiles() {
      return {
        files: [{ path: "/tmp/posts/a.md", relativePath: "a.md" },
                { path: "/tmp/posts/b.md", relativePath: "b.md" }],
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
    const fileItems = document.querySelectorAll(".file-item")
    assert.equal(fileItems.length, 2);
    fileItems[1].dispatchEvent(new dom.window.MouseEvent("dblclick", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const activeFileItems = document.querySelectorAll(".file-item.active")
    assert.equal(activeFileItems.length, 1);
    assert.equal(activeFileItems[0].textContent, "b.md");
  });
})

test("AppComponent (e2e) directory list component", async (t) => {
  const { dom, document, app } = await setupApp({
    fileServiceOverrides: {
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
    }
  });

  await t.test("empty if not clicked", async () => {
    const items = Array.from(document.querySelectorAll(".file-item"));
    assert.equal(items.length, 0);
  });

  await t.test("Sends correct directory path", async () => {
    console.log("Testing directory input");
    var input = document.querySelector('.active-directory');
    input.value = "/tmp/foo/bar"
    await new Promise((resolve) => setTimeout(resolve, 0));
    // send keydown to input
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

test("AppComponent (e2e) editor", async (t) => {
  const { dom, document, app } = await setupApp({
    fileServiceOverrides: {
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
      },
      async createNewFile(directory) {
        return { path: `${directory}/new.md` };
      },
      async readFile(path) {
        return { path, content: "New file content" };
      }
    }
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
});
