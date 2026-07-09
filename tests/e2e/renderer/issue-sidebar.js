import { test } from "node:test";
import assert from "node:assert/strict";
import { setupApp } from "./setup.js";

async function setupIssueApp({ correctionsServiceOverrides } = {}) {
  return setupApp({
    fileServiceOverrides: {
      async showDirectoryPicker() {
        return { path: "/tmp/posts" };
      },
      async listTextFiles() {
        return {
          files: [
            { path: "/tmp/posts/a.md", relativePath: "a.md" }
          ],
          tooMany: false
        };
      },
      async readFile(path) {
        return { path, content: "Hello from file" };
      }
    },
    correctionsServiceOverrides
  });
}

async function openFileAndWait(dom, document) {
  const selectButton = document.querySelector(".select-directory-button");
  selectButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const fileItem = document.querySelector(".file-item");
  fileItem.dispatchEvent(new dom.window.MouseEvent("dblclick", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 600));
}

test("IssueSidebar (e2e)", async (t) => {
  await t.test("renders issues from corrections", async () => {
    const { dom, document } = await setupIssueApp({
      correctionsServiceOverrides: {
        async checkCorrections() {
          return {
            issues: {
              spell: [
                {
                  id: "spell-1",
                  type: "spell",
                  word: "teh",
                  message: "Possible misspelling",
                  source: "LanguageTool",
                  range: { start: 0, end: 3 },
                  suggestions: ["the"]
                }
              ],
              grammar: [],
              llm: []
            },
            errors: {}
          };
        }
      }
    });

    await openFileAndWait(dom, document);

    const item = document.querySelector(".issue-item");
    assert.ok(item);
    assert.equal(item.querySelector(".issue-type").textContent, "spell");
    assert.equal(item.querySelector(".issue-message").textContent, "Possible misspelling");
    assert.equal(item.querySelector(".issue-source").textContent, "Source: LanguageTool");
    assert.equal(item.querySelector(".issue-suggestion").textContent, "Suggestion: the");
  });

  await t.test("apply updates issue list", async () => {
    const { dom, document, app } = await setupIssueApp({
      correctionsServiceOverrides: {
        async checkCorrections() {
          return {
            issues: {
              spell: [
                {
                  id: "spell-1",
                  type: "spell",
                  word: "teh",
                  message: "Possible misspelling",
                  source: "LanguageTool",
                  range: { start: 0, end: 3 },
                  suggestions: ["the"]
                }
              ],
              grammar: [],
              llm: []
            },
            errors: {}
          };
        },
        async applyIssue() {
          return {
            text: "the",
            issues: { spell: [], grammar: [], llm: [] },
            errors: {}
          };
        }
      }
    });

    await openFileAndWait(dom, document);

    const applyButton = document.querySelector(".issue-action-apply");
    applyButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const lastCall = app.correctionsService.applyIssue.lastCall()[0];
    assert.equal(lastCall.filePath, "/tmp/posts/a.md");
    assert.equal(lastCall.issue.id, "spell-1");

    const list = document.querySelector(".issues-list");
    assert.equal(list.textContent.trim(), "No issues");
  });

  await t.test("ignore disabled for non-spell issues", async () => {
    const { dom, document } = await setupIssueApp({
      correctionsServiceOverrides: {
        async checkCorrections() {
          return {
            issues: {
              spell: [],
              grammar: [
                {
                  id: "grammar-1",
                  type: "grammar",
                  message: "Grammar issue",
                  source: "LanguageTool",
                  range: { start: 0, end: 3 }
                }
              ],
              llm: []
            },
            errors: {}
          };
        }
      }
    });

    await openFileAndWait(dom, document);

    const ignoreButton = document.querySelector(".issue-action-ignore");
    assert.ok(ignoreButton.disabled);
    assert.equal(ignoreButton.title, "Available for spelling only");
  });
});
