import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { DirectorySelector } from "../../src/renderer/components/directory-selector.js";

describe("DirectorySelector", () => {
  it("emits onChange when selecting a directory", async () => {
    const dom = new JSDOM("<!doctype html><html><body><input id=\"dir\" /><div id=\"err\"></div><button id=\"btn\"></button></body></html>");
    const { document } = dom.window;

    const fileService = {
      async selectDirectory() {
        return { path: "/tmp/posts" };
      },
      async getLastDirectory() {
        return { path: null };
      },
      async validateDirectory() {
        return { ok: true };
      },
      async getHomeDirectory() {
        return { path: "/home/user" };
      },
      async setLastDirectory() {
        return { ok: true };
      }
    };

    let changePayload = null;
    const selector = new DirectorySelector({
      fileService,
      selectButton: document.getElementById("btn"),
      input: document.getElementById("dir"),
      errorLabel: document.getElementById("err"),
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
    const dom = new JSDOM("<!doctype html><html><body><input id=\"dir\" /><div id=\"err\"></div><button id=\"btn\"></button></body></html>");
    const { document } = dom.window;

    const fileService = {
      async selectDirectory() {
        return { path: "/tmp" };
      },
      async getLastDirectory() {
        return { path: null };
      },
      async validateDirectory() {
        return { ok: true };
      },
      async getHomeDirectory() {
        return { path: "/home/user" };
      },
      async setLastDirectory() {
        return { ok: true };
      }
    };

    let changePayload = null;
    const selector = new DirectorySelector({
      fileService,
      selectButton: document.getElementById("btn"),
      input: document.getElementById("dir"),
      errorLabel: document.getElementById("err"),
      onChange: (payload) => {
        changePayload = payload;
      },
      onStatus: () => {},
      storage: {
        getItem: () => null,
        setItem: () => {}
      }
    });

    document.getElementById("dir").value = "/tmp/posts/**/*.md";
    await selector.applyInput();

    assert.deepEqual(changePayload, {
      directory: "/tmp/posts",
      pattern: "**/*.md",
      display: "/tmp/posts/**/*.md"
    });
  });
});
