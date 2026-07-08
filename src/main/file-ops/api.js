import { Worker } from "worker_threads";
import * as fileOps from "./file-ops.js";


export class FileOpsAPI {

  constructor() {}

  static async create(ipcMain) {
    const api = new FileOpsAPI();

    ipcMain.handle("list-text-files", async (_event, payload) =>
      api.listTextFilesInWorker(payload)
    );

    ipcMain.handle("read-file", async (_event, filePath) => fileOps.readFile(filePath));

    ipcMain.handle("save-file", async (_event, payload) => fileOps.saveFile(payload));

    ipcMain.handle("create-new-file", async (_event, directory) =>
      fileOps.createNewFile(directory)
    );

    ipcMain.handle("create-folder", async (_event, payload) => fileOps.createFolder(payload));

    ipcMain.handle("rename-file", async (_event, payload) => fileOps.renameFile(payload));

    ipcMain.handle("delete-file", async (_event, payload) => fileOps.deleteFile(payload));

    ipcMain.handle("save-and-commit", async (_event, payload) => fileOps.saveAndCommit(payload));

    ipcMain.handle("get-git-sync-status", async (_event, directory) =>
      fileOps.getGitStatus(directory, { fetch: true })
    );

    ipcMain.handle("sync-with-origin", async (_event, directory) =>
      fileOps.syncWithOrigin(directory)
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
}
