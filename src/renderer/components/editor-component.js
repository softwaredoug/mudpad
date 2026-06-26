import { Issue } from "./issue.js";

export class EditorComponent {
  constructor({ editor, fileService, correctionsService, onStatus, onIssuesChanged, onFileChanged }) {
    this.editor = editor;
    this.fileService = fileService;
    this.correctionsService = correctionsService;
    this.onStatus = onStatus ?? (() => {});
    this.onIssuesChanged = onIssuesChanged ?? (() => {});
    this.onFileChanged = onFileChanged ?? (() => {});
    this.filePath = null;
    this.activeDirectory = null;
    this.originalText = "";
    this.issues = [];
    this.debounceHandle = null;
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

  setActiveDirectory(directory) {
    this.activeDirectory = directory ?? null;
    return this.correctionsService.setCorrectionsDirectory(directory);
  }

  async openFile(path) {
    if (this.filePath && path !== this.filePath) {
      const saved = await this.saveIfDirty();
      if (!saved) {
        return false;
      }
    }

    const result = await this.fileService.readFile(path);
    if (!result) {
      return false;
    }
    this.filePath = result.path;
    this.editor.setText(result.content ?? "");
    this.originalText = result.content ?? "";
    this.onFileChanged(this.filePath);
    this.scheduleChecks();
    return true;
  }

  closeFile() {
    this.filePath = null;
    this.originalText = "";
    this.editor.setText("");
    this.updateIssues([]);
    this.onFileChanged(null);
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
