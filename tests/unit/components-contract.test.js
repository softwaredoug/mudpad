import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { BaseComponent } from "../../src/renderer/modals/base-component.js";
import { DirectorySelector } from "../../src/renderer/components/directory-selector.js";
import { FileList } from "../../src/renderer/components/file-list.js";
import { IssuesSidebar } from "../../src/renderer/components/issues-sidebar.js";
import { EditorComponent } from "../../src/renderer/components/editor-component.js";
import { Issue } from "../../src/renderer/components/issue.js";
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

async function setupDom() {
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true
  });
  applyDomGlobals(dom);
  const templates = await loadRendererTemplates();
  global.fetch = createTemplateFetch(templates);
  return dom;
}

describe("Component contract", () => {
  it("creates components with base and template", async () => {
    const dom = await setupDom();
    const { document } = dom.window;
    const mountEl = document.getElementById("root");
    const fileService = createFileServiceMock();
    const correctionsService = createCorrectionsServiceMock();

    const components = [
      {
        name: "DirectorySelector",
        Component: DirectorySelector,
        template: "directory-selector.html",
        args: {
          mountEl,
          fileService
        }
      },
      {
        name: "FileList",
        Component: FileList,
        template: "file-list.html",
        args: {
          mountEl,
          fileService,
          modalMount: document.body,
          window: dom.window
        }
      },
      {
        name: "IssuesSidebar",
        Component: IssuesSidebar,
        template: "issues-sidebar.html",
        args: {
          mountEl,
          issueContext: {
            correctionsService,
            getText: () => "",
            setText: () => {},
            getFilePath: () => null,
            getDirectory: () => null,
            onIssuesUpdate: () => {},
            onStatus: () => {}
          }
        }
      },
      {
        name: "EditorComponent",
        Component: EditorComponent,
        template: "editor-component.html",
        args: {
          mountEl,
          fileService,
          correctionsService
        }
      },
      {
        name: "Issue",
        Component: Issue,
        template: "issue.html",
        args: {
          mountEl,
          issue: { id: "spell-1", type: "spell", message: "Test" },
          filePath: "/tmp/file.md",
          directory: "/tmp",
          onApply: () => {},
          onDismiss: () => {},
          onIgnore: () => {}
        }
      }
    ];

    for (const entry of components) {
      assert.equal(typeof entry.Component.create, "function", `${entry.name} has static create`);
      const instance = await entry.Component.create(entry.args);
      assert.equal(typeof instance.ensureReady, "function", `${entry.name} has ensureReady`);
      assert.ok(instance.base instanceof BaseComponent, `${entry.name} holds BaseComponent`);
      assert.equal(instance.base.mountEl, mountEl, `${entry.name} uses mount element`);
      assert.ok(
        instance.base.templateUrl?.href.includes(entry.template),
        `${entry.name} uses ${entry.template}`
      );
    }
  });
});
