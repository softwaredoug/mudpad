import { BaseModal } from "./base-modal.js";

export class RenameModal extends BaseModal {
  constructor({ mountEl, window, fileService, buildSummary, onConfirm, onDelete }) {
    super({
      mountEl,
      window,
      templateUrl: new URL("./rename-modal.html?raw", import.meta.url)
    });
    this.fileService = fileService;
    this.buildSummary = buildSummary;
    this.onConfirm = onConfirm;
    this.onDelete = onDelete;
    this.nameInput = null;
    this.gitFields = null;
    this.summaryInput = null;
    this.detailsInput = null;
    this.errorLabel = null;
    this.cancelButton = null;
    this.confirmButton = null;
    this.deleteButton = null;
    this.targetPath = null;
    this.requiresCommit = false;
    this.summaryAuto = false;
  }

  bindEvents() {
    super.bindEvents();
    this.nameInput = this.query("#rename-input");
    this.gitFields = this.query("#rename-git-fields");
    this.summaryInput = this.query("#rename-summary");
    this.detailsInput = this.query("#rename-details");
    this.errorLabel = this.query("#rename-error");
    this.cancelButton = this.query("#rename-cancel");
    this.confirmButton = this.query("#rename-confirm");
    this.deleteButton = this.query("#rename-delete");

    this.cancelButton.addEventListener("click", () => this.close());
    this.confirmButton.addEventListener("click", () => this.handleConfirm());
    this.deleteButton.addEventListener("click", () => this.handleDelete());
    this.nameInput.addEventListener("input", () => {
      if (!this.requiresCommit) {
        return;
      }
      if (!this.summaryAuto) {
        return;
      }
      this.summaryInput.value = this.buildSummary(this.targetPath, this.nameInput.value.trim());
    });
    this.summaryInput.addEventListener("input", () => {
      if (!this.requiresCommit) {
        return;
      }
      this.summaryAuto = false;
    });
  }

  async open({ path, requiresCommit }) {
    await super.open();
    this.targetPath = path;
    this.requiresCommit = Boolean(requiresCommit);
    this.gitFields.classList.toggle("hidden", !this.requiresCommit);
    this.nameInput.value = path?.split("/").pop() ?? "";
    this.summaryInput.value = this.requiresCommit
      ? this.buildSummary(path, this.nameInput.value)
      : "";
    this.summaryAuto = this.requiresCommit;
    this.detailsInput.value = "";
    this.setError("");
    this.nameInput.focus();
    this.nameInput.select();
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
    const newName = this.nameInput.value.trim();
    if (!newName) {
      this.setError("New filename is required.");
      return;
    }
    const summary = this.summaryInput.value.trim();
    const details = this.detailsInput.value.trim();
    if (this.requiresCommit && !summary) {
      this.setError("Commit summary is required.");
      return;
    }
    this.setError("");
    const result = await this.fileService.renameFile({
      oldPath: this.targetPath,
      newName,
      messageShort: summary,
      messageLong: details
    });
    if (result?.error) {
      this.setError(result.error);
      return;
    }
    this.close();
    if (this.onConfirm) {
      await this.onConfirm({ result });
    }
  }

  handleDelete() {
    if (!this.targetPath) {
      this.setError("No file selected.");
      return;
    }
    this.onDelete(this.targetPath);
  }
}
