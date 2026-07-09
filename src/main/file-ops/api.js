import { Worker } from "worker_threads";
import * as fileOps from "./file-ops.js";


export class FileOpsAPI {

  constructor() {}

  static async create(ipcMain) {
    const api = new FileOpsAPI();

    ipcMain.handle("list-text-files", async (_event, payload) =>
      api.listTextFilesInWorker(payload)
    );

    ipcMain.handle("read-file", async (_event, filePath) => api.readFile(filePath));

    ipcMain.handle("save-file", async (_event, payload) => api.saveFile(payload));

    ipcMain.handle("create-new-file", async (_event, directory) =>
      api.createNewFile(directory)
    );

    ipcMain.handle("create-folder", async (_event, payload) => api.createFolder(payload));

    ipcMain.handle("rename-file", async (_event, payload) => api.renameFile(payload));

    ipcMain.handle("delete-file", async (_event, payload) => api.deleteFile(payload));

    ipcMain.handle("save-and-commit", async (_event, payload) => api.saveAndCommit(payload));

    ipcMain.handle("get-git-sync-status", async (_event, directory) =>
      api.getGitStatus(directory, { fetch: true })
    );

    ipcMain.handle("sync-with-origin", async (_event, directory) =>
      api.syncWithOrigin(directory)
    );

    return api;
  }

  async listTextFilesInWorker(payload) {
    return new Promise((resolve) => {
      const worker = new Worker(new URL("./workers/list-files-worker.js", import.meta.url), {
        workerData: payload ?? {}
      });

      worker.once("message", (message) => {
        resolve(message);
        worker.terminate();
      });

      worker.once("error", (error) => {
        resolve({ files: [], tooMany: false, error: error?.message || "Failed to list files." });
        worker.terminate();
      });

      worker.once("exit", (code) => {
        if (code !== 0) {
          resolve({ files: [], tooMany: false, error: `Worker exited with code ${code}` });
        }
      });
    });
  }

  async listTextFiles(payload) {
    return fileOps.listTextFiles(payload);
  }

  async readFile(filePath) {
    return fileOps.readFile(filePath);
  }

  async saveFile(payload) {
    return fileOps.saveFile(payload);
  }

  async createNewFile(directory, options) {
    return fileOps.createNewFile(directory, options);
  }

  async createFolder(payload) {
    return fileOps.createFolder(payload);
  }

  async renameFile(payload) {
    return fileOps.renameFile(payload);
  }

  async deleteFile(payload) {
    return fileOps.deleteFile(payload);
  }

  async saveAndCommit(payload) {
    return fileOps.saveAndCommit(payload);
  }

  async getGitStatus(directory, options) {
    return fileOps.getGitStatus(directory, options);
  }

  async syncWithOrigin(directory) {
    return fileOps.syncWithOrigin(directory);
  }
}
