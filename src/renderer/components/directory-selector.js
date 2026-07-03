import { BaseComponent } from "../modals/base-component.js";

export class DirectorySelector {
  constructor({ fileService, mountEl, onChange, onStatus }) {
    this.base = new BaseComponent({
      mountEl,
      templateUrl: new URL("./directory-selector.html?raw", import.meta.url)
    });
    this.fileService = fileService;
    this.onChange = onChange ?? (() => {});
    this.onStatus = onStatus ?? (() => {});
    this.state = { directory: null, pattern: null, display: "" };
    this.input = null;
    this.errorLabel = null;
    this.selectButton = null;
    this._bound = false;
  }

  async ensureReady() {
    await this.base.ensureReady();
    if (this._bound) {
      return;
    }
    this.input = this.base.query(".active-directory");
    this.errorLabel = this.base.query(".directory-error");
    this.selectButton = this.base.query(".select-directory-button");

    this.selectButton?.addEventListener("click", () => this.handleSelectClick());
    this.input?.addEventListener("keydown", async (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        await this.applyInput();
      }
    });
    this.input?.addEventListener("blur", async () => {
      await this.applyInput();
    });
    this._bound = true;
  }

  static async create({ fileService, mountEl, onChange, onStatus }) {
    const selector = new DirectorySelector({
      fileService,
      mountEl,
      onChange,
      onStatus,
    });
    console.log(`[renderer +${Math.round(performance.now())}ms] DirectorySelector created`);
    await selector.initialize();
    console.log(`[renderer +${Math.round(performance.now())}ms] DirectorySelector initialized`);
    return selector;
  }

  getState() {
    return { ...this.state };
  }

  getActiveDirectory() {
    return this.state.directory;
  }

  getActiveGlobPattern() {
    return this.state.pattern;
  }

  async initialize() {
    await this.ensureReady();
    const lastDirectory = await this.fileService.getLastDirectory();
    if (lastDirectory?.path) {
      const parsed = this.parseDirectoryInput(lastDirectory.display ?? lastDirectory.path);
      const validation = await this.fileService.validateDirectory(parsed.directory);
      if (validation?.ok) {
        await this.updateState(parsed);
        return;
      }
    }

    const home = await this.fileService.getHomeDirectory();
    if (home?.path) {
      await this.updateState({ directory: home.path, pattern: null, display: home.path });
    }
  }

  async handleSelectClick() {
    await this.ensureReady();
    const result = await this.fileService.selectDirectory();
    if (!result?.path) {
      return;
    }
    await this.updateState({ directory: result.path, pattern: null, display: result.path });
  }

  async applyInput() {
    await this.ensureReady();
    const value = this.input.value.trim();
    if (!value) {
      if (this.state.display) {
        this.input.value = this.state.display;
        this.setError("");
        return;
      }
      this.setError("Path is required.");
      return;
    }

    const parsed = this.parseDirectoryInput(value);
    const result = await this.fileService.validateDirectory(parsed.directory);
    if (!result?.ok) {
      this.setError(result?.error ?? "Directory not found.");
      return;
    }

    await this.updateState(parsed);
  }

  async updateState(nextState) {
    console.log(`[renderer +${Math.round(performance.now())}ms] DirectorySelector updateState called`);
    this.state = { ...nextState };
    this.input.value = nextState.display ?? nextState.directory ?? "";
    this.setError("");
    if (nextState.directory) {
      this.fileService.setLastDirectory({
        directory: nextState.directory,
        display: nextState.display ?? nextState.directory
      });
    }
    console.log(`[renderer +${Math.round(performance.now())}ms] DirectorySelector calling on change`);
    this.onChange({ ...this.state });
  }

  setError(message) {
    if (!this.errorLabel) {
      return;
    }
    this.errorLabel.textContent = message ?? "";
  }

  parseDirectoryInput(value) {
    const trimmed = value.trim();
    const globIndex = trimmed.search(/[*?[]/);
    if (globIndex === -1) {
      return { directory: trimmed, pattern: null, display: trimmed };
    }

    const separatorIndex = trimmed.lastIndexOf("/", globIndex);
    if (separatorIndex === -1) {
      return { directory: trimmed, pattern: null, display: trimmed };
    }

    const directory = trimmed.slice(0, separatorIndex) || "/";
    const pattern = trimmed.slice(separatorIndex + 1);
    return { directory, pattern, display: trimmed };
  }
}
