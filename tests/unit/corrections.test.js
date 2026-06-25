import { describe, it } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
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

  it("persists dismissed changes without throwing", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "corrections-"));
    const engine = createCorrectionsEngine({ spellChecker: () => [] });
    await engine.setDirectory(tmpDir);

    const text = "Ubik is a proper noun.";
    const start = text.indexOf("Ubik");
    const result = await engine.addDismissedChange({
      directory: tmpDir,
      filePath: path.join(tmpDir, "sample.md"),
      text,
      issue: {
        type: "spell",
        word: "Ubik",
        range: { start, end: start + "Ubik".length }
      }
    });

    assert.equal(result?.error ?? null, null);
  });

  it("filters dismissed spelling issues on analysis", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "corrections-"));
    const text = "Ubik is a proper noun.";
    const start = text.indexOf("Ubik");
    const spellChecker = () => [
      {
        id: "spell-0",
        type: "spell",
        word: "Ubik",
        range: { start, end: start + "Ubik".length },
        message: "Possible misspelling: Ubik",
        suggestions: ["Ubik"],
        source: "local",
        confidence: 0.7,
        status: "open"
      }
    ];
    const engine = createCorrectionsEngine({ spellChecker });
    await engine.setDirectory(tmpDir);
    const filePath = path.join(tmpDir, "sample.md");
    const fileCorrections = engine.getFileCorrections(filePath);

    await fileCorrections.dismissIssue({
      issue: {
        type: "spell",
        word: "Ubik",
        range: { start, end: start + "Ubik".length }
      },
      text
    });

    const result = await fileCorrections.runAnalysis({ text, includeLlm: false });
    assert.equal(result.issues.spell.length, 0);
  });

  it("returns issues after dismiss and ignore", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "corrections-"));
    const text = "Ubik is a proper noun.";
    const start = text.indexOf("Ubik");
    const spellChecker = () => [
      {
        id: "spell-0",
        type: "spell",
        word: "Ubik",
        range: { start, end: start + "Ubik".length },
        message: "Possible misspelling: Ubik",
        suggestions: ["Ubik"],
        source: "local",
        confidence: 0.7,
        status: "open"
      }
    ];
    const engine = createCorrectionsEngine({ spellChecker });
    await engine.setDirectory(tmpDir);
    const filePath = path.join(tmpDir, "sample.md");
    const fileCorrections = engine.getFileCorrections(filePath);

    const dismissResult = await fileCorrections.dismissIssue({
      issue: {
        type: "spell",
        word: "Ubik",
        range: { start, end: start + "Ubik".length }
      },
      text
    });

    assert.ok(dismissResult.issues);
    assert.equal(dismissResult.issues.spell.length, 0);

    const ignoreResult = await fileCorrections.ignoreWord({ word: "Ubik", text });
    assert.ok(ignoreResult.issues);
    assert.equal(ignoreResult.issues.spell.length, 0);
  });

  it("returns updated text and issues after apply", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "corrections-"));
    const text = "teh typo";
    const start = text.indexOf("teh");
    const spellChecker = () => [
      {
        id: "spell-0",
        type: "spell",
        word: "teh",
        range: { start, end: start + "teh".length },
        message: "Possible misspelling: teh",
        suggestions: ["the"],
        source: "local",
        confidence: 0.7,
        status: "open"
      }
    ];
    const engine = createCorrectionsEngine({ spellChecker });
    await engine.setDirectory(tmpDir);
    const fileCorrections = engine.getFileCorrections(path.join(tmpDir, "sample.md"));

    const result = await fileCorrections.applyIssue({
      issue: spellChecker()[0],
      text
    });

    assert.equal(result.text, "the typo");
    assert.ok(result.issues);
  });
});
