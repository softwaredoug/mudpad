import { BaseModal } from "./base-modal.js";

export class CommitModal extends BaseModal {
  constructor({
    mountEl,
    window,
    fileService,
    getFilePath,
    getEditorText,
    setStatus,
    refreshRepoStatus
  }) {
    super({
      mountEl,
      window,
      templateUrl: new URL("./commit-modal.html?raw", import.meta.url)
    });
    this.fileService = fileService;
    this.getFilePath = getFilePath;
    this.getEditorText = getEditorText;
    this.setStatus = setStatus;
    this.refreshRepoStatus = refreshRepoStatus;
    this.summaryInput = null;
    this.detailsInput = null;
    this.errorLabel = null;
    this.cancelButton = null;
    this.confirmButton = null;
  }

  bindEvents() {
    super.bindEvents();
    this.summaryInput = this.query("#commit-summary");
    this.detailsInput = this.query("#commit-details");
    this.errorLabel = this.query("#commit-error");
    this.cancelButton = this.query("#commit-cancel");
    this.confirmButton = this.query("#commit-confirm");

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
  }

  async open() {
    await super.open();
    this.setError("");
    this.summaryInput.focus();
  }

  close() {
    super.close();
    this.setError("");
  }

  setError(message) {
    this.errorLabel.textContent = message ?? "";
  }

  async handleConfirm() {
    const summary = this.summaryInput.value.trim();
    const details = this.detailsInput.value.trim();
    if (!summary) {
      this.setError("Summary is required.");
      return;
    }
    const filePath = this.getFilePath();
    if (!filePath) {
      this.setError("Select a file to commit.");
      return;
    }
    this.setError("");
    this.setStatus("Committing...");
    const result = await this.fileService.saveAndCommit({
      path: filePath,
      content: this.getEditorText(),
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
