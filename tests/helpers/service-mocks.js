function trackCalls(fn) {
  function wrapped(...args) {
    wrapped.calls.push(args);
    return fn(...args);
  }
  wrapped.calls = wrapped.calls || [];
  return wrapped
}


function wrapAllFunctions(obj) {
  const wrapped = {};
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === "function") {
      wrapped[key] = trackCalls(obj[key]);
    } else {
      wrapped[key] = obj[key];
    }
  }
  return wrapped;
}



export function createFileServiceMock(overrides = {}) {
  var mock = {
    async selectDirectory() {
      return { path: null };
    },
    async getLastDirectory() {
      return { path: null };
    },
    async validateDirectory(directory) {
      return { ok: true };
    },
    async getHomeDirectory() {
      return { path: null };
    },
    async setLastDirectory() {
      return { ok: true };
    },
    async listTextFiles(payload) {
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
    async createNewFile(directory) {
      return { path: null };
    },
    async createFolder(payload) {
      return { ok: true };
    },
    async deleteFile(payload) {
      return { ok: true };
    },
    async renameFile(payload) {
      return { ok: true };
    },
    ...overrides
  };
  return wrapAllFunctions(mock);
}

export function createCorrectionsServiceMock(overrides = {}) {
  var mock = {
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
  return wrapAllFunctions(mock);
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
