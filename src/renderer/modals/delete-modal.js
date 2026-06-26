import { BaseModal } from "./base-modal.js";

export class DeleteModal extends BaseModal {
  constructor({ mountEl, window, onConfirm }) {
    super({
      mountEl,
      window,
      templateUrl: new URL("./delete-modal.html?raw", import.meta.url)
    });
    this.onConfirm = onConfirm;
    this.fileNameLabel = null;
    this.gitFields = null;
    this.summaryInput = null;
    this.detailsInput = null;
    this.errorLabel = null;
    this.cancelButton = null;
    this.confirmButton = null;
    this.targetPath = null;
    this.requiresCommit = false;
    this.summaryAuto = false;
  }

  bindEvents() {
    super.bindEvents();
    this.fileNameLabel = this.query("#delete-file-name");
    this.gitFields = this.query("#delete-git-fields");
    this.summaryInput = this.query("#delete-summary");
    this.detailsInput = this.query("#delete-details");
    this.errorLabel = this.query("#delete-error");
    this.cancelButton = this.query("#delete-cancel");
    this.confirmButton = this.query("#delete-confirm");

    this.cancelButton.addEventListener("click", () => this.close());
    this.confirmButton.addEventListener("click", () => this.handleConfirm());
    this.summaryInput.addEventListener("input", () => {
      if (!this.requiresCommit) {
        return;
      }
      this.summaryAuto = false;
    });
  }

  async open({ path, requiresCommit, summary }) {
    await super.open();
    this.targetPath = path;
    this.requiresCommit = Boolean(requiresCommit);
    this.summaryAuto = this.requiresCommit;
    this.gitFields.classList.toggle("hidden", !this.requiresCommit);
    this.fileNameLabel.textContent = path
      ? `Delete ${path.split("/").pop()}`
      : "Delete file";
    this.summaryInput.value = this.requiresCommit ? summary ?? "" : "";
    this.detailsInput.value = "";
    this.setError("");
    if (this.requiresCommit) {
      this.summaryInput.focus();
    } else {
      this.confirmButton.focus();
    }
  }

  close() {
    super.close();
    this.targetPath = null;
    this.requiresCommit = false;
    this.summaryAuto = false;
    this.setError("");
  }

  setError(message) {
    this.errorLabel.textContent = message ?? "";
  }

  async handleConfirm() {
    if (!this.targetPath) {
      this.setError("No file selected.");
      return;
    }
    if (!window.confirm("Delete this file?")) {
      return;
    }
    const summary = this.summaryInput.value.trim();
    const details = this.detailsInput.value.trim();
    if (this.requiresCommit && !summary) {
      this.setError("Commit summary is required.");
      return;
    }
    this.setError("");
    await this.onConfirm({
      filePath: this.targetPath,
      messageShort: summary,
      messageLong: details
    });
  }
}
