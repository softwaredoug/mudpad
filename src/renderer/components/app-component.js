import { BaseComponent } from "../modals/base-component.js";
import { createEditor } from "../editor.js";
import { FileService } from "../services/file-service.js";
import { CorrectionsService } from "../services/corrections-service.js";
import { EditorComponent } from "./editor-component.js";
import { IssuesSidebar } from "./issues-sidebar.js";
import { DirectorySelector } from "./directory-selector.js";
import { FileList } from "./file-list.js";
import { CommitModal } from "../modals/commit-modal.js";
import { RepoModal } from "../modals/repo-modal.js";

export class AppComponent {
  constructor({
    mountEl,
    window,
    fileService = new FileService(),
    correctionsService = new CorrectionsService(),
    createEditorFn = createEditor
  }) {
    this.base = new BaseComponent({
      mountEl,
      templateUrl: new URL("./app-component.html?raw", import.meta.url)
    });
    this.window = window;
    this.rendererStart = performance.now();
    this.fileService = fileService;
    this.correctionsService = correctionsService;
    this.createEditor = createEditorFn;
    this.editorComponent = null;
    this.issuesSidebar = null;
    this.directorySelector = null;
    this.fileList = null;
    this.commitModal = null;
    this.repoModal = null;
    this.repoStatus = null;
    this.activeFilePath = null;
    this._bound = false;
  }

  logStartup(message) {
    const elapsed = Math.round(performance.now() - this.rendererStart);
    console.log(`[renderer +${elapsed}ms] ${message}`);
  }

  async init() {
    await this.base.ensureReady();
    if (this._bound) {
      return;
    }
    const modalMount = this.base.root?.ownerDocument?.body ?? document.body;
    const directorySelectorMount = this.base.query("#directory-selector");
    const activeFileLabel = this.base.query("#active-file");
    const statusLabel = this.base.query("#status");
    const issuesPanel = this.base.query("#issues-panel");
    const filesPanel = this.base.query("#files-panel");
    const repoStatusButton = this.base.query("#repo-status");
    const repoStatusDot = this.base.query("#repo-status-dot");
    const repoStatusLabel = this.base.query("#repo-status-label");

    const editor = this.createEditor({
      parent: this.base.query("#editor"),
      initialText: "",
      onChange: () => this.editorComponent?.handleEditorChange(),
      onApplyIssue: (issue) => this.editorComponent?.applyIssue(issue),
      onDismissIssue: (issue) => this.editorComponent?.dismissIssue(issue),
      onIgnoreIssue: (issue) => this.editorComponent?.ignoreIssue(issue),
      onDisabledDblClick: () => this.editorComponent?.handleDisabledDblClick()
    });

    this.issuesSidebar = new IssuesSidebar({
      mountEl: issuesPanel,
      onIssueSelect: (issue) => {
        if (issue.range) {
          editor.scrollTo(issue.range.start, issue.range.end);
        }
      },
      onStatus: (message) => this.setStatus(statusLabel, message)
    });

    this.editorComponent = new EditorComponent({
      editor,
      fileService: this.fileService,
      correctionsService: this.correctionsService,
      onStatus: (message) => this.setStatus(statusLabel, message),
      onIssuesChanged: (issues) => this.issuesSidebar.render(issues),
      onFileChanged: (path) => this.setActiveFilePath(activeFileLabel, path),
      onDisabledDblClick: () => this.fileList?.createNewFile()
    });

    this.fileList = await FileList.create({
      mountEl: filesPanel,
      fileService: this.fileService,
      modalMount,
      window: this.window,
      onFileOpen: (path) => this.openFile(path),
      onRefresh: () => {},
      onRepoRefresh: () => this.refreshRepoStatus(repoStatusButton, repoStatusDot, repoStatusLabel),
      onStatus: (message) => this.setStatus(statusLabel, message),
      editorComponent: this.editorComponent,
      getRepoStatus: () => this.repoStatus
    });

    this.directorySelector = new DirectorySelector({
      fileService: this.fileService,
      mountEl: directorySelectorMount,
      onChange: async ({ directory, pattern }) => {
        await this.fileList.refreshFileList({ directory, pattern });
        if (!directory) {
          this.setRepoStatus(repoStatusButton, repoStatusDot, repoStatusLabel, null);
          return;
        }
        await this.refreshRepoStatus(repoStatusButton, repoStatusDot, repoStatusLabel);
        this.logStartup("File list refreshed");
      },
      onStatus: (message) => this.setStatus(statusLabel, message)
    });

    this.commitModal = new CommitModal({
      mountEl: modalMount,
      window: this.window,
      fileService: this.fileService,
      editorComponent: this.editorComponent,
      setStatus: (message) => this.setStatus(statusLabel, message),
      refreshRepoStatus: () => this.refreshRepoStatus(repoStatusButton, repoStatusDot, repoStatusLabel)
    });

    this.repoModal = new RepoModal({
      mountEl: modalMount,
      window: this.window,
      fileService: this.fileService,
      getRepoStatus: () => this.repoStatus,
      setRepoStatus: (status) => this.setRepoStatus(repoStatusButton, repoStatusDot, repoStatusLabel, status),
      getActiveDirectory: () => this.directorySelector.getActiveDirectory()
    });

    this.directorySelector.ensureReady();
    await this.directorySelector.initialize();

    repoStatusButton.addEventListener("click", () => {
      if (!this.repoStatus?.available) {
        return;
      }
      this.repoModal.open();
    });

    this.window.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (this.commitModal.isOpen()) {
          return;
        }
        if (!this.editorComponent.getFilePath()) {
          this.setStatus(statusLabel, "Select a file to commit.");
          return;
        }
        this.commitModal.open();
      }
    });

    this._bound = true;
    this.logStartup("Renderer initialized");
  }

  setStatus(labelEl, message) {
    if (!labelEl) {
      return;
    }
    labelEl.textContent = message ?? "";
  }

  setActiveFilePath(labelEl, path) {
    this.activeFilePath = path;
    if (labelEl) {
      labelEl.textContent = path
        ? path.split("/").pop()
        : "No file selected";
    }
    this.fileList?.setActiveFilePath(path);
  }

  setRepoStatus(buttonEl, dotEl, labelEl, nextStatus) {
    this.repoStatus = nextStatus;
    if (this.repoModal?.isReady()) {
      this.repoModal.renderStatus(this.repoStatus);
    }
    if (!this.repoStatus?.available) {
      buttonEl?.classList.add("hidden");
      return;
    }
    buttonEl?.classList.remove("hidden");
    const isSynced = this.repoStatus.upstream
      && this.repoStatus.ahead === 0
      && this.repoStatus.behind === 0;
    dotEl?.classList.toggle("synced", Boolean(isSynced));
    dotEl?.classList.toggle("unsynced", !isSynced);
    if (labelEl) {
      labelEl.textContent = isSynced ? "Synced" : "Out of sync";
    }
  }

  async refreshRepoStatus(buttonEl, dotEl, labelEl) {
    if (!this.directorySelector?.getActiveDirectory()) {
      this.setRepoStatus(buttonEl, dotEl, labelEl, null);
      return;
    }
    const result = await this.fileService.getGitSyncStatus(this.directorySelector.getActiveDirectory());
    this.setRepoStatus(buttonEl, dotEl, labelEl, result);
  }

  async openFile(path) {
    await this.editorComponent.openFile(path);
  }
}
