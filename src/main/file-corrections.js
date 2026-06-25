export class FileCorrections {
  constructor({ filePath, engine }) {
    this.filePath = filePath;
    this.engine = engine;
    this.refreshDismissed();
  }

  refreshDismissed() {
    const entries = this.engine.getDismissedForFile(this.filePath);
    this.dismissedEntries = normalizeDismissedEntries(entries);
  }

  async runChecks({ text = "", spellingExceptions, dismissedEntries } = {}) {
    return this.runAnalysis({
      text,
      spellingExceptions,
      dismissedEntries,
      includeLlm: false
    });
  }

  async runAnalysis({
    text = "",
    spellingExceptions,
    dismissedEntries,
    includeLlm = true
  } = {}) {
    const ignoredRanges = collectIgnoredRanges(text);
    const exceptionSet = spellingExceptions
      ? new Set((spellingExceptions ?? []).map((word) => word.toLowerCase()))
      : this.engine.getSpellingExceptionSet();
    const effectiveDismissed = dismissedEntries
      ? normalizeDismissedEntries(dismissedEntries)
      : this.dismissedEntries;

    const rawSpellIssues = this.engine.spellChecker(text);
    const spellIssues = applySpellingExceptions(
      filterDismissedIssues(
        filterIssuesByIgnoredRanges(rawSpellIssues, ignoredRanges),
        { text, entries: effectiveDismissed }
      ),
      exceptionSet
    );

    let grammarIssues = [];
    let grammarError = null;
    if (this.engine.grammarChecker) {
      const grammarResult = await this.engine.grammarChecker(text);
      grammarError = grammarResult?.error ?? null;
      grammarIssues = applySpellingExceptions(
        filterDismissedIssues(
          filterIssuesByIgnoredRanges(grammarResult?.issues ?? [], ignoredRanges),
          { text, entries: effectiveDismissed }
        ),
        exceptionSet
      );
    }

    let llmIssues = [];
    let llmError = null;
    if (includeLlm && this.engine.llmChecker) {
      const llmResult = await this.engine.llmChecker(text);
      llmError = llmResult?.error ?? null;
      llmIssues = filterDismissedIssues(
        filterIssuesByIgnoredRanges(llmResult?.issues ?? [], ignoredRanges),
        { text, entries: effectiveDismissed }
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

  async dismissIssue({ issue, text }) {
    const result = await this.engine.addDismissedChange({
      text,
      issue,
      filePath: this.filePath
    });
    if (!result?.error) {
      this.refreshDismissed();
    }
    return result;
  }

  async ignoreWord(word) {
    const result = await this.engine.addSpellingException({ word });
    return result;
  }

  applyIssue({ issue, text }) {
    if (!issue?.range) {
      return { text, error: "Missing issue range." };
    }
    const replacement = issue.suggestions?.[0] ?? "";
    const start = Math.max(0, issue.range.start ?? 0);
    const end = Math.max(start, issue.range.end ?? start);
    const nextText = `${text.slice(0, start)}${replacement}${text.slice(end)}`;
    return { text: nextText, range: { start, end }, replacement };
  }
}

export function buildDismissedChangeEntry({ text, issue, filePath }) {
  if (!filePath || !text || !issue?.range) {
    return null;
  }
  const change = normalizeSnippet(text.slice(issue.range.start, issue.range.end))
    || normalizeSnippet(issue.word ?? "")
    || normalizeSnippet(issue.suggestions?.[0] ?? "");
  const { before, after } = extractContext(text, issue.range.start, issue.range.end);
  if (!change && !before && !after) {
    return null;
  }
  return { filePath, change, before, after };
}

export function normalizeDismissedEntry(entry) {
  if (!entry?.filePath) {
    return null;
  }
  const sanitize = (value) =>
    String(value ?? "")
      .replace(/[\r\n\t]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  const change = sanitize(entry.change);
  const before = sanitize(entry.before);
  const after = sanitize(entry.after);
  if (!change && !before && !after) {
    return null;
  }
  return {
    filePath: entry.filePath,
    change,
    before,
    after
  };
}

export function formatDismissedLine(entry) {
  return [entry.filePath, entry.change, entry.before, entry.after].join("\t");
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

function filterDismissedIssues(issues, { text, entries }) {
  if (!entries?.length) {
    return issues ?? [];
  }
  return (issues ?? []).filter((issue) =>
    !isDismissedIssue({ issue, text, entries })
  );
}

function isDismissedIssue({ issue, text, entries }) {
  if (!issue?.range || !text) {
    return false;
  }
  const change = normalizeSnippet(text.slice(issue.range.start, issue.range.end))
    || normalizeSnippet(issue.word ?? "")
    || normalizeSnippet(issue.suggestions?.[0] ?? "");
  const { before, after } = extractContext(text, issue.range.start, issue.range.end);
  return entries.some((entry) => matchesDismissedEntry({ entry, change, before, after }));
}

function matchesDismissedEntry({ entry, change, before, after }) {
  const changeMatch = entry.change
    ? entry.change === change
    : true;
  const beforeMatch = entry.before
    ? before.endsWith(entry.before)
    : true;
  const afterMatch = entry.after
    ? after.startsWith(entry.after)
    : true;
  return changeMatch && beforeMatch && afterMatch;
}

function extractContext(text, start, end, wordCount = 6) {
  const beforeText = normalizeSnippet(text.slice(0, start));
  const afterText = normalizeSnippet(text.slice(end));
  const beforeWords = beforeText ? beforeText.split(" ") : [];
  const afterWords = afterText ? afterText.split(" ") : [];
  return {
    before: beforeWords.slice(-wordCount).join(" "),
    after: afterWords.slice(0, wordCount).join(" ")
  };
}

function normalizeSnippet(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDismissedEntries(entries) {
  return (entries ?? [])
    .map((entry) => normalizeDismissedEntry(entry))
    .filter(Boolean);
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
