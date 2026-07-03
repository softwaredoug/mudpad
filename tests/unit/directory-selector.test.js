import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { DirectorySelector } from "../../src/renderer/components/directory-selector.js";
import { createFileServiceMock } from "../helpers/service-mocks.js";
import { loadRendererTemplates, createTemplateFetch } from "../helpers/template-mocks.js";

test("DirectorySelector select glob and directory", async (t) => {
  const templates = await loadRendererTemplates();
  global.fetch = createTemplateFetch(templates);

  const createSelector = async ({ selectDirectoryPath }) => {
    const dom = new JSDOM("<!doctype html><html><body><div id=\"mount\"></div></body></html>", {
      url: "http://localhost/"
    });
    const { document } = dom.window;
    const mountEl = document.getElementById("mount");

    const fileService = createFileServiceMock({
      async showDirectoryPicker() {
        return { path: selectDirectoryPath };
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

    return { selector, mountEl, getChangePayload: () => changePayload };
  };

  await t.test("emits onChange when selecting a directory", async () => {
    const { selector, getChangePayload } = await createSelector({
      selectDirectoryPath: "/tmp/posts"
    });

    await selector.handleSelectClick();

    assert.deepEqual(getChangePayload(), {
      directory: "/tmp/posts",
      pattern: null,
      display: "/tmp/posts"
    });
  });

  await t.test("parses glob input and validates", async () => {
    const { selector, mountEl, getChangePayload } = await createSelector({
      selectDirectoryPath: "/tmp"
    });

    const input = mountEl.querySelector(".active-directory");
    input.value = "/tmp/posts/**/*.md";
    await selector.applyInput();

    assert.deepEqual(getChangePayload(), {
      directory: "/tmp/posts",
      pattern: "**/*.md",
      display: "/tmp/posts/**/*.md"
    });
  });
});


test("DirectorySelector last directory", async (t) => {
  const templates = await loadRendererTemplates();
  global.fetch = createTemplateFetch(templates);

  var selectDirectoryPath = "/tmp/posts";

  const dom = new JSDOM("<!doctype html><html><body><div id=\"mount\"></div></body></html>", {
    url: "http://localhost/"
  });
  const { document } = dom.window;
  const mountEl = document.getElementById("mount");

  const fileService = createFileServiceMock({
    async showDirectoryPicker() {
      return { path: selectDirectoryPath };
    },

    async getLastDirectory() {
      return { path: selectDirectoryPath };
    }

  });

  let _changePayload = null;
  const selector = await DirectorySelector.create({
    fileService,
    mountEl,
    onChange: (payload) => {
      _changePayload = payload;
    },
    onStatus: () => {},
    storage: {
      getItem: () => null,
      setItem: () => {}
    }
  });

  await t.test("initializes state to last directory", async () => {
    assert.deepEqual(selector.getState(), {
      directory: "/tmp/posts",
      pattern: null,
      display: "/tmp/posts"
    });
  });

  await t.test("sets DOM element to last directory", async() => {
    const input = mountEl.querySelector(".active-directory");
    assert.equal(input.value, "/tmp/posts");
  });

});
