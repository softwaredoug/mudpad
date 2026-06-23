const MISSPELLINGS = [
  { word: "teh", suggestion: "the" },
  { word: "recieve", suggestion: "receive" },
  { word: "definately", suggestion: "definitely" }
];

export function checkSpelling(text) {
  const issues = [];
  const lower = text.toLowerCase();

  MISSPELLINGS.forEach((entry, index) => {
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
