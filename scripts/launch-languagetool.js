import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { resolveLanguageToolJar } from "../src/main/languagetool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const cacheDir = path.join(rootDir, ".languagetool");

const port = process.env.LANGUAGETOOL_PORT ?? "8010";

try {
  const resolvedJar = await resolveLanguageToolJar({ cacheDir });
  const args = ["-jar", resolvedJar, "--port", port];
  const child = spawn("java", args, { stdio: "inherit" });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
