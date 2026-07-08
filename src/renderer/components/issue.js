import { BaseComponent } from "../modals/base-component.js";
import { CorrectionsService } from "../services/corrections-service.js";

export class Issue {
  constructor({
    mountEl,
    issue,
    correctionsService = new CorrectionsService(),
    getText,
    setText,
    getFilePath,
    getDirectory,
    onStatus,
    onIssuesUpdate,
    onSelect
  }) {
    this.base = new BaseComponent({
      mountEl,
      templateUrl: new URL("./issue.html?raw", import.meta.url)
    });
    this.correctionsService = correctionsService;
    this.getText = getText ?? (() => "");
    this.setText = setText ?? (() => {});
    this.getFilePath = getFilePath ?? (() => null);
    this.getDirectory = getDirectory ?? (() => null);
    this.onStatus = onStatus ?? (() => {});
    this.onIssuesUpdate = onIssuesUpdate ?? (() => {});
    this.onSelect = onSelect ?? (() => {});
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
    getText,
    setText,
    getFilePath,
    getDirectory,
    onStatus,
    onIssuesUpdate,
    onSelect
  }) {
    const component = new Issue({
      mountEl,
      issue,
      correctionsService,
      getText,
      setText,
      getFilePath,
      getDirectory,
      onStatus,
      onIssuesUpdate,
      onSelect
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
    const text = this.getText();
    const result = await this.correctionsService.applyIssue({
      filePath,
      text,
      issue
    });
    this.handleResult(result, { updateText: true });
  }

  async handleDismiss() {
    const filePath = this.getFilePath();
    if (!filePath) {
      return;
    }
    const issue = this.getIssuePayload();
    const text = this.getText();
    const result = await this.correctionsService.addDismissedChange({
      directory: this.getDirectory(),
      filePath,
      text,
      issue
    });
    this.handleResult(result, { updateText: false });
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
    const text = this.getText();
    const result = await this.correctionsService.addSpellingException({
      directory: this.getDirectory(),
      filePath,
      word,
      text
    });
    this.handleResult(result, { updateText: false });
  }

  handleResult(result, { updateText }) {
    if (result?.error) {
      this.onStatus(result.error);
      return;
    }
    if (updateText && typeof result?.text === "string") {
      this.setText(result.text);
    }
    const issues = this.normalizeIssues(result);
    if (issues) {
      this.onIssuesUpdate(issues);
    }
  }
}
