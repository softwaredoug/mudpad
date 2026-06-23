import "./styles.css";
import { createEditor } from "./editor.js";
import { checkSpelling } from "./services/spell.js";
import { checkGrammar } from "./services/grammar.js";
import { analyzeWithLlm } from "./services/llm.js";

const openButton = document.getElementById("open-button");
const saveButton = document.getElementById("save-button");
const analyzeButton = document.getElementById("analyze-button");
const filePathLabel = document.getElementById("file-path");
const statusLabel = document.getElementById("status");
const issuesList = document.getElementById("issues-list");

let filePath = null;
let issuesByType = {
  spell: [],
  grammar: [],
  llm: []
};
let debounceHandle = null;

const editor = createEditor({
  parent: document.getElementById("editor"),
  initialText: "",
  onChange: handleEditorChange
});

function setStatus(message) {
  statusLabel.textContent = message ?? "";
}

function setFilePath(path) {
  filePath = path;
  filePathLabel.textContent = path ?? "No file opened";
}

function handleEditorChange() {
  issuesByType.llm = [];
  scheduleChecks();
}

function scheduleChecks() {
  if (debounceHandle) {
    clearTimeout(debounceHandle);
  }

  debounceHandle = setTimeout(async () => {
    const text = editor.getText();
    issuesByType.spell = checkSpelling(text);

    const grammarResult = await checkGrammar(text);
    issuesByType.grammar = grammarResult.issues;
    if (grammarResult.error) {
      setStatus(grammarResult.error);
    } else {
      setStatus("");
    }

    refreshIssues();
  }, 500);
}

function refreshIssues() {
  const allIssues = [...issuesByType.spell, ...issuesByType.grammar, ...issuesByType.llm];
  editor.setIssues(allIssues);
  renderIssues(allIssues);
}

function renderIssues(issues) {
  issuesList.innerHTML = "";

  if (issues.length === 0) {
    const empty = document.createElement("div");
    empty.textContent = "No issues";
    issuesList.appendChild(empty);
    return;
  }

  issues.forEach((issue) => {
    const item = document.createElement("div");
    item.className = "issue-item";

    const type = document.createElement("div");
    type.className = "issue-type";
    type.textContent = issue.type;

    const message = document.createElement("div");
    message.textContent = issue.message;

    const source = document.createElement("div");
    source.className = "issue-source";
    source.textContent = `Source: ${issue.source ?? "unknown"}`;

    const actions = document.createElement("div");
    actions.className = "issue-actions";

    const acceptButton = document.createElement("button");
    acceptButton.textContent = "Apply";
    acceptButton.disabled = !issue.suggestions || issue.suggestions.length === 0;
    acceptButton.addEventListener("click", () => applyIssue(issue));

    const rejectButton = document.createElement("button");
    rejectButton.textContent = "Dismiss";
    rejectButton.addEventListener("click", () => dismissIssue(issue));

    actions.appendChild(acceptButton);
    actions.appendChild(rejectButton);

    item.appendChild(type);
    item.appendChild(message);
    item.appendChild(source);
    if (issue.suggestions?.[0]) {
      const suggestion = document.createElement("div");
      suggestion.textContent = `Suggestion: ${issue.suggestions[0]}`;
      item.appendChild(suggestion);
    }
    item.appendChild(actions);
    issuesList.appendChild(item);
  });
}

function applyIssue(issue) {
  const replacement = issue.suggestions?.[0] ?? "";
  editor.replaceRange(issue.range.start, issue.range.end, replacement);
  scheduleChecks();
}

function dismissIssue(issue) {
  const list = issuesByType[issue.type] ?? [];
  issuesByType[issue.type] = list.filter((item) => item.id !== issue.id);
  refreshIssues();
}

openButton.addEventListener("click", async () => {
  const result = await window.api.openFile();
  if (!result) {
    return;
  }

  setFilePath(result.path);
  editor.setText(result.content ?? "");
  scheduleChecks();
});

saveButton.addEventListener("click", async () => {
  const result = await window.api.saveFile({
    path: filePath,
    content: editor.getText()
  });

  if (result?.path) {
    setFilePath(result.path);
    setStatus("Saved");
    setTimeout(() => setStatus(""), 1500);
  }
});

analyzeButton.addEventListener("click", async () => {
  setStatus("Analyzing...");
  const text = editor.getText();
  const result = await analyzeWithLlm(text);
  issuesByType.llm = result.issues;

  if (result.error) {
    setStatus(result.error);
  } else {
    setStatus("LLM analysis complete");
    setTimeout(() => setStatus(""), 1500);
  }

  refreshIssues();
});

window.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveButton.click();
  }
});
