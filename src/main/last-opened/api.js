import LastOpened from "./last-opened.js";


export class LastOpenedAPI {

  constructor(lastOpened) {
    this.lastOpened = lastOpened;
  }

  static async create(app, ipcMain) {
    const lastOpened = await LastOpened.create(app.getPath("userData"));
    const api = new LastOpenedAPI(lastOpened);
    ipcMain.handle("get-last-directory", async () => api.readLastDirectory());

    ipcMain.handle("set-last-directory", async (_event, payload) =>
      api.writeLastDirectory(payload)
    );
    ipcMain.handle("get-last-file", async () => api.readLastFile());
    ipcMain.handle("set-last-file", async (_event, payload) =>
      api.writeLastFilePath(payload)
    );
    return api;
  }

  async readLastDirectory() {
    let directory = await this.lastOpened.getDirectory();
    let display = await this.lastOpened.getDisplay();
    return {path: directory, display: display};
  }

  async readLastFilePath() {
    let lastFile = await this.lastOpened.getLastFile();
    return {lastFilePath: lastFile};
  }

  async writeLastDirectory(payload) {
    const directory = payload?.directory ?? payload;
    if (!directory) {
      return { ok: false };
    }
    try {
      await this.lastOpened.writeDirectory(directory, payload?.display);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.message || "Failed to save directory." };
    }
  }

  async writeLastFilePath(payload) {
    const filepath = payload?.lastFilePath ?? payload;
    if (!filepath) {
      return { ok: false };
    }
    try {
      await this.lastOpened.writeLastFile(filepath);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.message || "Failed to save last file path." };
    }
  }
}
