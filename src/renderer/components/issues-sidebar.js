import { BaseComponent } from "../modals/base-component.js";

export class IssuesSidebar {
  constructor({ mountEl, onIssueSelect, onStatus }) {
    this.base = new BaseComponent({
      mountEl,
      templateUrl: new URL("./issues-sidebar.html?raw", import.meta.url)
    });
    this.document = mountEl?.ownerDocument ?? document;
    this.onIssueSelect = onIssueSelect ?? (() => {});
    this.onStatus = onStatus ?? (() => {});
    this.listEl = null;
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

  render(issues) {
    if (!this.listEl) {
      void this.ensureReady().then(() => this.render(issues));
      return;
    }

    this.listEl.innerHTML = "";

    if (!issues?.length) {
      const empty = this.document.createElement("div");
      empty.textContent = "No issues";
      this.listEl.appendChild(empty);
      return;
    }

    issues.forEach((issue) => {
      const item = this.document.createElement("div");
      item.className = "issue-item";
      item.addEventListener("click", () => this.onIssueSelect(issue));

      const type = this.document.createElement("div");
      type.className = "issue-type";
      type.textContent = issue.type;

      const message = this.document.createElement("div");
      message.textContent = issue.message;

      const source = this.document.createElement("div");
      source.className = "issue-source";
      source.textContent = `Source: ${issue.source ?? "unknown"}`;

      const actions = this.document.createElement("div");
      actions.className = "issue-actions";

      const acceptButton = this.document.createElement("button");
      acceptButton.textContent = "Apply";
      acceptButton.disabled = !issue.suggestions || issue.suggestions.length === 0;
      acceptButton.addEventListener("click", (event) => {
        event.stopPropagation();
        issue.apply();
      });

      const rejectButton = this.document.createElement("button");
      rejectButton.textContent = "Dismiss";
      rejectButton.addEventListener("click", (event) => {
        event.stopPropagation();
        issue.dismiss();
      });

      const ignoreButton = this.document.createElement("button");
      ignoreButton.textContent = "Always Ignore";
      const canIgnore = issue.type === "spell" && issue.word;
      ignoreButton.disabled = !canIgnore;
      if (!canIgnore) {
        ignoreButton.title = "Available for spelling only";
      } else {
        ignoreButton.addEventListener("click", (event) => {
          event.stopPropagation();
          issue.ignore();
        });
      }

      actions.appendChild(ignoreButton);
      actions.appendChild(acceptButton);
      actions.appendChild(rejectButton);

      item.appendChild(type);
      item.appendChild(message);
      item.appendChild(source);
      if (issue.suggestions?.[0]) {
        const suggestion = this.document.createElement("div");
        suggestion.textContent = `Suggestion: ${issue.suggestions[0]}`;
        item.appendChild(suggestion);
      }
      item.appendChild(actions);
      this.listEl.appendChild(item);
    });
  }

  clear() {
    this.render([]);
  }
}
