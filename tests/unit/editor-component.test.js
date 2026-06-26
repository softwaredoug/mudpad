import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EditorComponent } from "../../src/renderer/components/editor-component.js";
import { createFileServiceMock } from "../helpers/service-mocks.js";

describe("EditorComponent", () => {
  it("loads a file and publishes issues after debounce", async () => {
    let textBuffer = "";
    const editor = {
      getText: () => textBuffer,
      setText: (text) => {
        textBuffer = text ?? "";
      },
      setIssues: () => {}
    };

    const fileService = createFileServiceMock({
      async readFile(path) {
        return { path, content: "Test content" };
      },
      async saveFile() {
        return { path: "/tmp/file.md" };
      }
    });

    const correctionsService = {
      async setCorrectionsDirectory() {
        return { ok: true };
      },
      async checkCorrections() {
        return {
          issues: {
            spell: [
              {
                id: "spell-1",
                type: "spell",
                message: "Possible misspelling",
                range: { start: 0, end: 4 }
              }
            ],
            grammar: [],
            llm: []
          },
          errors: { grammar: null, llm: null }
        };
      }
    };

    let publishedIssues = [];
    const editorComponent = new EditorComponent({
      editor,
      fileService,
      correctionsService,
      onIssuesChanged: (issues) => {
        publishedIssues = issues;
      }
    });

    await editorComponent.openFile("/tmp/file.md");
    editorComponent.handleEditorChange();

    await new Promise((resolve) => setTimeout(resolve, 600));

    assert.equal(editorComponent.getFilePath(), "/tmp/file.md");
    assert.equal(editorComponent.getText(), "Test content");
    assert.equal(publishedIssues.length, 1);
    assert.equal(publishedIssues[0].type, "spell");
    assert.equal(typeof publishedIssues[0].apply, "function");
  });

  it("applyIssue forwards to corrections service and updates issues", async () => {
    let textBuffer = "teh";
    const editor = {
      getText: () => textBuffer,
      setText: (text) => {
        textBuffer = text ?? "";
      },
      setIssues: () => {}
    };

    const fileService = createFileServiceMock({
      async readFile(path) {
        return { path, content: "teh" };
      },
      async saveFile() {
        return { path: "/tmp/file.md" };
      }
    });

    const correctionsService = {
      async setCorrectionsDirectory() {
        return { ok: true };
      },
      async checkCorrections() {
        return { issues: { spell: [], grammar: [], llm: [] }, errors: { grammar: null, llm: null } };
      },
      async applyIssue() {
        return {
          text: "the",
          issues: { spell: [], grammar: [], llm: [] },
          errors: { grammar: null, llm: null }
        };
      }
    };

    let publishedIssues = [];
    const editorComponent = new EditorComponent({
      editor,
      fileService,
      correctionsService,
      onIssuesChanged: (issues) => {
        publishedIssues = issues;
      }
    });

    await editorComponent.openFile("/tmp/file.md");
    await new Promise((resolve) => setTimeout(resolve, 600));
    await editorComponent.applyIssue({ id: "spell-1", type: "spell", range: { start: 0, end: 3 } });

    assert.equal(editorComponent.getText(), "the");
    assert.equal(publishedIssues.length, 0);
  });
});
