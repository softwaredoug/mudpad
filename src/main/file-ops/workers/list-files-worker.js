import { parentPort, workerData } from "worker_threads";
import { listTextFiles } from "../file-ops.js";

async function run() {
  try {
    const result = await listTextFiles(workerData ?? {});
    parentPort.postMessage(result);
  } catch (error) {
    parentPort.postMessage({
      files: [],
      tooMany: false,
      error: error?.message || "Failed to list files."
    });
  }
}

run();
