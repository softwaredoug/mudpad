import { BaseModal } from "./base-modal.js";

export class NewFolderModal extends BaseModal {
  constructor({ mountEl, window, onConfirm }) {
    super({
      mountEl,
      window,
      templateUrl: new URL("./new-folder-modal.html?raw", import.meta.url)
    });
    this.onConfirm = onConfirm;
    this.nameInput = null;
    this.errorLabel = null;
    this.cancelButton = null;
    this.confirmButton = null;
  }

  bindEvents() {
    super.bindEvents();
    this.nameInput = this.query("#new-folder-name");
    this.errorLabel = this.query("#new-folder-error");
    this.cancelButton = this.query("#new-folder-cancel");
    this.confirmButton = this.query("#new-folder-confirm");

    this.cancelButton.addEventListener("click", () => this.close());
    this.confirmButton.addEventListener("click", () => this.handleConfirm());
  }

  async open() {
    await super.open();
    this.nameInput.value = "";
    this.setError("");
    this.nameInput.focus();
  }

  close() {
    super.close();
    this.nameInput.value = "";
    this.setError("");
  }

  setError(message) {
    this.errorLabel.textContent = message ?? "";
  }

  async handleConfirm() {
    const name = this.nameInput.value.trim();
    if (!name) {
      this.setError("Folder name is required.");
      return;
    }
    this.setError("");
    await this.onConfirm({ name });
  }
}
