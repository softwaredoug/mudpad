import { BaseComponent } from "../modals/base-component.js";
import { DeleteModal } from "../modals/delete-modal.js";
import { NewFolderModal } from "../modals/new-folder-modal.js";
import { RenameModal } from "../modals/rename-modal.js";

export class FileList {
  constructor({
    mountEl,
    onStatus,
    fileService,
    modalMount,
    window,
    onFileOpen,
    onFileDelete,
    onRepoRefresh,
    getRepoStatus
  }) {
    this.base = new BaseComponent({
      mountEl,
      templateUrl: new URL("./file-list.html?raw", import.meta.url)
    });
    this.document = mountEl?.ownerDocument ?? document;
    this.onStatus = onStatus ?? (() => {});
    this.fileService = fileService;
    this.onFileOpen = onFileOpen ?? (() => {});
    this.onFileDelete = onFileDelete ?? (() => {});
    this.onRepoRefresh = onRepoRefresh ?? (() => {});
    this.getRepoStatus = getRepoStatus ?? (() => null);
    this.modalMount = modalMount;
    this.window = window;
    this.files = [];
    this.activeDirectory = null;
    this.activePattern = null;
    this.activeFilePath = null;
    this.tooMany = false;
    this.newFolderModal = null;
    this.renameModal = null;
    this.deleteModal = null;
    this.listEl = null;
    this.newFileButton = null;
    this.newFolderButton = null;
    this._bound = false;
  }

  async ensureReady() {
    await this.base.ensureReady();
    if (this._bound) {
      return;
    }
    let lastPath = await this.fileService.getLastFilePath();
    if (lastPath.lastFilePath) {
      setTimeout(() => {
        this.openFile(lastPath.lastFilePath);
      });
    }
    this.listEl = this.base.query(".files-list");
    this.newFileButton = this.base.query(".new-file-button");
    this.newFolderButton = this.base.query(".new-folder-button");
    this.newFolderModal = new NewFolderModal({
      mountEl: this.modalMount,
      window: this.window,
      onConfirm: ({ name }) => this.handleNewFolderConfirm({ name })
    });
    this.renameModal = new RenameModal({
      mountEl: this.modalMount,
      window: this.window,
      fileService: this.fileService,
      buildSummary: (oldPath, newName) => this.buildRenameSummary(oldPath, newName),
      onConfirm: async ({ result }) => {
        if (result?.path) {
          await this.openFile(result.path);
        }
        await this.refreshFileList({
          directory: this.activeDirectory,
          pattern: this.activePattern
        });
        await this.onRepoRefresh();
      },
      onDelete: (targetPath) => {
        this.renameModal.close();
        this.openDeleteModal(targetPath);
      }
    });
    this.deleteModal = new DeleteModal({
      mountEl: this.modalMount,
      window: this.window,
      onConfirm: async ({ filePath, messageShort, messageLong }) => {
        const result = await this.fileService.deleteFile({
          filePath,
          messageShort,
          messageLong
        });
        if (result?.error) {
          this.deleteModal.setError(result.error);
          return;
        }
        this.deleteModal.close();
        await this.refreshFileList({
          directory: this.activeDirectory,
          pattern: this.activePattern
        });
        await this.onRepoRefresh();
        await this.onFileDelete(filePath);
      }
    });
    this.newFileButton?.addEventListener("click", () => this.handleNewFileClick());
    this.newFolderButton?.addEventListener("click", () => this.handleNewFolderClick());
    this._bound = true;
    this.render();
  }

  static async create({
    mountEl,
    onStatus,
    fileService,
    modalMount,
    window,
    onFileOpen,
    onFileDelete,
    onRepoRefresh,
    getRepoStatus
  }) {
    const fileList = new FileList({
      mountEl,
      onStatus,
      fileService,
      modalMount,
      window,
      onFileOpen,
      onFileDelete,
      onRepoRefresh,
      getRepoStatus
    });
    await fileList.ensureReady();
    return fileList;
  }


  setFiles({ files, activeDirectory, tooMany }) {
    this.files = files ?? [];
    this.activeDirectory = activeDirectory ?? null;
    this.tooMany = Boolean(tooMany);
    this.render();
  }

  setActiveFilePath(path) {
    this.activeFilePath = path ?? null;
    this.highlightActiveFile();
  }

