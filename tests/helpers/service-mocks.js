export function createFileServiceMock(overrides = {}) {
  return {
    async selectDirectory() {
      return { path: null };
    },
    async getLastDirectory() {
      return { path: null };
    },
    async validateDirectory() {
      return { ok: true };
    },
    async getHomeDirectory() {
      return { path: null };
    },
    async setLastDirectory() {
      return { ok: true };
    },
    async listTextFiles() {
      return { files: [], tooMany: false };
    },
    async readFile(filePath) {
      return { path: filePath, content: "" };
    },
    async saveFile() {
      return { ok: true };
    },
    async getGitSyncStatus() {
      return { available: false };
    },
    async syncWithOrigin() {
      return { available: false };
    },
    async createNewFile() {
      return { path: null };
    },
    async createFolder() {
      return { ok: true };
    },
    async deleteFile() {
      return { ok: true };
    },
    async renameFile() {
      return { ok: true };
    },
    ...overrides
  };
}

export function createCorrectionsServiceMock(overrides = {}) {
  return {
    async setCorrectionsDirectory() {
      return { ok: true };
    },
    async checkCorrections() {
      return { issues: { spell: [], grammar: [], llm: [] }, errors: {} };
    },
    async analyzeCorrections() {
      return { issues: { spell: [], grammar: [] }, errors: {} };
    },
    async applyIssue() {
      return { text: "", issues: { spell: [], grammar: [], llm: [] }, errors: {} };
    },
    async addDismissedChange() {
      return { issues: { spell: [], grammar: [], llm: [] }, errors: {} };
    },
    async addSpellingException() {
      return { issues: { spell: [], grammar: [], llm: [] }, errors: {} };
    },
    ...overrides
  };
}

export function createEditorMock(overrides = {}) {
  return {
    getText: () => "",
    setText: () => {},
    setIssues: () => {},
    scrollTo: () => {},
    ...overrides
  };
}
