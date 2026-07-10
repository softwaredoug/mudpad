import path from "path";
import { fileURLToPath } from "url";
import { startLanguageTool } from "../src/main/languagetool/launch.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const cacheDir = path.join(rootDir, ".languagetool");

const port = process.env.LANGUAGETOOL_PORT ?? "8010";

try {
  await startLanguageTool({
    cacheDir,
    port,
    onExit: ({ code }) => {
      process.exit(code ?? 0);
    },
    onError: ({ error }) => {
      console.error(error.message);
      process.exit(1);
    }
  });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
