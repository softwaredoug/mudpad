import path from "path";
import { fileURLToPath } from "url";
import { resolveLanguageToolJar } from "../src/main/languagetool/download.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const cacheDir = path.join(rootDir, "resources", "languagetool");

try {
  const jarPath = await resolveLanguageToolJar({ cacheDir });
  console.log(`LanguageTool ready at ${jarPath}`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
