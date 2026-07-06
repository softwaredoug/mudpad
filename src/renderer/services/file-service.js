export class FileService {
  showDirectoryPicker() {
    return window.api.showDirectoryPicker();
  }

  getLastDirectory() {
    return window.api.getLastDirectory();
  }

  setLastDirectory(payload) {
    return window.api.setLastDirectory(payload);
  }

  setLastFilePath(payload) {
    return window.api.setLastFilePath(payload);
  }

  getLastFilePath() {
    return window.api.getLastFilePath();
  }

  getHomeDirectory() {
    return window.api.getHomeDirectory();
  }

  validateDirectory(directory) {
    return window.api.validateDirectory(directory);
  }

  listTextFiles(payload) {
    return window.api.listTextFiles(payload);
  }

  readFile(filePath) {
    return window.api.readFile(filePath);
  }

  saveFile(payload) {
    return window.api.saveFile(payload);
  }

  createNewFile(directory) {
    return window.api.createNewFile(directory);
  }

  createFolder(payload) {
    return window.api.createFolder(payload);
  }

  renameFile(payload) {
    return window.api.renameFile(payload);
  }

  deleteFile(payload) {
    return window.api.deleteFile(payload);
  }

  saveAndCommit(payload) {
    return window.api.saveAndCommit(payload);
  }

  getGitSyncStatus(directory) {
    return window.api.getGitSyncStatus(directory);
  }

  syncWithOrigin(directory) {
    return window.api.syncWithOrigin(directory);
  }
}
