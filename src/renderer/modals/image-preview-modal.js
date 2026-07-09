import { BaseModal } from "./base-modal.js";

export class ImagePreviewModal {
  constructor({ mountEl, window }) {
    this.base = new BaseModal({
      mountEl,
      window,
      templateUrl: new URL("./image-preview-modal.html?raw", import.meta.url)
    });
    this.imageEl = null;
    this.labelEl = null;
    this.currentSrc = "";
    this._bound = false;
  }

  async ensureReady() {
    if (this._bound) {
      return;
    }
    await this.base.ensureReady();
    this.imageEl = this.base.query("#image-preview-image");
    this.labelEl = this.base.query("#image-preview-label");
    this._bound = true;
  }

  async open({ src, label } = {}) {
    if (!src) {
      return;
    }
    await this.ensureReady();
    if (this.currentSrc !== src) {
      this.imageEl.src = src;
      this.currentSrc = src;
    }
    if (this.labelEl) {
      this.labelEl.textContent = label ?? "";
    }
    await this.base.open();
  }

  close() {
    this.base.close();
    if (this.imageEl) {
      this.imageEl.removeAttribute("src");
    }
    if (this.labelEl) {
      this.labelEl.textContent = "";
    }
    this.currentSrc = "";
  }

  isOpen() {
    return this.base.isOpen();
  }
}
