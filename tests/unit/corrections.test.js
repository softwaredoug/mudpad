import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createCorrectionsEngine } from "../../src/main/corrections.js";

describe("corrections engine", () => {
  it("filters issues inside link destinations", async () => {
    const text =
      "![image.png](/assets/media/2026/three-kinds-of-agentic-search/image.png)";
    const destinationStart = text.indexOf("/assets");

    const grammarChecker = async () => ({
      issues: [
        {
          type: "grammar",
          range: { start: destinationStart, end: destinationStart + 10 }
        }
      ],
      error: null
    });

    const engine = createCorrectionsEngine({ grammarChecker, spellChecker: () => [] });
    const fileCorrections = engine.getFileCorrections("/tmp/test.md");
    const result = await fileCorrections.runChecks({ text });

    assert.equal(result.issues.grammar.length, 0);
  });

  it("filters issues inside fenced code blocks", async () => {
    const text = ["Start", "```", "const foo = bar;", "```", "End"].join("\n");
    const codeStart = text.indexOf("const");

    const grammarChecker = async () => ({
      issues: [
        {
          type: "grammar",
          range: { start: codeStart, end: codeStart + 5 }
        }
      ],
      error: null
    });

    const engine = createCorrectionsEngine({ grammarChecker, spellChecker: () => [] });
    const fileCorrections = engine.getFileCorrections("/tmp/test.md");
    const result = await fileCorrections.runChecks({ text });

    assert.equal(result.issues.grammar.length, 0);
  });

  it("applies spelling exceptions", async () => {
    const text = "teh typo";
    const engine = createCorrectionsEngine();
    const fileCorrections = engine.getFileCorrections("/tmp/test.md");
    const result = await fileCorrections.runChecks({
      text,
      spellingExceptions: ["teh"]
    });

    assert.equal(result.issues.spell.length, 0);
  });

  it("runs mocked LLM analysis", async () => {
    const text = "Some text";
    const llmChecker = async () => ({
      issues: [
        {
          type: "llm",
          range: { start: 0, end: 4 },
          message: "Test"
        }
      ],
      error: null
    });

    const engine = createCorrectionsEngine({ llmChecker, spellChecker: () => [] });
    const fileCorrections = engine.getFileCorrections("/tmp/test.md");
    const result = await fileCorrections.runAnalysis({ text });

    assert.equal(result.issues.llm.length, 1);
  });

  it("filters dismissed changes by context and file", async () => {
    const text = "one two three four five six target seven eight nine ten eleven twelve";
    const start = text.indexOf("target");
    const grammarChecker = async () => ({
      issues: [
        {
          type: "grammar",
          range: { start, end: start + "target".length }
        }
      ],
      error: null
    });

    const engine = createCorrectionsEngine({ grammarChecker, spellChecker: () => [] });
    const fileCorrections = engine.getFileCorrections("/tmp/example.md");
    const result = await fileCorrections.runChecks({
      text,
      dismissedEntries: [
        {
          filePath: "/tmp/example.md",
          change: "target",
          before: "one two three four five six",
          after: "seven eight nine ten eleven twelve"
        }
      ]
    });

    assert.equal(result.issues.grammar.length, 0);
  });
});
