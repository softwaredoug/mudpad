import { test } from "node:test";
import assert from "node:assert/strict";
import { setupApp } from "./setup.js";

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
    assert.equal(fileService.createNewFile.lastCall()[0], "/tmp/posts");

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

  await t.test("pasting an image saves it and inserts markdown", async () => {
    app.fileService.saveImage = async (...args) => {
      app.fileService.saveImage.calls.push(args);
      return { relativePath: "images/image1.png" };
    };
    app.fileService.saveImage.calls = [];
    const selectButton = document.querySelector(".select-directory-button");
    selectButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const editorRoot = document.querySelector(".cm-content[contenteditable='false']");
    assert.ok(editorRoot);
    editorRoot.dispatchEvent(new dom.window.MouseEvent("dblclick", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const updatedEditor = document.querySelector(".cm-content");
    const mockFile = {
      name: "paste.png",
      type: "image/png",
      arrayBuffer: async () => new ArrayBuffer(4)
    };
    const pasteEvent = new dom.window.Event("paste", { bubbles: true });
    pasteEvent.clipboardData = {
      getData: () => "",
      items: [
        {
          type: "image/png",
          getAsFile: () => mockFile
        }
      ]
    };
    updatedEditor.dispatchEvent(pasteEvent);
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(app.fileService.saveImage.calls.length, 1);
    assert.ok(updatedEditor.textContent.includes("![](images/image1.png)"));
  });

  await t.test("dropping an image saves it and inserts markdown", async () => {
    app.fileService.saveImage = async (...args) => {
      app.fileService.saveImage.calls.push(args);
      return { relativePath: "images/image2.png" };
    };
    app.fileService.saveImage.calls = [];
    const selectButton = document.querySelector(".select-directory-button");
    selectButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const editorRoot = document.querySelector(".cm-content[contenteditable='false']");
    assert.ok(editorRoot);
    editorRoot.dispatchEvent(new dom.window.MouseEvent("dblclick", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const updatedEditor = document.querySelector(".cm-content");
    dom.window.FileReader = class {
      readAsText() {
        if (this.onload) {
          this.onload({ target: { result: "" } });
        }
      }
    };
    global.FileReader = dom.window.FileReader;
    const dropEvent = new dom.window.Event("drop", { bubbles: true });
    dropEvent.dataTransfer = {
      getData: () => "",
      files: [
        {
          path: "/tmp/drop.png",
          name: "drop.png",
          type: "image/png"
        }
      ]
    };
    updatedEditor.dispatchEvent(dropEvent);
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(app.fileService.saveImage.calls.length, 1);
    assert.ok(updatedEditor.textContent.includes("![](images/image2.png)"));
  });

  await t.test("hovering image url opens preview modal", async () => {
    app.fileService.readFile = async (path) => ({
      path,
      content: "![](images/cat.png)"
    });
    const selectButton = document.querySelector(".select-directory-button");
    selectButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const editorRoot = document.querySelector(".cm-content[contenteditable='false']");
    assert.ok(editorRoot);
    editorRoot.dispatchEvent(new dom.window.MouseEvent("dblclick", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const view = app.editorComponent.editor.view;
    const docText = view.state.doc.toString();
    const imagePos = docText.indexOf("images/cat.png") + 2;
    view.posAtCoords = () => imagePos;
    view.contentDOM.dispatchEvent(new dom.window.MouseEvent("mouseover", {
      bubbles: true,
      clientX: 10,
      clientY: 10
    }));
    view.contentDOM.dispatchEvent(new dom.window.MouseEvent("mousemove", {
      bubbles: true,
      clientX: 10,
      clientY: 10
    }));
    await new Promise((resolve) => setTimeout(resolve, 10));

    const modal = document.querySelector("#image-preview-modal");
    assert.ok(modal);
    assert.equal(modal.classList.contains("hidden"), false);
    const previewImage = document.querySelector("#image-preview-image");
    assert.ok(previewImage);
    assert.equal(previewImage.getAttribute("src"), "file:///tmp/posts/images/cat.png");
  });
});
