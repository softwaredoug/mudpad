export function extractFrontmatter(text) {
  if (!text || !(text.startsWith("---\n") || text.startsWith("---\r\n"))) {
    return { body: text ?? "", offset: 0 };
  }

  const match = text.match(/^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)\r?\n/);
  if (!match) {
    return { body: text ?? "", offset: 0 };
  }

  const offset = match[0].length;
  return { body: text.slice(offset), offset };
}

export function maskCodeBlocks(text) {
  if (!text) {
    return "";
  }

  const lines = text.split(/\r?\n/);
  const separators = text.match(/\r?\n/g) ?? [];
  const output = [];
  let inBlock = false;
  let fence = "";

  lines.forEach((line, index) => {
    const trimmed = line.trimStart();
    const isFence = trimmed.startsWith("```") || trimmed.startsWith("~~~");
    if (isFence) {
      if (!inBlock) {
        inBlock = true;
        fence = trimmed.slice(0, 3);
      } else if (trimmed.startsWith(fence)) {
        inBlock = false;
        fence = "";
      }
      output.push(" ".repeat(line.length));
    } else if (inBlock) {
      output.push(" ".repeat(line.length));
    } else {
      output.push(line);
    }

    if (separators[index]) {
      output.push(separators[index]);
    }
  });

  return output.join("");
}

export function maskLinks(text) {
  if (!text) {
    return "";
  }

  const chars = Array.from(text);
  const linkPattern = /!?\[[^\]]*\]\(([^)]*)\)/g;
  let match = null;

  while ((match = linkPattern.exec(text)) !== null) {
    const fullMatch = match[0];
    const matchIndex = match.index;
    const openParenIndex = fullMatch.lastIndexOf("(");
    const closeParenIndex = fullMatch.lastIndexOf(")");
    if (openParenIndex === -1 || closeParenIndex === -1) {
      continue;
    }
    const start = matchIndex + openParenIndex + 1;
    const end = matchIndex + closeParenIndex;
    for (let i = start; i < end; i += 1) {
      if (chars[i] !== "\n" && chars[i] !== "\r") {
        chars[i] = " ";
      }
    }
  }

  return chars.join("");
}
