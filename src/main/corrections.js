import fs from "fs/promises";
import path from "path";
import {
  FileCorrections,
  buildDismissedChangeEntry,
  formatDismissedLine,
  normalizeDismissedEntry
} from "./file-corrections.js";

const DEFAULT_SPELLING = [
  { word: "teh", suggestion: "the" },
  { word: "recieve", suggestion: "receive" },
  { word: "definately", suggestion: "definitely" }
];

export function createCorrectionsEngine({
  grammarChecker,
  llmChecker,
  spellChecker = defaultSpellChecker
} = {}) {
  let activeDirectory = null;
  let spellingExceptionEntries = [];
  let spellingExceptionSet = new Set();
  let dismissedChangesState = [];
  let activeFilePath = null;
  let activeFileCorrections = null;

  async function setDirectory(directory) {
    if (!directory) {
      activeDirectory = null;
      spellingExceptionEntries = [];
      spellingExceptionSet = new Set();
      dismissedChangesState = [];
      activeFilePath = null;
      activeFileCorrections = null;
      return;
    }
    if (directory === activeDirectory) {
      return;
    }
    activeDirectory = directory;
    const { spellingExceptions, dismissedChanges } = await loadDirectoryState(directory);
    spellingExceptionEntries = spellingExceptions;
    spellingExceptionSet = new Set(spellingExceptions.map((word) => word.toLowerCase()));
    dismissedChangesState = dismissedChanges;
    activeFilePath = null;
    activeFileCorrections = null;
  }

  async function addSpellingException({ directory, word } = {}) {
    const targetDirectory = directory ?? activeDirectory;
    if (!targetDirectory) {
      return { error: "No directory selected." };
    }
    if (!word || !word.trim()) {
      return { error: "No word provided." };
    }

    const normalized = word.trim();
    const normalizedLower = normalized.toLowerCase();
    if (!spellingExceptionSet.has(normalizedLower)) {
      spellingExceptionEntries = [...spellingExceptionEntries, normalized];
      spellingExceptionSet = new Set(spellingExceptionEntries.map((entry) => entry.toLowerCase()));
      const filePath = path.join(targetDirectory, ".spelling-exceptions");
      await fs.writeFile(filePath, `${spellingExceptionEntries.join("\n")}\n`, "utf8");
    }

    return { words: [...spellingExceptionEntries] };
  }

  async function addDismissedChange({ directory, text, issue, filePath } = {}) {
    const targetDirectory = directory ?? activeDirectory;
    if (!targetDirectory) {
      return { error: "No directory selected." };
    }
    const entry = buildDismissedChangeEntry({ text, issue, filePath });
    if (!entry) {
      return { error: "Invalid dismissed change." };
    }

    const normalized = normalizeDismissedEntry(entry);
    if (!normalized) {
      return { error: "Invalid dismissed change." };
    }

    const existing = dismissedChangesState.slice();
    const key = formatDismissedLine(normalized);
    const existingKeys = new Set(existing.map((change) => formatDismissedLine(change)));
    if (!existingKeys.has(key)) {
      existing.push(normalized);
    }

    existing.sort((a, b) => {
      const fileCompare = a.filePath.localeCompare(b.filePath);
      if (fileCompare !== 0) {
        return fileCompare;
      }
      const changeCompare = a.change.localeCompare(b.change);
      if (changeCompare !== 0) {
        return changeCompare;
      }
      const beforeCompare = a.before.localeCompare(b.before);
      if (beforeCompare !== 0) {
        return beforeCompare;
      }
      return a.after.localeCompare(b.after);
    });

    dismissedChangesState = existing;
    const fileTarget = path.join(targetDirectory, "dismissed-changes.txt");
    const lines = dismissedChangesState.map((change) => formatDismissedLine(change));
    await fs.writeFile(fileTarget, `${lines.join("\n")}\n`, "utf8");
    const fileCorrections = fileCorrectionsMap.get(entry.filePath);
    if (fileCorrections) {
      fileCorrections.refreshDismissed();
    }
    return { changes: dismissedChangesState };
  }

  function getFileCorrections(filePath) {
    if (!filePath) {
      return null;
    }
    if (activeFileCorrections && activeFilePath === filePath) {
      return activeFileCorrections;
    }
    activeFilePath = filePath;
    activeFileCorrections = new FileCorrections({ filePath, engine: api });
    return activeFileCorrections;
  }

  function getDismissedForFile(filePath) {
    return dismissedChangesState.filter((entry) => entry.filePath === filePath);
  }

  function getSpellingExceptionSet() {
    return spellingExceptionSet;
  }

  const api = {
    setDirectory,
    addSpellingException,
    addDismissedChange,
    getFileCorrections,
    getDismissedForFile,
    getSpellingExceptionSet,
    grammarChecker,
    llmChecker,
    spellChecker
  };

  return api;
}

export function defaultSpellChecker(text) {
  const issues = [];
  const lower = (text ?? "").toLowerCase();

  DEFAULT_SPELLING.forEach((entry, index) => {
    let startIndex = 0;
    while (startIndex < lower.length) {
      const found = lower.indexOf(entry.word, startIndex);
      if (found === -1) {
        break;
      }

      const end = found + entry.word.length;
      issues.push({
        id: `spell-${index}-${found}`,
        type: "spell",
        word: entry.word,
        range: { start: found, end },
        message: `Possible misspelling: ${entry.word}`,
        suggestions: [entry.suggestion],
        source: "local",
        confidence: 0.7,
        status: "open"
      });

      startIndex = end;
    }
  });

  return issues;
}

export { buildDismissedChangeEntry };

async function loadDirectoryState(directory) {
  const spellingExceptions = await readSpellingExceptions(directory);
  const dismissedChanges = await readDismissedChanges(directory);
  return { spellingExceptions, dismissedChanges };
}

async function readSpellingExceptions(directory) {
  if (!directory) {
    return [];
  }
  const filePath = path.join(directory, ".spelling-exceptions");
  try {
    const content = await fs.readFile(filePath, "utf8");
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    return [];
  }
}

async function readDismissedChanges(directory) {
  if (!directory) {
    return [];
  }
  const filePath = path.join(directory, "dismissed-changes.txt");
  try {
    const content = await fs.readFile(filePath, "utf8");
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => parseDismissedLine(line))
      .filter(Boolean);
  } catch (error) {
    return [];
  }
}

function parseDismissedLine(line) {
  const parts = line.split("\t");
  if (parts.length < 4) {
    return null;
  }
  const [filePath, change, before, after] = parts;
  if (!filePath) {
    return null;
  }
  return normalizeDismissedEntry({
    filePath: filePath.trim(),
    change: (change ?? "").trim(),
    before: (before ?? "").trim(),
    after: (after ?? "").trim()
  });
}
