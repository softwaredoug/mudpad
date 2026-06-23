import "./styles.css";
import { createEditor } from "./editor.js";
import { checkSpelling } from "./services/spell.js";
import { checkGrammar } from "./services/grammar.js";
import { analyzeWithLlm } from "./services/llm.js";

const selectDirectoryButton = document.getElementById("select-directory-button");
const analyzeButton = document.getElementById("analyze-button");
const activeDirectoryInput = document.getElementById("active-directory");
const directoryErrorLabel = document.getElementById("directory-error");
const activeFileLabel = document.getElementById("active-file");
const statusLabel = document.getElementById("status");
const issuesList = document.getElementById("issues-list");
const filesList = document.getElementById("files-list");
const newFileButton = document.getElementById("new-file-button");
const commitModal = document.getElementById("commit-modal");
const commitSummaryInput = document.getElementById("commit-summary");
const commitDetailsInput = document.getElementById("commit-details");
const commitCancelButton = document.getElementById("commit-cancel");
const commitConfirmButton = document.getElementById("commit-confirm");
const commitErrorLabel = document.getElementById("commit-error");
const repoStatusButton = document.getElementById("repo-status");
const repoStatusDot = document.getElementById("repo-status-dot");
const repoStatusLabel = document.getElementById("repo-status-label");
const repoModal = document.getElementById("repo-modal");
const repoStatusSummary = document.getElementById("repo-status-summary");
const repoStatusDetails = document.getElementById("repo-status-details");
const repoStatusError = document.getElementById("repo-status-error");
const repoCloseButton = document.getElementById("repo-close");
const repoSyncButton = document.getElementById("repo-sync");
const renameModal = document.getElementById("rename-modal");
const renameInput = document.getElementById("rename-input");
const renameGitFields = document.getElementById("rename-git-fields");
const renameSummaryInput = document.getElementById("rename-summary");
const renameDetailsInput = document.getElementById("rename-details");
const renameCancelButton = document.getElementById("rename-cancel");
const renameDeleteButton = document.getElementById("rename-delete");
const renameConfirmButton = document.getElementById("rename-confirm");
const renameErrorLabel = document.getElementById("rename-error");

let filePath = null;
let activeDirectory = null;
let filesInDirectory = [];
let issuesByType = {
  spell: [],
  grammar: [],
  llm: []
};
let debounceHandle = null;
let repoStatus = null;
let renameTargetPath = null;
let renameRequiresCommit = false;
let renameSummaryAuto = false;
let deleteSummaryAuto = false;
let renameMode = "rename";

const editor = createEditor({
  parent: document.getElementById("editor"),
  initialText: "",
  onChange: handleEditorChange,
  onApplyIssue: applyIssue,
  onDismissIssue: dismissIssue
});

initializeDirectory();

function setStatus(message) {
  statusLabel.textContent = message ?? "";
}

function setFilePath(path) {
  filePath = path;
  activeFileLabel.textContent = path
    ? path.split("/").pop()
    : "No file selected";
  highlightActiveFile();
}

function setActiveDirectory(path) {
  activeDirectory = path;
  activeDirectoryInput.value = path ?? "";
  setDirectoryError("");
  if (path) {
    window.localStorage.setItem("activeDirectory", path);
  }
}

function setDirectoryError(message) {
  directoryErrorLabel.textContent = message ?? "";
}

function setCommitError(message) {
  commitErrorLabel.textContent = message ?? "";
}

