import { createEditor } from "./editor.js";
import { FileService } from "./services/file-service.js";
import { CorrectionsService } from "./services/corrections-service.js";
import { CommitModal } from "./modals/commit-modal.js";
import { RepoModal } from "./modals/repo-modal.js";
import { RenameModal } from "./modals/rename-modal.js";
import { NewFolderModal } from "./modals/new-folder-modal.js";
import { DeleteModal } from "./modals/delete-modal.js";

const rendererStart = performance.now();
const logStartup = (message) => {
  const elapsed = Math.round(performance.now() - rendererStart);
  console.log(`[renderer +${elapsed}ms] ${message}`);
};

const fileService = new FileService();
const correctionsService = new CorrectionsService();
const modalMount = document.body;

const selectDirectoryButton = document.getElementById("select-directory-button");
const analyzeButton = document.getElementById("analyze-button");
const activeDirectoryInput = document.getElementById("active-directory");
const directoryErrorLabel = document.getElementById("directory-error");
const activeFileLabel = document.getElementById("active-file");
const statusLabel = document.getElementById("status");
const issuesList = document.getElementById("issues-list");
const filesList = document.getElementById("files-list");
const newFileButton = document.getElementById("new-file-button");
const newFolderButton = document.getElementById("new-folder-button");
const repoStatusButton = document.getElementById("repo-status");
const repoStatusDot = document.getElementById("repo-status-dot");
const repoStatusLabel = document.getElementById("repo-status-label");

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
let activeGlobPattern = null;
let activeDirectoryInputValue = null;
let activeFileContent = "";

const commitModal = new CommitModal({
  mountEl: modalMount,
  window,
  fileService,
  getFilePath: () => filePath,
  getEditorText: () => editor.getText(),
  setStatus: (message) => setStatus(message),
  refreshRepoStatus: () => refreshRepoStatus()
});

const repoModal = new RepoModal({
  mountEl: modalMount,
  window,
  fileService,
  getRepoStatus: () => repoStatus,
  setRepoStatus: (status) => setRepoStatus(status),
  getActiveDirectory: () => activeDirectory
});

const renameModal = new RenameModal({
  mountEl: modalMount,
  window,
  fileService,
  buildSummary: buildRenameSummary,
  onConfirm: async ({ result }) => {
    if (result?.path) {
      await openFile(result.path);
    }
    await refreshFileList();
    await refreshRepoStatus();
  },
  onDelete: (targetPath) => {
    renameModal.close();
    openDeleteModal(targetPath);
  }
});

const newFolderModal = new NewFolderModal({
  mountEl: modalMount,
  window,
  onConfirm: async ({ name }) => {
    if (!activeDirectory) {
      newFolderModal.setError("Select a folder to create a subfolder.");
      return;
    }
    const result = await fileService.createFolder({ directory: activeDirectory, name });
    if (result?.error) {
      newFolderModal.setError(result.error);
      setStatus(result.error);
      return;
    }
    newFolderModal.close();
    setStatus(`Folder created: ${name}`);
    setTimeout(() => setStatus(""), 1500);
    await refreshFileList();
  }
});

const deleteModal = new DeleteModal({
  mountEl: modalMount,
  window,
  onConfirm: async ({ filePath, messageShort, messageLong }) => {
    const result = await fileService.deleteFile({
      filePath,
      messageShort,
      messageLong
    });
    if (result?.error) {
      deleteModal.setError(result.error);
      return;
    }
    deleteModal.close();
    setFilePath(null);
    editor.setText("");
    await refreshFileList();
    await refreshRepoStatus();
  }
});

const editor = createEditor({
  parent: document.getElementById("editor"),
  initialText: "",
  onChange: handleEditorChange,
  onApplyIssue: applyIssue,
  onDismissIssue: dismissIssue,
  onIgnoreIssue: ignoreIssue
});

initializeDirectory();
logStartup("Renderer initialized");

