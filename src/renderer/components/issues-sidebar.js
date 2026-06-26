export class IssuesSidebar {
  constructor({ mountEl, onIssueSelect, onStatus }) {
    this.mountEl = mountEl;
    this.document = mountEl?.ownerDocument ?? document;
    this.onIssueSelect = onIssueSelect ?? (() => {});
    this.onStatus = onStatus ?? (() => {});
  }

  render(issues) {
    this.mountEl.innerHTML = "";

    if (!issues?.length) {
      const empty = this.document.createElement("div");
      empty.textContent = "No issues";
      this.mountEl.appendChild(empty);
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
      this.mountEl.appendChild(item);
    });
  }

  clear() {
    this.render([]);
  }
}