  render() {
    if (!this.listEl) {
      throw new Error("FileList not ready. Call ensureReady() first.");
    }
    this.listEl.innerHTML = "";

    if (!this.files.length) {
      const empty = this.document.createElement("div");
      empty.className = "files-empty";
      empty.textContent = this.activeDirectory
        ? "No markdown files found"
        : "Select a folder to begin";
      this.listEl.appendChild(empty);
      return;
    }

    this.files.forEach((file) => {
      const item = this.document.createElement("div");
      item.className = "file-item";
      item.textContent = file.relativePath;
      item.dataset.path = file.path;
      item.addEventListener("dblclick", () => this.handleFileDoubleClick(file.path));
      this.listEl.appendChild(item);
    });

    if (this.tooMany) {
      const warning = this.document.createElement("div");
      warning.className = "files-warning";
      warning.textContent = "⚠️ Too many files to list. Showing first 1000.";
      this.listEl.appendChild(warning);
    }

    this.highlightActiveFile();
  }

  highlightActiveFile() {
    if (!this.listEl) {
      throw new Error("FileList not ready. Call ensureReady() first.");
    }
    const items = Array.from(this.listEl.querySelectorAll(".file-item"));
    items.forEach((item) => {
      if (item.dataset.path === this.activeFilePath) {
        item.classList.add("active");
      } else {
        item.classList.remove("active");
      }
    });
  }

  async handleFileDoubleClick(path) {
    if (!path) {
      return;
    }
    if (path === this.activeFilePath) {
      this.openRenameModal(path);
      return;
    }
    await this.openFile(path);
  }

  openRenameModal(path) {
    const repoStatus = this.getRepoStatus();
    this.renameModal.open({
      path,
      requiresCommit: Boolean(repoStatus?.available)
    });
  }

  async openFile(path) {
    this.fileService.setLastFilePath(path);
    this.onFileOpen(path);
  }

  openDeleteModal(path) {
    const repoStatus = this.getRepoStatus();
    this.deleteModal.open({
      path,
      requiresCommit: Boolean(repoStatus?.available),
      summary: repoStatus?.available ? this.buildDeleteSummary(path) : ""
    });
  }

  buildRenameSummary(oldPath, newName) {
    if (!oldPath || !newName) {
      return "";
    }
    const baseDir = this.activeDirectory || "";
    const oldLabel = baseDir ? oldPath.replace(`${baseDir}/`, "") : oldPath;
    const newPath = baseDir ? `${baseDir}/${newName}` : newName;
    const newLabel = baseDir ? newPath.replace(`${baseDir}/`, "") : newPath;
    return `Moved file ${oldLabel} to ${newLabel}`;
  }

  buildDeleteSummary(path) {
    if (!path) {
      return "";
    }
    const baseDir = this.activeDirectory || "";
    const label = baseDir ? path.replace(`${baseDir}/`, "") : path;
    return `Deleted file ${label}`;
  }

  async handleNewFileClick() {
    if (!this.activeDirectory) {
      this.onStatus("Select a folder to add a file.");
      return;
    }
    const result = await this.fileService.createNewFile(this.activeDirectory);
    if (result?.error) {
      this.onStatus(result.error);
      return;
    }
    if (result?.path) {
      await this.openFile(result.path);
    }
    await this.refreshFileList({
      directory: this.activeDirectory,
      pattern: this.activePattern
    });
  }

  async createNewFile() {
    await this.handleNewFileClick();
  }

  async handleNewFolderClick() {
    if (!this.activeDirectory) {
      this.onStatus("Select a folder to add a new folder.");
      return;
    }
    await this.newFolderModal?.open();
  }

  async handleNewFolderConfirm({ name }) {
    if (!this.activeDirectory) {
      this.newFolderModal?.setError("Select a folder to create a subfolder.");
      return;
    }
    const result = await this.fileService.createFolder({
      directory: this.activeDirectory,
      name
    });
    if (result?.error) {
      this.newFolderModal?.setError(result.error);
      this.onStatus(result.error);
      return;
    }
    this.newFolderModal?.close();
    this.onStatus(`Folder created: ${name}`);
    setTimeout(() => this.onStatus(""), 1500);
    await this.refreshFileList({
      directory: this.activeDirectory,
      pattern: this.activePattern
    });
    await this.onRefresh();
  }

  async refreshFileList({ directory, pattern }) {
    this.activeDirectory = directory ?? null;
    this.activePattern = pattern ?? null;
    if (!directory) {
      this.setFiles({ files: [], activeDirectory: null, tooMany: false });
      return { files: [], tooMany: false };
    }
    var fileResult = this.fileService.listTextFiles({
      directory,
      pattern
    })
    fileResult.then((result) => {
      this.setFiles({
        files: result?.files ?? [],
        activeDirectory: directory,
        tooMany: result?.tooMany
      });
    })
    this.render();
    return fileResult;
  }
}