function extractFrontmatter(text) {
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

function offsetIssues(issues, offset) {
  if (!offset) {
    return issues ?? [];
  }
  return (issues ?? []).map((issue) => {
    if (!issue?.range) {
      return issue;
    }
    return {
      ...issue,
      range: {
        start: issue.range.start + offset,
        end: issue.range.end + offset
      }
    };
  });
}

function setRepoStatus(nextStatus) {
  repoStatus = nextStatus;
  if (!repoStatus?.available) {
    repoStatusButton.classList.add("hidden");
    return;
  }

  repoStatusButton.classList.remove("hidden");
  const isSynced = repoStatus.upstream && repoStatus.ahead === 0 && repoStatus.behind === 0;
  repoStatusDot.classList.toggle("synced", isSynced);
  repoStatusDot.classList.toggle("unsynced", !isSynced);
  repoStatusLabel.textContent = isSynced ? "Synced" : "Out of sync";
}

async function refreshRepoStatus() {
  if (!activeDirectory) {
    setRepoStatus(null);
    return;
  }
  const result = await window.api.getGitSyncStatus(activeDirectory);
  setRepoStatus(result);
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
    const { body, offset } = extractFrontmatter(text);
    issuesByType.spell = offsetIssues(checkSpelling(body), offset);

    const grammarResult = await checkGrammar(body);
    issuesByType.grammar = offsetIssues(grammarResult.issues, offset);
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

function renderFileList() {
  filesList.innerHTML = "";

  if (!filesInDirectory.length) {
    const empty = document.createElement("div");
    empty.className = "files-empty";
    empty.textContent = activeDirectory
      ? "No markdown files found"
      : "Select a folder to begin";
    filesList.appendChild(empty);
    return;
  }

  filesInDirectory.forEach((file) => {
    const item = document.createElement("div");
    item.className = "file-item";
    item.textContent = file.relativePath;
    item.dataset.path = file.path;
    item.addEventListener("dblclick", () => handleFileDoubleClick(file.path));
    filesList.appendChild(item);
  });

  highlightActiveFile();
}

function highlightActiveFile() {
  const items = Array.from(filesList.querySelectorAll(".file-item"));
  items.forEach((item) => {
    if (item.dataset.path === filePath) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });
}

async function refreshFileList() {
  if (!activeDirectory) {
    filesInDirectory = [];
    renderFileList();
    setRepoStatus(null);
    return;
  }
  const result = await window.api.listMarkdownFiles(activeDirectory);
  filesInDirectory = result?.files ?? [];
  renderFileList();
  await refreshRepoStatus();
}

async function initializeDirectory() {
  const stored = window.localStorage.getItem("activeDirectory");
  if (stored) {
    const validation = await window.api.validateDirectory(stored);
    if (validation?.ok) {
      setActiveDirectory(stored);
      await refreshFileList();
      return;
    }
  }

  const result = await window.api.getHomeDirectory();
  if (result?.path) {
    setActiveDirectory(result.path);
    await refreshFileList();
  }
}

async function applyDirectoryInput() {
  const value = activeDirectoryInput.value.trim();
  if (!value) {
    setDirectoryError("Path is required.");
    return;
  }

  const result = await window.api.validateDirectory(value);
  if (!result?.ok) {
    setDirectoryError(result?.error ?? "Directory not found.");
    return;
  }

  setActiveDirectory(value);
  await refreshFileList();
}

async function openFile(path) {
  const result = await window.api.readFile(path);
  if (!result) {
    return;
  }
  setFilePath(result.path);
  editor.setText(result.content ?? "");
  scheduleChecks();
}

async function handleFileDoubleClick(path) {
  if (path === filePath) {
    openRenameModal(path);
    return;
  }
  await openFile(path);
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

selectDirectoryButton.addEventListener("click", async () => {
  const result = await window.api.selectDirectory();
  if (!result?.path) {
    return;
  }
  setActiveDirectory(result.path);
  await refreshFileList();
});

newFileButton.addEventListener("click", async () => {
  if (!activeDirectory) {
    setStatus("Select a folder to add a file.");
    return;
  }
  const result = await window.api.createNewFile(activeDirectory);
  if (result?.error) {
    setStatus(result.error);
    return;
  }
  if (result?.path) {
    await openFile(result.path);
  }
  await refreshFileList();
});

activeDirectoryInput.addEventListener("keydown", async (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    await applyDirectoryInput();
  }
});

activeDirectoryInput.addEventListener("blur", async () => {
  await applyDirectoryInput();
});

analyzeButton.addEventListener("click", async () => {
  setStatus("Analyzing...");
  const text = editor.getText();
  const { body, offset } = extractFrontmatter(text);
  const result = await analyzeWithLlm(body);
  issuesByType.llm = offsetIssues(result.issues, offset);

  if (result.error) {
    setStatus(result.error);
  } else {
    setStatus("LLM analysis complete");
    setTimeout(() => setStatus(""), 1500);
  }

  refreshIssues();
});

commitCancelButton.addEventListener("click", () => closeCommitModal());
commitConfirmButton.addEventListener("click", async () => {
  const summary = commitSummaryInput.value.trim();
  const details = commitDetailsInput.value.trim();

  if (!summary) {
    setCommitError("Summary is required.");
    return;
  }
  if (!filePath) {
    setCommitError("Select a file to commit.");
    return;
  }

  setCommitError("");
  setStatus("Committing...");
  const result = await window.api.saveAndCommit({
    path: filePath,
    content: editor.getText(),
    messageShort: summary,
    messageLong: details
  });

  if (result?.error) {
    setStatus(result.error);
    setCommitError(result.error);
    return;
  }

  closeCommitModal();
  setStatus("Committed");
  setTimeout(() => setStatus(""), 1500);
  await refreshRepoStatus();
});

commitModal.addEventListener("click", (event) => {
  if (event.target.classList.contains("modal-backdrop")) {
    closeCommitModal();
  }
});

repoStatusButton.addEventListener("click", () => {
  if (!repoStatus?.available) {
    return;
  }
  openRepoModal();
});

repoCloseButton.addEventListener("click", () => closeRepoModal());
repoSyncButton.addEventListener("click", async () => {
  if (!repoStatus?.available) {
    return;
  }
  repoStatusError.textContent = "";
  repoSyncButton.disabled = true;
  repoSyncButton.textContent = "Syncing...";

  const result = await window.api.syncWithOrigin(activeDirectory);
  repoSyncButton.disabled = false;
  repoSyncButton.textContent = "Sync with origin";

  if (result?.error) {
    repoStatusError.textContent = result.error;
    return;
  }
  setRepoStatus(result);
  renderRepoStatusDetails();
});

repoModal.addEventListener("click", (event) => {
  if (event.target.classList.contains("modal-backdrop")) {
    closeRepoModal();
  }
});

renameModal.addEventListener("click", (event) => {
  if (event.target.classList.contains("modal-backdrop")) {
    closeRenameModal();
  }
});

function openCommitModal() {
  commitModal.classList.remove("hidden");
  commitModal.setAttribute("aria-hidden", "false");
  setCommitError("");
  commitSummaryInput.focus();
}

function closeCommitModal() {
  commitModal.classList.add("hidden");
  commitModal.setAttribute("aria-hidden", "true");
  commitSummaryInput.value = "";
  commitDetailsInput.value = "";
  setCommitError("");
}

function openRenameModal(path) {
  renameTargetPath = path;
  renameMode = "rename";
  renameRequiresCommit = Boolean(repoStatus?.available);
  renameGitFields.classList.toggle("hidden", !renameRequiresCommit);
  renameModal.classList.remove("hidden");
  renameModal.setAttribute("aria-hidden", "false");
  renameInput.value = path.split("/").pop() ?? "";
  renameSummaryInput.value = renameRequiresCommit
    ? buildRenameSummary(path, renameInput.value)
    : "";
  renameSummaryAuto = renameRequiresCommit;
  deleteSummaryAuto = renameRequiresCommit;
  renameDetailsInput.value = "";
  setRenameError("");
  renameInput.focus();
  renameInput.select();
}

function closeRenameModal() {
  renameModal.classList.add("hidden");
  renameModal.setAttribute("aria-hidden", "true");
  renameTargetPath = null;
  renameRequiresCommit = false;
  renameSummaryAuto = false;
  deleteSummaryAuto = false;
  renameMode = "rename";
  setRenameError("");
}

function setRenameError(message) {
  renameErrorLabel.textContent = message ?? "";
}

function buildRenameSummary(oldPath, newName) {
  if (!oldPath || !newName) {
    return "";
  }
  const baseDir = activeDirectory || "";
  const oldLabel = baseDir ? oldPath.replace(`${baseDir}/`, "") : oldPath;
  const newPath = baseDir ? `${baseDir}/${newName}` : newName;
  const newLabel = baseDir ? newPath.replace(`${baseDir}/`, "") : newPath;
  return `Moved file ${oldLabel} to ${newLabel}`;
}

function buildDeleteSummary(path) {
  if (!path) {
    return "";
  }
  const baseDir = activeDirectory || "";
  const label = baseDir ? path.replace(`${baseDir}/`, "") : path;
  return `Deleted file ${label}`;
}

function openRepoModal() {
  renderRepoStatusDetails();
  repoModal.classList.remove("hidden");
  repoModal.setAttribute("aria-hidden", "false");
}

function closeRepoModal() {
  repoModal.classList.add("hidden");
  repoModal.setAttribute("aria-hidden", "true");
  repoStatusError.textContent = "";
}

function renderRepoStatusDetails() {
  if (!repoStatus?.available) {
    repoStatusSummary.textContent = "No git repository detected.";
    repoStatusDetails.textContent = "";
    repoSyncButton.disabled = true;
    return;
  }

  const statusLine = repoStatus.statusSummary || "";
  const upstreamText = repoStatus.upstream || "No upstream configured";
  const syncLine = repoStatus.upstream
    ? `Ahead ${repoStatus.ahead}, behind ${repoStatus.behind}`
    : "Upstream not set";
  const cleanLine = repoStatus.dirty ? "Working tree: dirty" : "Working tree: clean";
  const fetchLine = repoStatus.fetchError ? `Fetch: ${repoStatus.fetchError}` : "Fetch: ok";

  repoStatusSummary.textContent = statusLine;
  repoStatusDetails.textContent = [
    `Branch: ${repoStatus.branch || "unknown"}`,
    `Upstream: ${upstreamText}`,
    syncLine,
    cleanLine,
    fetchLine
  ].join("\n");

  repoSyncButton.disabled = !repoStatus.upstream;
}

window.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    if (!commitModal.classList.contains("hidden")) {
      return;
    }
    if (!filePath) {
      setStatus("Select a file to commit.");
      return;
    }
    openCommitModal();
  }
  if (event.key === "Escape" && !commitModal.classList.contains("hidden")) {
    closeCommitModal();
  }
  if (event.key === "Escape" && !repoModal.classList.contains("hidden")) {
    closeRepoModal();
  }
  if (event.key === "Escape" && !renameModal.classList.contains("hidden")) {
    closeRenameModal();
  }
});

