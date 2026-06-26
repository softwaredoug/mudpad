const templateCache = new Map();

export class BaseModal {
  constructor({ mountEl, templateUrl, window }) {
    this.mountEl = mountEl;
    this.templateUrl = templateUrl;
    this.window = window;
    this.root = null;
    this._readyPromise = null;
    this._bound = false;
  }

  async ensureReady() {
    if (!this._readyPromise) {
      this._readyPromise = this.loadTemplate();
    }
    await this._readyPromise;
  }

  async loadTemplate() {
    const html = await this.fetchTemplate();
    const template = this.mountEl.ownerDocument.createElement("template");
    template.innerHTML = html.trim();
    const element = template.content.querySelector(".modal")
      || template.content.firstElementChild;
    if (!element) {
      throw new Error("Modal template is empty.");
    }
    this.root = element;
    this.mountEl.appendChild(element);
    if (!this._bound) {
      this.bindEvents();
      this._bound = true;
    }
  }

  async fetchTemplate() {
    const key = this.templateUrl?.href ?? String(this.templateUrl);
    if (templateCache.has(key)) {
      return templateCache.get(key);
    }
    const response = await fetch(key);
    if (!response.ok) {
      const message = `Failed to load modal template ${key}: ${response.status}`;
      console.error(message);
      throw new Error(message);
    }
    const html = await response.text();
    templateCache.set(key, html);
    return html;
  }

  bindEvents() {
    const backdrop = this.root.querySelector(".modal-backdrop");
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
    return this.root?.querySelector(selector) ?? null;
  }

  isOpen() {
    return Boolean(this.root && !this.root.classList.contains("hidden"));
  }

  isReady() {
    return Boolean(this.root);
  }

  async open() {
    try {
      await this.ensureReady();
    } catch (error) {
      console.error("Modal open failed", error);
      return;
    }
    this.root.classList.remove("hidden");
    this.root.setAttribute("aria-hidden", "false");
  }

  close() {
    if (!this.root) {
      return;
    }
    this.root.classList.add("hidden");
    this.root.setAttribute("aria-hidden", "true");
  }
}
