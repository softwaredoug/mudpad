import { BaseComponent } from "../modals/base-component.js";
import { CorrectionsService } from "../services/corrections-service.js";

export class Issue {
  constructor({
    mountEl,
    issue,
    correctionsService = new CorrectionsService(),
    filePath,
    directory,
    onIgnore,
    onApply,
    onDismiss
  }) {
    this.base = new BaseComponent({
      mountEl,
      templateUrl: new URL("./issue.html?raw", import.meta.url)
    });
    this.correctionsService = correctionsService;
    this.filePath = filePath;
    this.directory = directory;

    this.onIgnore = onIgnore ?? (() => {});
    this.onApply = onApply ?? (() => {});
    this.onDismiss = onDismiss ?? (() => {});

    this.issue = issue?.data ?? issue ?? {};
    this._bound = false;
  }

  async ensureReady() {
    await this.base.ensureReady();
    if (this._bound) {
      return;
    }
    this.typeEl = this.base.query(".issue-type");
    this.messageEl = this.base.query(".issue-message");
    this.sourceEl = this.base.query(".issue-source");
    this.suggestionEl = this.base.query(".issue-suggestion");
    this.actionsEl = this.base.query(".issue-actions");
    this.ignoreButton = this.base.query(".issue-action-ignore");
    this.applyButton = this.base.query(".issue-action-apply");
    this.dismissButton = this.base.query(".issue-action-dismiss");

    this.base.root?.addEventListener("click", () => this.onSelect(this.issue));
    this.ignoreButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.handleIgnore();
    });
    this.applyButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.handleApply();
    });
    this.dismissButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.handleDismiss();
    });

    this._bound = true;
    this.render();
  }

  static async create({
    mountEl,
    issue,
    correctionsService,
    filePath,
    directory,
    onIgnore,
    onApply,
    onDismiss
  }) {
    const component = new Issue({
      mountEl,
      issue,
      correctionsService,
      filePath,
      directory,
      onIgnore,
      onApply,
      onDismiss
    });
    await component.ensureReady();
    return component;
  }

  setIssue(issue) {
    this.issue = issue?.data ?? issue ?? {};
    this.render();
  }

  render() {
    if (!this._bound) {
      return;
    }
    const issue = this.issue ?? {};
    if (this.typeEl) {
      this.typeEl.textContent = issue.type ?? "";
    }
    if (this.messageEl) {
      this.messageEl.textContent = issue.message ?? "";
    }
    if (this.sourceEl) {
      this.sourceEl.textContent = `Source: ${issue.source ?? "unknown"}`;
    }
    if (this.suggestionEl) {
      const suggestion = issue.suggestions?.[0];
      if (suggestion) {
        this.suggestionEl.textContent = `Suggestion: ${suggestion}`;
        this.suggestionEl.hidden = false;
      } else {
        this.suggestionEl.textContent = "";
        this.suggestionEl.hidden = true;
      }
    }

    if (this.applyButton) {
      this.applyButton.disabled = !(issue.suggestions && issue.suggestions.length);
    }
    if (this.ignoreButton) {
      const canIgnore = issue.type === "spell" && issue.word;
      this.ignoreButton.disabled = !canIgnore;
      if (!canIgnore) {
        this.ignoreButton.title = "Available for spelling only";
      } else {
        this.ignoreButton.removeAttribute("title");
      }
    }
  }

  getIssuePayload() {
    return this.issue ?? {};
  }

  normalizeIssues(result) {
    if (!result?.issues) {
      return null;
    }
    return [
      ...(result.issues.spell ?? []),
      ...(result.issues.grammar ?? []),
      ...(result.issues.llm ?? [])
    ];
  }

  async handleApply() {
    const filePath = this.getFilePath();
    if (!filePath) {
      return;
    }
    const issue = this.getIssuePayload();
    this.onApply(issue);
  }

  async handleDismiss() {
    const filePath = this.getFilePath();
    if (!filePath) {
      return;
    }
    const issue = this.getIssuePayload();
    this.onDismiss(issue);
  }

  async handleIgnore() {
    const filePath = this.getFilePath();
    if (!filePath) {
      return;
    }
    const issue = this.getIssuePayload();
    const word = issue?.word?.trim();
    if (!word) {
      return;
    }
    this.onIgnore(issue, word);
  }
}
