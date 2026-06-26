import { BaseComponent } from "./base-component.js";

export class BaseModal {
  constructor({ mountEl, templateUrl, window }) {
    this.component = new BaseComponent({ mountEl, templateUrl });
    this.window = window;
    this._bound = false;
  }

  async ensureReady() {
    await this.component.ensureReady();
    if (!this._bound) {
      this.bindEvents();
      this._bound = true;
    }
  }

  bindEvents() {
    const backdrop = this.component.query(".modal-backdrop");
    if (backdrop) {
      backdrop.addEventListener("click", () => this.close());
    }
    if (this.window) {
      this.window.addEventListener("keydown", (event) => {
        if (!this.isOpen()) {
          return;
        }
        if (event.key === "Escape") {
          this.close();
        }
      });
    }
  }

  query(selector) {
    return this.component.query(selector);
  }

  isOpen() {
    return Boolean(this.component.root && !this.component.root.classList.contains("hidden"));
  }

  isReady() {
    return Boolean(this.component.root);
  }

  async open() {
    try {
      await this.ensureReady();
    } catch (error) {
      console.error("Modal open failed", error);
      return;
    }
    this.component.root.classList.remove("hidden");
    this.component.root.setAttribute("aria-hidden", "false");
  }

  close() {
    if (!this.component.root) {
      return;
    }
    this.component.root.classList.add("hidden");
    this.component.root.setAttribute("aria-hidden", "true");
  }
}