renameCancelButton.addEventListener("click", () => closeRenameModal());
renameConfirmButton.addEventListener("click", async () => {
  renameMode = "rename";
  if (!renameTargetPath) {
    setRenameError("No file selected.");
    return;
  }
  const newName = renameInput.value.trim();
  if (!newName) {
    setRenameError("New filename is required.");
    return;
  }
  const summary = renameSummaryInput.value.trim();
  const details = renameDetailsInput.value.trim();
  if (renameRequiresCommit && !summary) {
    setRenameError("Commit summary is required.");
    return;
  }

  setRenameError("");
  const result = await window.api.renameFile({
    oldPath: renameTargetPath,
    newName,
    messageShort: summary,
    messageLong: details
  });

  if (result?.error) {
    setRenameError(result.error);
    return;
  }

  closeRenameModal();
  if (result?.path) {
    await openFile(result.path);
  }
  await refreshFileList();
  await refreshRepoStatus();
});

renameDeleteButton.addEventListener("click", async () => {
  if (!renameTargetPath) {
    setRenameError("No file selected.");
    return;
  }
  if (!window.confirm("Delete this file?")) {
    return;
  }
  renameMode = "delete";
  if (renameRequiresCommit && deleteSummaryAuto) {
    renameSummaryInput.value = buildDeleteSummary(renameTargetPath);
  }
  const summary = renameSummaryInput.value.trim();
  const details = renameDetailsInput.value.trim();
  if (renameRequiresCommit && !summary) {
    setRenameError("Commit summary is required.");
    return;
  }

  setRenameError("");
  const result = await window.api.deleteFile({
    filePath: renameTargetPath,
    messageShort: summary,
    messageLong: details
  });

  if (result?.error) {
    setRenameError(result.error);
    return;
  }

  closeRenameModal();
  setFilePath(null);
  editor.setText("");
  await refreshFileList();
  await refreshRepoStatus();
});

renameInput.addEventListener("input", () => {
  if (!renameRequiresCommit) {
    return;
  }
  if (!renameSummaryAuto) {
    return;
  }
  renameSummaryInput.value = buildRenameSummary(renameTargetPath, renameInput.value.trim());
});

renameSummaryInput.addEventListener("input", () => {
  if (!renameRequiresCommit) {
    return;
  }
  renameSummaryAuto = false;
  deleteSummaryAuto = false;
});

window.addEventListener("keydown", (event) => {
  if (!commitModal.classList.contains("hidden") && (event.metaKey || event.ctrlKey)) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitConfirmButton.click();
    }
  }
});
