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
  async function runChecks({ text = "", spellingExceptions = [] } = {}) {
    return runAnalysis({ text, spellingExceptions, includeLlm: false });
  }

  async function runAnalysis({ text = "", spellingExceptions = [], includeLlm = true } = {}) {
    const ignoredRanges = collectIgnoredRanges(text);
    const exceptionSet = new Set(
      (spellingExceptions ?? []).map((word) => word.toLowerCase())
    );

    const rawSpellIssues = spellChecker(text);
    const spellIssues = applySpellingExceptions(
      filterIssuesByIgnoredRanges(rawSpellIssues, ignoredRanges),
      exceptionSet
    );

    let grammarIssues = [];
    let grammarError = null;
    if (grammarChecker) {
      const grammarResult = await grammarChecker(text);
      grammarError = grammarResult?.error ?? null;
      grammarIssues = applySpellingExceptions(
        filterIssuesByIgnoredRanges(grammarResult?.issues ?? [], ignoredRanges),
        exceptionSet
      );
    }

    let llmIssues = [];
    let llmError = null;
    if (includeLlm && llmChecker) {
      const llmResult = await llmChecker(text);
      llmError = llmResult?.error ?? null;
      llmIssues = filterIssuesByIgnoredRanges(
        llmResult?.issues ?? [],
        ignoredRanges
      );
    }

    return {
      issues: {
        spell: spellIssues,
        grammar: grammarIssues,
        llm: llmIssues
      },
      errors: {
        grammar: grammarError,
        llm: llmError
      }
    };
  }

  return { runChecks, runAnalysis };
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

export function collectIgnoredRanges(text) {
  if (!text) {
    return [];
  }

  const ranges = [];
  const frontmatterMatch = text.match(/^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)\r?\n/);
  if (frontmatterMatch) {
    ranges.push({ start: 0, end: frontmatterMatch[0].length });
  }

  const lines = text.split(/\r?\n/);
  const separators = text.match(/\r?\n/g) ?? [];
  let offset = 0;
  let inBlock = false;
  let fence = "";
  let blockStart = 0;

  lines.forEach((line, index) => {
    const lineStart = offset;
    const lineEnd = offset + line.length;
    const newline = separators[index] ?? "";
    const trimmed = line.trimStart();
    const isFence = trimmed.startsWith("```") || trimmed.startsWith("~~~");

    if (isFence) {
      if (!inBlock) {
        inBlock = true;
        fence = trimmed.slice(0, 3);
        blockStart = lineStart;
      } else if (trimmed.startsWith(fence)) {
        inBlock = false;
        fence = "";
        ranges.push({ start: blockStart, end: lineEnd + newline.length });
      }
    }

    offset += line.length + newline.length;
  });

  if (inBlock) {
    ranges.push({ start: blockStart, end: text.length });
  }

  let index = 0;
  while (index < text.length) {
    const linkStart = text.indexOf("](", index);
    if (linkStart === -1) {
      break;
    }

    let depth = 1;
    let cursor = linkStart + 2;
    while (cursor < text.length && depth > 0) {
      const char = text[cursor];
      if (char === "(") {
        depth += 1;
      } else if (char === ")") {
        depth -= 1;
      }
      cursor += 1;
    }

    if (depth !== 0) {
      index = linkStart + 2;
      continue;
    }

    const start = linkStart + 2;
    const end = cursor - 1;
    if (end > start) {
      ranges.push({ start, end });
    }

    index = cursor;
  }

  return normalizeRanges(ranges);
}

export function filterIssuesByIgnoredRanges(issues, ignoredRanges) {
  if (!ignoredRanges?.length) {
    return issues ?? [];
  }
  return (issues ?? []).filter((issue) => {
    if (!issue?.range) {
      return true;
    }
    return !isOverlapping(issue.range, ignoredRanges);
  });
}

function applySpellingExceptions(issues, exceptionSet) {
  if (!exceptionSet?.size) {
    return issues ?? [];
  }
  return (issues ?? []).filter((issue) => {
    if (issue.type !== "spell") {
      return true;
    }
    const word = issue.word?.toLowerCase();
    if (!word) {
      return true;
    }
    return !exceptionSet.has(word);
  });
}

function isOverlapping(range, ignoredRanges) {
  return ignoredRanges.some(
    (ignored) => range.end > ignored.start && range.start < ignored.end
  );
}

function normalizeRanges(ranges) {
  if (!ranges.length) {
    return [];
  }
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}