function setStatus(message) {
  statusLabel.textContent = message ?? "";
}

function setFilePath(path) {
  filePath = path;
  activeFileLabel.textContent = path
    ? path.split("/").pop()
    : "No file selected";
  highlightActiveFile();
  if (!isMarkdownFile(filePath)) {
    issuesByType = { spell: [], grammar: [], llm: [] };
    refreshIssues();
  }
}

function setActiveDirectory(path) {
  activeDirectory = path;
  activeDirectoryInput.value = activeDirectoryInputValue ?? path ?? "";
  setDirectoryError("");
  if (path) {
    window.localStorage.setItem("activeDirectory", path);
    if (activeDirectoryInputValue) {
      window.localStorage.setItem("activeDirectoryInput", activeDirectoryInputValue);
    }
    fileService.setLastDirectory({
      directory: path,
      display: activeDirectoryInputValue ?? path
    });
  }
}

function setDirectoryError(message) {
  directoryErrorLabel.textContent = message ?? "";
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
  if (repoModal.isReady()) {
    repoModal.renderStatus(repoStatus);
  }
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
  const result = await fileService.getGitSyncStatus(activeDirectory);
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

  if (!isMarkdownFile(filePath)) {
    issuesByType = { spell: [], grammar: [], llm: [] };
    refreshIssues();
    return;
  }

  debounceHandle = setTimeout(async () => {
    const saved = await maybeSaveActiveFile();
    if (!saved) {
      return;
    }
    const text = editor.getText();
    const result = await correctionsService.checkCorrections({
      text,
      filePath
    });

    issuesByType.spell = result?.issues?.spell ?? [];
    issuesByType.grammar = result?.issues?.grammar ?? [];
    if (result?.errors?.grammar) {
      setStatus(result.errors.grammar);
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
    item.addEventListener("click", () => {
      if (issue.range) {
        editor.scrollTo(issue.range.start, issue.range.end);
      }
    });

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

    const ignoreButton = document.createElement("button");
    ignoreButton.textContent = "Always Ignore";
    const canIgnore = issue.type === "spell" && issue.word;
    ignoreButton.disabled = !canIgnore;
    if (!canIgnore) {
      ignoreButton.title = "Available for spelling only";
    } else {
      ignoreButton.addEventListener("click", () => ignoreIssue(issue));
    }
    actions.appendChild(ignoreButton);

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
    await correctionsService.setCorrectionsDirectory(null);
    return;
  }
  const result = await fileService.listTextFiles({
    directory: activeDirectory,
    pattern: activeGlobPattern
  });
  filesInDirectory = result?.files ?? [];
  renderFileList();
  await refreshRepoStatus();
  logStartup("File list refreshed");
}

async function initializeDirectory() {
  logStartup("Initialize directory start");
  const lastDirectory = await fileService.getLastDirectory();
  if (lastDirectory?.path) {
    const parsed = parseDirectoryInput(lastDirectory.display ?? lastDirectory.path);
    const validation = await fileService.validateDirectory(parsed.directory);
    if (validation?.ok) {
      activeGlobPattern = parsed.pattern;
      activeDirectoryInputValue = parsed.display;
      setActiveDirectory(parsed.directory);
      await correctionsService.setCorrectionsDirectory(parsed.directory);
      await refreshFileList();
      logStartup("Initialize directory done (last directory)");
      return;
    }
  }

  const storedInput = window.localStorage.getItem("activeDirectoryInput");
  if (storedInput) {
    const parsed = parseDirectoryInput(storedInput);
    const validation = await fileService.validateDirectory(parsed.directory);
    if (validation?.ok) {
      activeGlobPattern = parsed.pattern;
      activeDirectoryInputValue = parsed.display;
      setActiveDirectory(parsed.directory);
      await correctionsService.setCorrectionsDirectory(parsed.directory);
      await refreshFileList();
      logStartup("Initialize directory done (stored input)");
      return;
    }
  }

  const stored = window.localStorage.getItem("activeDirectory");
  if (stored) {
    const validation = await fileService.validateDirectory(stored);
    if (validation?.ok) {
      activeGlobPattern = null;
      activeDirectoryInputValue = stored;
      setActiveDirectory(stored);
      await correctionsService.setCorrectionsDirectory(stored);
      await refreshFileList();
      logStartup("Initialize directory done (stored)");
      return;
    }
  }

  const result = await fileService.getHomeDirectory();
  if (result?.path) {
    activeGlobPattern = null;
    activeDirectoryInputValue = result.path;
    setActiveDirectory(result.path);
    await correctionsService.setCorrectionsDirectory(result.path);
    await refreshFileList();
    logStartup("Initialize directory done (home)");
  }
}


async function applyDirectoryInput() {
  const value = activeDirectoryInput.value.trim();
  if (!value) {
    if (activeDirectoryInputValue) {
      activeDirectoryInput.value = activeDirectoryInputValue;
      setDirectoryError("");
      return;
    }
    setDirectoryError("Path is required.");
    return;
  }

  const parsed = parseDirectoryInput(value);
  const result = await fileService.validateDirectory(parsed.directory);
  if (!result?.ok) {
    setDirectoryError(result?.error ?? "Directory not found.");
    return;
  }

  activeGlobPattern = parsed.pattern;
  activeDirectoryInputValue = parsed.display;
  setActiveDirectory(parsed.directory);
  await correctionsService.setCorrectionsDirectory(parsed.directory);
  await refreshFileList();
}

async function openFile(path) {
  if (filePath && path !== filePath) {
    const saved = await maybeSaveActiveFile();
    if (!saved) {
      return;
    }
  }
  const result = await fileService.readFile(path);
  if (!result) {
    return;
  }
  setFilePath(result.path);
  editor.setText(result.content ?? "");
  activeFileContent = result.content ?? "";
  scheduleChecks();
}

async function handleFileDoubleClick(path) {
  if (path === filePath) {
    openRenameModal(path);
    return;
  }
  await openFile(path);
}

async function applyIssue(issue) {
  if (!filePath) {
    return;
  }
  const text = editor.getText();
  const result = await correctionsService.applyIssue({
    filePath,
    text,
    issue
  });
  if (result?.error) {
    setStatus(result.error);
    return;
  }
  if (typeof result?.text === "string") {
    editor.setText(result.text);
  }
  if (result?.issues) {
    issuesByType.spell = result.issues.spell ?? [];
    issuesByType.grammar = result.issues.grammar ?? [];
    issuesByType.llm = result.issues.llm ?? [];
    refreshIssues();
  } else {
    scheduleChecks();
  }
}

async function dismissIssue(issue) {
  if (activeDirectory && filePath) {
    const text = editor.getText();
    const result = await correctionsService.addDismissedChange({
      directory: activeDirectory,
      filePath,
      text,
      issue
    });
    if (result?.error) {
      setStatus(result.error);
      return;
    }
    if (result?.issues) {
      issuesByType.spell = result.issues.spell ?? [];
      issuesByType.grammar = result.issues.grammar ?? [];
      issuesByType.llm = result.issues.llm ?? [];
      refreshIssues();
      return;
    }
  }
  const list = issuesByType[issue.type] ?? [];
  issuesByType[issue.type] = list.filter((item) => item.id !== issue.id);
  refreshIssues();
}

async function ignoreIssue(issue) {
  if (!activeDirectory) {
    setStatus("Select a folder to manage spelling exceptions.");
    return;
  }
  const word = issue.word?.trim();
  if (!word) {
    return;
  }
  const result = await correctionsService.addSpellingException({
    directory: activeDirectory,
    filePath,
    word,
    text: editor.getText()
  });
  if (result?.error) {
    setStatus(result.error);
    return;
  }
  if (result?.issues) {
    issuesByType.spell = result.issues.spell ?? [];
    issuesByType.grammar = result.issues.grammar ?? [];
    issuesByType.llm = result.issues.llm ?? [];
    refreshIssues();
    return;
  }
  scheduleChecks();
}

selectDirectoryButton.addEventListener("click", async () => {
  const result = await fileService.selectDirectory();
  if (!result?.path) {
    return;
  }
  activeGlobPattern = null;
  activeDirectoryInputValue = result.path;
  setActiveDirectory(result.path);
  await correctionsService.setCorrectionsDirectory(result.path);
  await refreshFileList();
});

newFileButton.addEventListener("click", async () => {
  if (!activeDirectory) {
    setStatus("Select a folder to add a file.");
    return;
  }
  const result = await fileService.createNewFile(activeDirectory);
  if (result?.error) {
    setStatus(result.error);
    return;
  }
  if (result?.path) {
    await openFile(result.path);
  }
  await refreshFileList();
});

newFolderButton.addEventListener("click", () => {
  if (!activeDirectory) {
    setStatus("Select a folder to add a new folder.");
    return;
  }
  openNewFolderModal();
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
  console.log("Analyzing")
  if (!isMarkdownFile(filePath)) {
    setStatus("Corrections are available only for markdown files.");
    return;
  }
  if (debounceHandle) {
    clearTimeout(debounceHandle);
    debounceHandle = null;
  }
  setStatus("Analyzing...");
  const text = editor.getText();
  const result = await correctionsService.analyzeCorrections({
    text,
    filePath
  });
  issuesByType.spell = result?.issues?.spell ?? [];
  issuesByType.grammar = result?.issues?.grammar ?? [];
  issuesByType.llm = [];
  console.log("Analysis result:", result);

  if (result?.errors?.grammar) {
    setStatus(result.errors.grammar);
  } else {
    setStatus("Analysis complete");
    setTimeout(() => setStatus(""), 1500);
  }

  console.debug("Analysis result:", result);
  refreshIssues();
});

function isMarkdownFile(path) {
  if (!path) {
    return false;
  }
  const lower = path.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".markdown") || lower.endsWith(".mdx");
}

async function maybeSaveActiveFile() {
  if (!filePath) {
    return true;
  }
  const currentText = editor.getText();
  if (currentText === activeFileContent) {
    return true;
  }
  const result = await fileService.saveFile({ filePath, content: currentText });
  if (result?.error) {
    setStatus(result.error);
    return false;
  }
  activeFileContent = currentText;
  return true;
}

function parseDirectoryInput(value) {
  const trimmed = value.trim();
  const globIndex = trimmed.search(/[\*\?\[]/);
  if (globIndex === -1) {
    return { directory: trimmed, pattern: null, display: trimmed };
  }

  const separatorIndex = trimmed.lastIndexOf("/", globIndex);
  if (separatorIndex === -1) {
    return { directory: trimmed, pattern: null, display: trimmed };
  }

  const directory = trimmed.slice(0, separatorIndex) || "/";
  const pattern = trimmed.slice(separatorIndex + 1);
  return { directory, pattern, display: trimmed };
}

repoStatusButton.addEventListener("click", () => {
  if (!repoStatus?.available) {
    return;
  }
  openRepoModal();
});

function openCommitModal() {
  commitModal.open();
}

function openRenameModal(path) {
  renameModal.open({
    path,
    requiresCommit: Boolean(repoStatus?.available)
  });
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
  repoModal.open();
}

function openDeleteModal(path) {
  deleteModal.open({
    path,
    requiresCommit: Boolean(repoStatus?.available),
    summary: repoStatus?.available ? buildDeleteSummary(path) : ""
  });
}

function openNewFolderModal() {
  newFolderModal.open();
}


window.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    if (commitModal.isOpen()) {
      return;
    }
    if (!filePath) {
      setStatus("Select a file to commit.");
      return;
    }
    openCommitModal();
  }
});
