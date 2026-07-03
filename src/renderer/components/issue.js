export class Issue {
  constructor({ editor, data }) {
    this.editor = editor;
    this.data = data;
    Object.assign(this, data);
  }

  async ensureReady() {
    return;
  }

  static async create({ editor, data }) {
    const issue = new Issue({ editor, data });
    await issue.ensureReady();
    return issue;
  }

  apply() {
    return this.editor.applyIssue(this);
  }

  dismiss() {
    return this.editor.dismissIssue(this);
  }

  ignore() {
    return this.editor.ignoreIssue(this);
  }
}
