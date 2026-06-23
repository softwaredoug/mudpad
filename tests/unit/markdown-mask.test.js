import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { maskLinks, maskCodeBlocks } from "../../src/renderer/utils/markdown.js";

describe("markdown masking", () => {
  it("masks link destinations but keeps link text", () => {
    const input =
      "[context engineering needs agentic search](https://www.youtube.com/watch?v=ynJyIKwjonM)";
    const masked = maskLinks(input);
    assert.match(masked, /context engineering needs agentic search/);
    assert.doesNotMatch(masked, /youtube/);
    assert.equal(masked.length, input.length);
  });

  it("masks image destinations but keeps alt text", () => {
    const input = "![image.png](/assets/media/2026/three-kinds-of-agentic-search/image.png)";
    const masked = maskLinks(input);
    assert.match(masked, /image\.png/);
    assert.doesNotMatch(masked, /assets\/media/);
    assert.equal(masked.length, input.length);
  });

  it("masks fenced code blocks", () => {
    const input = ["Here is code:", "```", "const foo = bar;", "```", "Done"].join("\n");
    const masked = maskCodeBlocks(input);
    assert.match(masked, /Here is code:/);
    assert.match(masked, /Done/);
    assert.doesNotMatch(masked, /const foo = bar/);
    assert.equal(masked.length, input.length);
  });
});
