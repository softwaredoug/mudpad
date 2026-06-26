import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { DirectorySelector } from "../../src/renderer/components/directory-selector.js";

describe("DirectorySelector", () => {
  it("emits onChange when selecting a directory", async () => {
    const dom = new JSDOM("<!doctype html><html><body><div id=\"mount\"></div></body></html>", {
      url: "http://localhost/"
    });
    const { document } = dom.window;
    const mountEl = document.getElementById("mount");

    const htmlPath = fileURLToPath(
      new URL("../../src/renderer/components/directory-selector.html", import.meta.url)
    );
    const html = await fs.readFile(htmlPath, "utf8");
    global.fetch = async () => ({
      ok: true,
      status: 200,
      async text() {
        return html;
      }
    });

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

    await selector.ensureReady();
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

    const htmlPath = fileURLToPath(
      new URL("../../src/renderer/components/directory-selector.html", import.meta.url)
    );
    const html = await fs.readFile(htmlPath, "utf8");
    global.fetch = async () => ({
      ok: true,
      status: 200,
      async text() {
        return html;
      }
    });

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

    await selector.ensureReady();
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
