
import { Issue } from "./issue.js";

function normalizeIssues(result) {
  if (!result?.issues) {
    return null;
  }
  return [
    ...(result.issues.spell ?? []),
    ...(result.issues.grammar ?? []),
    ...(result.issues.llm ?? [])
  ];
}

export async function createIssueComponents(mountEl, issueContext, issues) {
  const {
    correctionsService,
    getText = () => "",
    setText = () => {},
    getFilePath = () => null,
    getDirectory = () => null,
    onIssuesUpdate = () => {},
    onStatus = () => {}
  } = issueContext ?? {};

  const components = [];
  const filePath = getFilePath();
  const directory = getDirectory();

  async function handleResult(result, { updateText }) {
    if (result?.error) {
      onStatus(result.error);
      return;
    }
    if (updateText && typeof result?.text === "string") {
      setText(result.text);
    }
    const updatedIssues = normalizeIssues(result);
    if (updatedIssues) {
      onIssuesUpdate(updatedIssues);
    }
  }

  const handlers = {
    async onApply(issue) {
      const text = getText();
      const result = await correctionsService.applyIssue({
        filePath,
        text,
        issue
      });
      await handleResult(result, { updateText: true });
    },

    async onDismiss(issue) {
      const text = getText();
      const result = await correctionsService.addDismissedChange({
        directory,
        filePath,
        text,
        issue
      });
      await handleResult(result, { updateText: false });
    },

    async onIgnore(issue, word) {
      const text = getText();
      const result = await correctionsService.addSpellingException({
        directory,
        filePath,
        word,
        text
      });
      await handleResult(result, { updateText: false });
    }
  };

  for (const issue of issues) {
    const issueComponent = await Issue.create({
      mountEl,
      issue,
      correctionsService,
      filePath,
      directory,
      onIgnore: handlers.onIgnore,
      onApply: handlers.onApply,
      onDismiss: handlers.onDismiss
    });
    components.push(issueComponent);
  }
  return components;
}
