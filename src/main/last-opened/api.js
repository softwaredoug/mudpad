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
    return api;
  }

  async readLastDirectory() {
    let directory = await this.lastOpened.getDirectory();
    let display = await this.lastOpened.getDisplay();
    return {path: directory, display: display};
  }

  async readLastFile() {
    return {lastFile: await this.lastOpened.getLastFile()}
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
}
