import path from "path";
import fs from "fs/promises";


export default class LastOpened {
  // Track the last opened directory + file

  constructor(userDataPath) {
    this.filePath = path.join(userDataPath, "last-directory.json");
  }

  static async create(userDataPath) {
    const lastOpened = new LastOpened(userDataPath);
    try {
      await fs.access(lastOpened.filePath);
    } catch {
      // File does not exist, create it with default content
      const defaultContent = JSON.stringify({ directory: "", display: "", lastFile: null }, null, 2);
      await fs.writeFile(lastOpened.filePath, defaultContent, "utf8");
    }
    return lastOpened;
  }


  async #read() {
    const content = await fs.readFile(this.filePath, "utf8");
    const data = JSON.parse(content);
    let lastOpened = {
      directory: null,
      display: null,
      lastFile: null
    }
    if (data?.directory) {
      lastOpened.directory = data.directory;
    }
    if (data?.display) {
      lastOpened.display = data.display;
    }
    if (data?.lastFile) {
      lastOpened.lastFile = data.lastFile;
    }
    console.log(`Read last opened: ${JSON.stringify(lastOpened)}`);
    return lastOpened;
  }

  async #write(directory, display, lastFile) {
    let currentState = await this.#read()
    directory = directory ?? currentState?.directory ?? "";
    display = display ?? currentState?.display ?? directory ?? "";
    lastFile = lastFile ?? currentState?.lastFile;

    const content = JSON.stringify({directory, display, lastFile}, null, 2);
    console.log(`Writing last opened: ${content}`);
    await fs.writeFile(this.filePath, content, "utf8");
  }

  async writeDirectory(directory, display) {
    return this.#write(directory, display, null);
  }

  async writeLastFile(lastFile) {
    return this.#write(null, null, lastFile);
  }

  async getDirectory() {
    let content = await this.#read()
    return content?.directory;
  }

  async getDisplay() {
    let content = await this.#read()
    return content?.display || content?.directory;
  }

  async getLastFile() {
    let content = await this.#read()
    return content?.lastFile;
  }

}

