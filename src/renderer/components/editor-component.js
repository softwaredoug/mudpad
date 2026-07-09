import { createEditor } from "./editor.js";
import { BaseComponent } from "../modals/base-component.js";


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
    mountEl,
    fileService,
    correctionsService,
    onStatus,
    onIssuesChanged,
    onFileChanged,
    onDisabledDblClick,
    imagePreviewModal
  }) {
    this.base = new BaseComponent({
      mountEl,
      templateUrl: new URL("./editor-component.html?raw", import.meta.url)
    });
    this.fileService = fileService;
    this.correctionsService = correctionsService;
    this.onStatus = onStatus ?? (() => {});
    this.onIssuesChanged = onIssuesChanged ?? (() => {});
    this.onFileChanged = onFileChanged ?? (() => {});
    this.onDisabledDblClick = onDisabledDblClick ?? (() => {});
    this.imagePreviewModal = imagePreviewModal ?? null;
    this.filePath = null;
    this.activeDirectory = null;
    this.repoRoot = null;
    this.originalText = "";
    this.issues = [];
    this.debounceHandle = null;
    this.setEditorDisabled(true);
  }

  async ensureReady() {
    return;
  }

  static async create({
    mountEl,
    fileService,
    correctionsService,
    onStatus,
    onIssuesChanged,
    onFileChanged,
    onDisabledDblClick,
    imagePreviewModal
  }) {
    const component = new EditorComponent({
      mountEl,
      fileService,
      correctionsService,
      onStatus,
      onIssuesChanged,
      onFileChanged,
      onDisabledDblClick,
      imagePreviewModal
    });

    await component.base.ensureReady();

    component.editor = createEditor({
      parent: component.base.query("#editor"),
      initialText: "",
      onChange: () => component.handleEditorChange(),
      issueContext: component.getIssueContext(),
      onDisabledDblClick: () => component.handleDisabledDblClick(),
      resolveImageUrl: (url) => component.resolveImageUrl(url),
      onImagePreviewOpen: (payload) => component.openImagePreview(payload),
      onImagePreviewClose: () => component.closeImagePreview()
    });

    component.editor.view.dom.addEventListener("paste", (event) =>
      component.handlePaste(event),
      true
    );
    component.editor.view.dom.addEventListener("dragover", (event) =>
      component.handleDragOver(event),
      true
    );
    component.editor.view.dom.addEventListener("drop", (event) =>
      component.handleDrop(event),
      true
    );

    component.setEditorDisabled(true);

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

  getIssueContext() {
    return {
      correctionsService: this.correctionsService,
      getText: () => this.getText(),
      setText: (text) => this.editor.setText(text),
      getFilePath: () => this.filePath,
      getDirectory: () => this.activeDirectory,
      onStatus: (message) => this.onStatus(message),
      onIssuesUpdate: (issues) => this.updateIssues(issues)
    };
  }

  scrollTo(start, end) {
    this.editor.scrollTo(start, end);
  }

  async openFile(path) {
    if (this.filePath && path !== this.filePath) {
      const saved = await this.saveIfDirty();
      if (!saved) {
        return false;
      }
    }
    this.closeImagePreview();
    // get base dir, set file path

    const result = await this.fileService.readFile(path);
    if (!result) {
      return false;
    }
    const basePath = dirname(path);
    this.correctionsService.setCorrectionsDirectory(basePath);
    const status = await this.fileService.getGitSyncStatus(basePath);
    this.repoRoot = status?.repoRoot ?? null;
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
    this.closeImagePreview();
    this.onFileChanged(null);
  }

  openImagePreview(payload) {
    if (!this.imagePreviewModal || !payload?.src) {
      return;
    }
    const label = payload.raw ?? payload.src;
    this.imagePreviewModal.open({ src: payload.src, label });
  }

  closeImagePreview() {
    if (!this.imagePreviewModal) {
      return;
    }
    if (this.imagePreviewModal.isOpen()) {
      this.imagePreviewModal.close();
    }
  }

  resolveImageUrl(rawUrl) {
    const trimmed = (rawUrl ?? "").trim();
    if (!trimmed) {
      return null;
    }
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
      return trimmed;
    }
    if (trimmed.startsWith("/") && this.repoRoot) {
      const repoBase = this.repoRoot.replace(/\\/g, "/");
      const repo = repoBase.endsWith("/") ? repoBase : `${repoBase}/`;
      const normalized = trimmed.replace(/^\/+/, "");
      return `app://local${repo}${normalized}`;
    }
    if (!this.filePath) {
      return null;
    }
    const baseDir = dirname(this.filePath).replace(/\\/g, "/");
    const base = baseDir.endsWith("/") ? baseDir : `${baseDir}/`;
    const fileBase = `app://local${base}`;
    try {
      return new URL(trimmed, fileBase).href;
    } catch (error) {
      console.warn("Failed to resolve image url", error);
      return null;
    }
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

  handleDragOver(event) {
    if (this.hasImageDrag(event?.dataTransfer?.files)) {
      event.preventDefault();
    }
  }

  async handlePaste(event) {
    const imageFile = this.getImageFromClipboard(event?.clipboardData);
    if (!imageFile) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    await this.saveImageAndInsert(imageFile);
  }

  async handleDrop(event) {
    const imageFile = this.getImageFromDrop(event?.dataTransfer?.files);
    if (!imageFile) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    await this.saveImageAndInsert(imageFile);
  }

  getImageFromClipboard(clipboardData) {
    const items = clipboardData?.items ? Array.from(clipboardData.items) : [];
    for (const item of items) {
      if (item?.type?.startsWith("image/")) {
        return item.getAsFile?.() ?? null;
      }
    }
    return null;
  }

  getImageFromDrop(files) {
    const list = files ? Array.from(files) : [];
    for (const file of list) {
      if (file?.type?.startsWith("image/")) {
        return file;
      }
    }
    return null;
  }

  hasImageDrag(files) {
    const list = files ? Array.from(files) : [];
    return list.some((file) => file?.type?.startsWith("image/"));
  }

  async saveImageAndInsert(file) {
    if (!this.filePath) {
      this.onStatus("Select a file to insert an image.");
      return;
    }

    const payload = await this.buildImagePayload(file);
    if (!payload) {
      return;
    }

    const result = await this.fileService.saveImage({
      filePath: this.filePath,
      ...payload
    });
    if (result?.error) {
      this.onStatus(result.error);
      return;
    }
    if (result?.relativePath) {
      this.editor.insertTextAtCursor(`![](${result.relativePath})`);
    }
  }

  async buildImagePayload(file) {
    if (!file) {
      return null;
    }

    if (file.path) {
      return { sourcePath: file.path };
    }

    const buffer = file.arrayBuffer ? await file.arrayBuffer() : null;
    if (!buffer) {
      return null;
    }

    const extension = this.getFileExtension(file.name);
    return {
      buffer: new Uint8Array(buffer),
      extension,
      mimeType: file.type
    };
  }

  getFileExtension(name) {
    if (!name || !name.includes(".")) {
      return null;
    }
    const ext = name.split(".").pop();
    return ext ? ext.toLowerCase() : null;
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
      issue: issue?.data ?? issue
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
      issue: issue?.data ?? issue
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

  async updateIssues(issueData) {
    this.editor.setIssues(issueData);
    this.issues = issueData ?? [];
    this.onIssuesChanged(this.issues);
  }

  isMarkdownFile(path) {
    if (!path) {
      return false;
    }
    const lower = path.toLowerCase();
    return lower.endsWith(".md") || lower.endsWith(".markdown") || lower.endsWith(".mdx");
  }
}
