import { BaseComponent } from "../modals/base-component.js";
import { createIssueComponents } from "../issues-controller.js";

export class IssuesSidebar {
  constructor({ mountEl, onIssueSelect, onStatus, issueContext }) {
    this.base = new BaseComponent({
      mountEl,
      templateUrl: new URL("./issues-sidebar.html?raw", import.meta.url)
    });
    this.document = mountEl?.ownerDocument ?? document;
    this.onIssueSelect = onIssueSelect ?? (() => {});
    this.onStatus = onStatus ?? (() => {});
    this.issueContext = issueContext ?? {};
    this.listEl = null;
    this.issueComponents = [];
    this._bound = false;
  }

  async ensureReady() {
    await this.base.ensureReady();
    if (this._bound) {
      return;
    }
    this.listEl = this.base.query(".issues-list");
    this._bound = true;
  }

  static async create({ mountEl, onIssueSelect, onStatus, issueContext }) {
    const sidebar = new IssuesSidebar({
      mountEl,
      onIssueSelect,
      onStatus,
      issueContext
    });
    await sidebar.ensureReady();
    return sidebar;
  }

  setIssueContext(issueContext) {
    this.issueContext = issueContext ?? {};
  }

  async render(issues) {
    if (!this.listEl) {
      await this.ensureReady();
    }

    this.listEl.innerHTML = "";
    this.issueComponents = [];

    if (!issues?.length) {
      const empty = this.document.createElement("div");
      empty.textContent = "No issues";
      this.listEl.appendChild(empty);
      return;
    }

    const issueContext = {
      ...this.issueContext,
      onStatus: this.issueContext?.onStatus ?? this.onStatus
    };

    this.issueComponents = await createIssueComponents(
      this.listEl,
      issueContext,
      issues
    );

    for (const issueComponent of this.issueComponents) {
      issueComponent.onSelect = (selectedIssue) => this.onIssueSelect(selectedIssue);
      issueComponent.getFilePath = () => issueComponent.filePath;
    }
  }

  clear() {
    void this.render([]);
  }
}
