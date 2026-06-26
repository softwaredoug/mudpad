import { BaseModal } from "./base-modal.js";

export class CommitModal {
  constructor({
    mountEl,
    window,
    fileService,
    editorComponent,
    setStatus,
    refreshRepoStatus
  }) {
    this.base = new BaseModal({
      mountEl,
      window,
      templateUrl: new URL("./commit-modal.html?raw", import.meta.url)
    });
    this.window = window;
    this.fileService = fileService;
    this.editorComponent = editorComponent;
    this.setStatus = setStatus;
    this.refreshRepoStatus = refreshRepoStatus;
    this.summaryInput = null;
    this.detailsInput = null;
    this.errorLabel = null;
    this.cancelButton = null;
    this.confirmButton = null;
    this._bound = false;
  }

  async open() {
    await this.ensureReady();
    await this.base.open();
    this.setError("");
    this.summaryInput.focus();
  }

  close() {
    this.base.close();
    this.setError("");
  }

  setError(message) {
    this.errorLabel.textContent = message ?? "";
  }

  isOpen() {
    return this.base.isOpen();
  }

  async ensureReady() {
    if (this._bound) {
      return;
    }
    await this.base.ensureReady();
    this.summaryInput = this.base.query("#commit-summary");
    this.detailsInput = this.base.query("#commit-details");
    this.errorLabel = this.base.query("#commit-error");
    this.cancelButton = this.base.query("#commit-cancel");
    this.confirmButton = this.base.query("#commit-confirm");

    this.cancelButton.addEventListener("click", () => this.close());
    this.confirmButton.addEventListener("click", () => this.handleConfirm());
    this.window.addEventListener("keydown", (event) => {
      if (!this.isOpen()) {
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        this.confirm();
      }
    });

    this._bound = true;
  }

  async handleConfirm() {
    const summary = this.summaryInput.value.trim();
    const details = this.detailsInput.value.trim();
    if (!summary) {
      this.setError("Summary is required.");
      return;
    }
    const filePath = this.editorComponent.getFilePath();
    if (!filePath) {
      this.setError("Select a file to commit.");
      return;
    }
    this.setError("");
    this.setStatus("Committing...");
    const result = await this.fileService.saveAndCommit({
      path: filePath,
      content: this.editorComponent.getText(),
      messageShort: summary,
      messageLong: details
    });
    if (result?.error) {
      this.setStatus(result.error);
      this.setError(result.error);
      return;
    }
    this.close();
    this.setStatus("Committed");
    setTimeout(() => this.setStatus(""), 1500);
    await this.refreshRepoStatus();
  }

  confirm() {
    return this.handleConfirm();
  }
}
