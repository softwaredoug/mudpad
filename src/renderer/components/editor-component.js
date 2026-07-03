import { Issue } from "./issue.js";

function dirname(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  const withoutTrailingSlash = normalized.replace(/\/+$/, "");
  const index = withoutTrailingSlash.lastIndexOf("/");

  if (index === -1) return ".";
  if (index === 0) return "/";

  return withoutTrailingSlash.slice(0, index);
}

export class EditorComponent {
  constructor({
    editor,
    fileService,
    correctionsService,
    onStatus,
    onIssuesChanged,
    onFileChanged,
    onDisabledDblClick
  }) {
    this.editor = editor;
    this.fileService = fileService;
    this.correctionsService = correctionsService;
    this.onStatus = onStatus ?? (() => {});
    this.onIssuesChanged = onIssuesChanged ?? (() => {});
    this.onFileChanged = onFileChanged ?? (() => {});
    this.onDisabledDblClick = onDisabledDblClick ?? (() => {});
    this.filePath = null;
    this.activeDirectory = null;
    this.originalText = "";
    this.issues = [];
    this.debounceHandle = null;
    this.setEditorDisabled(true);
  }

  async ensureReady() {
    return;
  }

  static async create({
    editor,
    fileService,
    correctionsService,
    onStatus,
    onIssuesChanged,
    onFileChanged,
    onDisabledDblClick
  }) {
    const component = new EditorComponent({
      editor,
      fileService,
      correctionsService,
      onStatus,
      onIssuesChanged,
      onFileChanged,
      onDisabledDblClick
    });
    await component.ensureReady();
    return component;
  }

  getFilePath() {
    return this.filePath;
  }

  getText() {
    return this.editor.getText();
  }

  isDirty() {
    return this.getText() !== this.originalText;
  }

  getIssues() {
    return this.issues;
  }

  async openFile(path) {
    if (this.filePath && path !== this.filePath) {
      const saved = await this.saveIfDirty();
      if (!saved) {
        return false;
      }
    }
    // get base dir, set file path

    const result = await this.fileService.readFile(path);
    if (!result) {
      return false;
    }
    const basePath = dirname(path);
    this.correctionsService.setCorrectionsDirectory(basePath);
    this.filePath = result.path;
    this.editor.setText(result.content ?? "");
    this.originalText = result.content ?? "";
    this.setEditorDisabled(false);
    this.onFileChanged(this.filePath);
    this.scheduleChecks();
    return true;
  }

  closeFile() {
    this.filePath = null;
    this.originalText = "";
    this.editor.setText("");
    this.setEditorDisabled(true);
    this.updateIssues([]);
    this.onFileChanged(null);
  }

  setEditorDisabled(isDisabled) {
    if (!this.editor?.setEditable || !this.editor?.setPlaceholder) {
      return;
    }
    if (isDisabled) {
      this.editor.setEditable(false);
      this.editor.setPlaceholder("Select or create a file to begin.");
    } else {
      this.editor.setEditable(true);
      this.editor.setPlaceholder("");
    }
  }

  handleDisabledDblClick() {
    if (this.filePath) {
      return;
    }
    this.onDisabledDblClick();
  }

  async saveIfDirty() {
    if (!this.filePath) {
      return true;
    }
    const currentText = this.getText();
    if (currentText === this.originalText) {
      return true;
    }
    const result = await this.fileService.saveFile({ filePath: this.filePath, content: currentText });
    if (result?.error) {
      this.onStatus(result.error);
      return false;
    }
    this.originalText = currentText;
    return true;
  }

  handleEditorChange() {
    this.scheduleChecks();
  }

  scheduleChecks() {
    if (this.debounceHandle) {
      clearTimeout(this.debounceHandle);
    }
    if (!this.isMarkdownFile(this.filePath)) {
      this.updateIssues([]);
      return;
    }

    this.debounceHandle = setTimeout(async () => {
      const saved = await this.saveIfDirty();
      if (!saved) {
        return;
      }
      const text = this.getText();
      const result = await this.correctionsService.checkCorrections({
        text,
        filePath: this.filePath
      });
      const issues = [
        ...(result?.issues?.spell ?? []),
        ...(result?.issues?.grammar ?? []),
        ...(result?.issues?.llm ?? [])
      ];
      if (result?.errors?.grammar) {
        this.onStatus(result.errors.grammar);
      } else {
        this.onStatus("");
      }
      this.updateIssues(issues);
    }, 500);
  }

  async analyze() {
    if (!this.isMarkdownFile(this.filePath)) {
      this.onStatus("Corrections are available only for markdown files.");
      return;
    }
    if (this.debounceHandle) {
      clearTimeout(this.debounceHandle);
      this.debounceHandle = null;
    }
    this.onStatus("Analyzing...");
    const text = this.getText();
    const result = await this.correctionsService.analyzeCorrections({
      text,
      filePath: this.filePath
    });
    const issues = [
      ...(result?.issues?.spell ?? []),
      ...(result?.issues?.grammar ?? [])
    ];
    if (result?.errors?.grammar) {
      this.onStatus(result.errors.grammar);
    } else {
      this.onStatus("Analysis complete");
      setTimeout(() => this.onStatus(""), 1500);
    }
    this.updateIssues(issues);
  }

  async applyIssue(issue) {
    if (!this.filePath) {
      return;
    }
    const text = this.getText();
    const result = await this.correctionsService.applyIssue({
      filePath: this.filePath,
      text,
      issue: this.getIssueData(issue)
    });
    if (result?.error) {
      this.onStatus(result.error);
      return;
    }
    if (typeof result?.text === "string") {
      this.editor.setText(result.text);
    }
    if (result?.issues) {
      this.updateIssues(result.issues ? [
        ...(result.issues.spell ?? []),
        ...(result.issues.grammar ?? []),
        ...(result.issues.llm ?? [])
      ] : []);
    }
  }

  async dismissIssue(issue) {
    if (!this.filePath) {
      return;
    }
    const text = this.getText();
    const result = await this.correctionsService.addDismissedChange({
      directory: this.activeDirectory,
      filePath: this.filePath,
      text,
      issue: this.getIssueData(issue)
    });
    if (result?.error) {
      this.onStatus(result.error);
      return;
    }
    if (result?.issues) {
      this.updateIssues([
        ...(result.issues.spell ?? []),
        ...(result.issues.grammar ?? []),
        ...(result.issues.llm ?? [])
      ]);
    }
  }

  async ignoreIssue(issue) {
    if (!this.filePath) {
      return;
    }
    const word = issue?.word?.trim();
    if (!word) {
      return;
    }
    const text = this.getText();
    const result = await this.correctionsService.addSpellingException({
      directory: this.activeDirectory,
      filePath: this.filePath,
      word,
      text
    });
    if (result?.error) {
      this.onStatus(result.error);
      return;
    }
    if (result?.issues) {
      this.updateIssues([
        ...(result.issues.spell ?? []),
        ...(result.issues.grammar ?? []),
        ...(result.issues.llm ?? [])
      ]);
    }
  }

  updateIssues(issueData) {
    this.editor.setIssues(issueData);
    this.issues = issueData.map((data) => new Issue({ editor: this, data }));
    this.onIssuesChanged(this.issues);
  }

  getIssueData(issue) {
    return issue?.data ?? issue;
  }

  isMarkdownFile(path) {
    if (!path) {
      return false;
    }
    const lower = path.toLowerCase();
    return lower.endsWith(".md") || lower.endsWith(".markdown") || lower.endsWith(".mdx");
  }
}
