export class Issue {
  constructor({ editor, data }) {
    this.editor = editor;
    this.data = data;
    Object.assign(this, data);
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
