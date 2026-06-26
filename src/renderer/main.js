import { createEditor } from "./editor.js";
import { FileService } from "./services/file-service.js";
import { CorrectionsService } from "./services/corrections-service.js";
import { EditorComponent } from "./components/editor-component.js";
import { IssuesSidebar } from "./components/issues-sidebar.js";
import { DirectorySelector } from "./components/directory-selector.js";
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

let activeFilePath = null;
let activeDirectory = null;
let filesInDirectory = [];
let repoStatus = null;
let activeGlobPattern = null;

let editorComponent;
let issuesSidebar;
let directorySelector;

const editor = createEditor({
  parent: document.getElementById("editor"),
  initialText: "",
  onChange: () => editorComponent?.handleEditorChange(),
  onApplyIssue: (issue) => editorComponent?.applyIssue(issue),
  onDismissIssue: (issue) => editorComponent?.dismissIssue(issue),
  onIgnoreIssue: (issue) => editorComponent?.ignoreIssue(issue)
});

issuesSidebar = new IssuesSidebar({
  mountEl: issuesList,
  onIssueSelect: (issue) => {
    if (issue.range) {
      editor.scrollTo(issue.range.start, issue.range.end);
    }
  },
  onStatus: (message) => setStatus(message)
});

editorComponent = new EditorComponent({
  editor,
  fileService,
  correctionsService,
  onStatus: (message) => setStatus(message),
  onIssuesChanged: (issues) => issuesSidebar.render(issues),
  onFileChanged: (path) => setActiveFilePath(path)
});

directorySelector = new DirectorySelector({
  fileService,
  selectButton: selectDirectoryButton,
  input: activeDirectoryInput,
  errorLabel: directoryErrorLabel,
  onChange: async ({ directory, pattern, display }) => {
    activeDirectory = directory;
    activeGlobPattern = pattern;
    await editorComponent.setActiveDirectory(directory);
    await refreshFileList();
  },
  onStatus: (message) => setStatus(message)
});

const commitModal = new CommitModal({
  mountEl: modalMount,
  window,
  fileService,
  editorComponent,
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
      await editorComponent.openFile(result.path);
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
    editorComponent.closeFile();
    await refreshFileList();
    await refreshRepoStatus();
  }
});

directorySelector.initialize();
logStartup("Renderer initialized");

function setStatus(message) {
  statusLabel.textContent = message ?? "";
}

function setActiveFilePath(path) {
  activeFilePath = path;
  activeFileLabel.textContent = path
    ? path.split("/").pop()
    : "No file selected";
  highlightActiveFile();
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
    if (item.dataset.path === activeFilePath) {
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
    await editorComponent.setActiveDirectory(null);
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



async function openFile(path) {
  await editorComponent.openFile(path);
}

async function handleFileDoubleClick(path) {
  if (path === activeFilePath) {
    openRenameModal(path);
    return;
  }
  await openFile(path);
}



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


analyzeButton.addEventListener("click", async () => {
  await editorComponent.analyze();
});


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
    if (!editorComponent.getFilePath()) {
      setStatus("Select a file to commit.");
      return;
    }
    openCommitModal();
  }
});
