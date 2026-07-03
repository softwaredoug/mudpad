import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { DirectorySelector } from "../../src/renderer/components/directory-selector.js";
import { createFileServiceMock } from "../helpers/service-mocks.js";
import { loadRendererTemplates, createTemplateFetch } from "../helpers/template-mocks.js";

describe("DirectorySelector", () => {
  it("emits onChange when selecting a directory", async () => {
    const dom = new JSDOM("<!doctype html><html><body><div id=\"mount\"></div></body></html>", {
      url: "http://localhost/"
    });
    const { document } = dom.window;
    const mountEl = document.getElementById("mount");

    const templates = await loadRendererTemplates();
    global.fetch = createTemplateFetch(templates);

    const fileService = createFileServiceMock({
      async selectDirectory() {
        return { path: "/tmp/posts" };
      }
    });

    let changePayload = null;
    const selector = await DirectorySelector.create({
      fileService,
      mountEl,
      onChange: (payload) => {
        changePayload = payload;
      },
      onStatus: () => {},
      storage: {
        getItem: () => null,
        setItem: () => {}
      }
    });

    await selector.handleSelectClick();

    assert.deepEqual(changePayload, {
      directory: "/tmp/posts",
      pattern: null,
      display: "/tmp/posts"
    });
  });

  it("parses glob input and validates", async () => {
    const dom = new JSDOM("<!doctype html><html><body><div id=\"mount\"></div></body></html>", {
      url: "http://localhost/"
    });
    const { document } = dom.window;
    const mountEl = document.getElementById("mount");

    const templates = await loadRendererTemplates();
    global.fetch = createTemplateFetch(templates);

    const fileService = createFileServiceMock({
      async selectDirectory() {
        return { path: "/tmp" };
      }
    });

    let changePayload = null;
    const selector = await DirectorySelector.create({
      fileService,
      mountEl,
      onChange: (payload) => {
        changePayload = payload;
      },
      onStatus: () => {},
      storage: {
        getItem: () => null,
        setItem: () => {}
      }
    });

    const input = mountEl.querySelector(".active-directory");
    input.value = "/tmp/posts/**/*.md";
    await selector.applyInput();

    assert.deepEqual(changePayload, {
      directory: "/tmp/posts",
      pattern: "**/*.md",
      display: "/tmp/posts/**/*.md"
    });
  });
});
