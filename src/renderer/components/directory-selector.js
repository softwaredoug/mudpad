export class DirectorySelector {
  constructor({
    fileService,
    selectButton,
    input,
    errorLabel,
    onChange,
    onStatus,
    storage = window.localStorage
  }) {
    this.fileService = fileService;
    this.selectButton = selectButton;
    this.input = input;
    this.errorLabel = errorLabel;
    this.onChange = onChange ?? (() => {});
    this.onStatus = onStatus ?? (() => {});
    this.storage = storage;
    this.state = { directory: null, pattern: null, display: "" };
    this.bindEvents();
  }

  bindEvents() {
    this.selectButton.addEventListener("click", () => this.handleSelectClick());
    this.input.addEventListener("keydown", async (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        await this.applyInput();
      }
    });
    this.input.addEventListener("blur", async () => {
      await this.applyInput();
    });
  }

  getState() {
    return { ...this.state };
  }

  async initialize() {
    const lastDirectory = await this.fileService.getLastDirectory();
    if (lastDirectory?.path) {
      const parsed = this.parseDirectoryInput(lastDirectory.display ?? lastDirectory.path);
      const validation = await this.fileService.validateDirectory(parsed.directory);
      if (validation?.ok) {
        await this.updateState(parsed);
        return;
      }
    }

    const storedInput = this.storage.getItem("activeDirectoryInput");
    if (storedInput) {
      const parsed = this.parseDirectoryInput(storedInput);
      const validation = await this.fileService.validateDirectory(parsed.directory);
      if (validation?.ok) {
        await this.updateState(parsed);
        return;
      }
    }

    const stored = this.storage.getItem("activeDirectory");
    if (stored) {
      const validation = await this.fileService.validateDirectory(stored);
      if (validation?.ok) {
        await this.updateState({ directory: stored, pattern: null, display: stored });
        return;
      }
    }

    const home = await this.fileService.getHomeDirectory();
    if (home?.path) {
      await this.updateState({ directory: home.path, pattern: null, display: home.path });
    }
  }

  async handleSelectClick() {
    const result = await this.fileService.selectDirectory();
    if (!result?.path) {
      return;
    }
    await this.updateState({ directory: result.path, pattern: null, display: result.path });
  }

  async applyInput() {
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
    this.state = { ...nextState };
    this.input.value = nextState.display ?? nextState.directory ?? "";
    this.setError("");
    if (nextState.directory) {
      this.storage.setItem("activeDirectory", nextState.directory);
      if (nextState.display) {
        this.storage.setItem("activeDirectoryInput", nextState.display);
      }
      await this.fileService.setLastDirectory({
        directory: nextState.directory,
        display: nextState.display ?? nextState.directory
      });
    }
    this.onChange({ ...this.state });
  }

  setError(message) {
    this.errorLabel.textContent = message ?? "";
  }

  parseDirectoryInput(value) {
    const trimmed = value.trim();
    const globIndex = trimmed.search(/[\*\?\[]/);
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
