import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { IssuesSidebar } from "../../src/renderer/components/issues-sidebar.js";

describe("IssuesSidebar", () => {
  it("renders issues and wires actions", () => {
    const dom = new JSDOM("<!doctype html><html><body><div id=\"issues\"></div></body></html>", {
      url: "http://localhost/"
    });
    const { document } = dom.window;
    const mountEl = document.getElementById("issues");

    const htmlPath = fileURLToPath(
      new URL("../../src/renderer/components/issues-sidebar.html", import.meta.url)
    );
    return fs.readFile(htmlPath, "utf8").then((html) => {
      global.fetch = async () => ({
        ok: true,
        status: 200,
        async text() {
          return html;
        }
      });

      const actions = [];
      const issue = {
        id: "spell-1",
        type: "spell",
        word: "teh",
        message: "Possible misspelling",
        range: { start: 0, end: 3 },
        suggestions: ["the"],
        apply: () => actions.push("apply"),
        dismiss: () => actions.push("dismiss"),
        ignore: () => actions.push("ignore")
      };

      let selected = null;
      const sidebar = new IssuesSidebar({
        mountEl,
        onIssueSelect: (selectedIssue) => {
          selected = selectedIssue;
        }
      });

      return sidebar.ensureReady().then(() => {
        sidebar.render([issue]);

        const item = mountEl.querySelector(".issue-item");
        assert.ok(item, "renders issue item");

        item.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
        assert.equal(selected, issue);

        const buttons = Array.from(item.querySelectorAll("button"));
        const [ignoreButton, applyButton, dismissButton] = buttons;

        ignoreButton.click();
        applyButton.click();
        dismissButton.click();

        assert.deepEqual(actions, ["ignore", "apply", "dismiss"]);
      });
    });
  });

  it("shows empty state", () => {
    const dom = new JSDOM("<!doctype html><html><body><div id=\"issues\"></div></body></html>", {
      url: "http://localhost/"
    });
    const { document } = dom.window;
    const mountEl = document.getElementById("issues");

    const htmlPath = fileURLToPath(
      new URL("../../src/renderer/components/issues-sidebar.html", import.meta.url)
    );
    return fs.readFile(htmlPath, "utf8").then((html) => {
      global.fetch = async () => ({
        ok: true,
        status: 200,
        async text() {
          return html;
        }
      });

      const sidebar = new IssuesSidebar({ mountEl });
      return sidebar.ensureReady().then(() => {
        sidebar.render([]);
        const listEl = mountEl.querySelector(".issues-list");
        assert.equal(listEl.textContent.trim(), "No issues");
      });
    });
  });
});
