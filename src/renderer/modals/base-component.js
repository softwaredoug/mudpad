const templateCache = new Map();

export class BaseComponent {
  constructor({ mountEl, templateUrl }) {
    this.mountEl = mountEl;
    this.templateUrl = templateUrl;
    this.root = null;
    this._readyPromise = null;
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
      throw new Error("Component template is empty.");
    }
    this.root = element;
    this.mountEl.appendChild(element);
  }

  async fetchTemplate() {
    const key = this.templateUrl?.href ?? String(this.templateUrl);
    if (templateCache.has(key)) {
      return templateCache.get(key);
    }
    const response = await fetch(key);
    if (!response.ok) {
      const message = `Failed to load component template ${key}: ${response.status}`;
      console.error(message);
      throw new Error(message);
    }
    const html = await response.text();
    templateCache.set(key, html);
    return html;
  }

  query(selector) {
    return this.root?.querySelector(selector) ?? null;
  }
}
