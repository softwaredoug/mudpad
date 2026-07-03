import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { IssuesSidebar } from "../../src/renderer/components/issues-sidebar.js";
import { loadRendererTemplates, createTemplateFetch } from "../helpers/template-mocks.js";

describe("IssuesSidebar", () => {
  it("renders issues and wires actions", async () => {
    const dom = new JSDOM("<!doctype html><html><body><div id=\"issues\"></div></body></html>", {
      url: "http://localhost/"
    });
    const { document } = dom.window;
    const mountEl = document.getElementById("issues");

    const templates = await loadRendererTemplates();
    global.fetch = createTemplateFetch(templates);

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
      const sidebar = await IssuesSidebar.create({
        mountEl,
        onIssueSelect: (selectedIssue) => {
          selected = selectedIssue;
        }
      });

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

  it("shows empty state", async () => {
    const dom = new JSDOM("<!doctype html><html><body><div id=\"issues\"></div></body></html>", {
      url: "http://localhost/"
    });
    const { document } = dom.window;
    const mountEl = document.getElementById("issues");

    const templates = await loadRendererTemplates();
    global.fetch = createTemplateFetch(templates);

    const sidebar = await IssuesSidebar.create({ mountEl });
    sidebar.render([]);
    const listEl = mountEl.querySelector(".issues-list");
    assert.equal(listEl.textContent.trim(), "No issues");
  });
});
