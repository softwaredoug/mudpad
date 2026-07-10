import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveBundledJava, resolveJavaCommand } from "../../../src/main/languagetool/java.js";

test("bundled Java resolution", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mudpad-java-"));
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));

  const bundledJava = path.join(tempDir, "jre", "arm64", "bin", "java");
  await fs.mkdir(path.dirname(bundledJava), { recursive: true });
  await fs.writeFile(bundledJava, "java", "utf8");

  await t.test("resolves the bundled Java executable for Apple Silicon", async () => {
    assert.equal(
      resolveBundledJava(tempDir, "darwin", "arm64"),
      bundledJava
    );
    assert.equal(
      await resolveJavaCommand({
        resourcesPath: tempDir,
        platform: "darwin",
        arch: "arm64",
        env: {}
      }),
      bundledJava
    );
  });

  await t.test("does not resolve a bundled Java executable on unsupported platforms", () => {
    assert.equal(resolveBundledJava(tempDir, "linux", "arm64"), null);
    assert.equal(resolveBundledJava(tempDir, "darwin", "ia32"), null);
  });

  await t.test("fails when the bundled Java executable is missing", async () => {
    await assert.rejects(
      resolveJavaCommand({
        resourcesPath: path.join(tempDir, "missing"),
        platform: "darwin",
        arch: "arm64"
      }),
      (error) => error.code === "BUNDLED_JAVA_MISSING"
    );
  });
});
