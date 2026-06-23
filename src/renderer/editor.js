import { EditorState, StateEffect, StateField } from "@codemirror/state";
import { EditorView, Decoration, keymap, hoverTooltip } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { history, historyKeymap } from "@codemirror/commands";

const setIssuesEffect = StateEffect.define();

function normalizeIssues(issues, docLength) {
  const normalized = [];
  const maxLength = Math.max(0, docLength ?? 0);
  for (const issue of issues) {
    if (!issue?.range) {
      continue;
    }
    const start = Math.min(maxLength, Math.max(0, issue.range.start ?? 0));
    const end = Math.min(maxLength, Math.max(start, issue.range.end ?? start));
    normalized.push({ ...issue, range: { start, end } });
  }
  return normalized;
}

function buildDecorations(issues) {
  const decorations = issues.map((issue) =>
    Decoration.mark({ class: `issue-${issue.type}` }).range(
      issue.range.start,
      issue.range.end
    )
  );
  return Decoration.set(decorations, true);
}

const issuesField = StateField.define({
  create() {
    return Decoration.none;
  },
  update(decorations, transaction) {
    let next = decorations.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(setIssuesEffect)) {
        next = buildDecorations(effect.value?.issues ?? []);
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field)
});

const issuesState = StateField.define({
  create() {
    return [];
  },
  update(value, transaction) {
    let next = value;
    for (const effect of transaction.effects) {
      if (effect.is(setIssuesEffect)) {
        next = normalizeIssues(
          effect.value?.issues ?? [],
          effect.value?.docLength ?? 0
        );
      }
    }
    return next;
  }
});

const issuesTooltip = hoverTooltip((view, pos) => {
  const issues = view.state.field(issuesState);
  const match = issues.find(
    (issue) => pos >= issue.range.start && pos <= issue.range.end
  );
  if (!match) {
    return null;
  }

  return {
    pos: match.range.start,
    end: match.range.end,
    create() {
      const container = document.createElement("div");
      container.className = "cm-tooltip-issue";

      const title = document.createElement("div");
      title.className = "cm-tooltip-issue-title";
      title.textContent = match.type?.toUpperCase() ?? "ISSUE";

      const message = document.createElement("div");
      message.className = "cm-tooltip-issue-message";
      message.textContent = match.message ?? "";

      const source = document.createElement("div");
      source.className = "cm-tooltip-issue-source";
      source.textContent = `Source: ${match.source ?? "unknown"}`;

      container.appendChild(title);
      container.appendChild(message);
      container.appendChild(source);

      if (match.suggestions?.length) {
        const suggestion = document.createElement("div");
        suggestion.className = "cm-tooltip-issue-suggestion";
        suggestion.textContent = `Suggestion: ${match.suggestions[0]}`;
        container.appendChild(suggestion);
      }

      return { dom: container };
    }
  };
});

export function createEditor({ parent, initialText, onChange }) {
  const state = EditorState.create({
    doc: initialText,
    extensions: [
      markdown(),
      history(),
      keymap.of([...historyKeymap]),
      EditorView.lineWrapping,
      issuesField,
      issuesState,
      issuesTooltip,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChange(update.state.doc.toString());
        }
      })
    ]
  });

  const view = new EditorView({
    state,
    parent
  });

  return {
    view,
    getText: () => view.state.doc.toString(),
    setText: (text) => {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text ?? "" }
      });
    },
    replaceRange: (from, to, insert) => {
      view.dispatch({
        changes: { from, to, insert }
      });
    },
    setIssues: (issues) => {
      view.dispatch({
        effects: setIssuesEffect.of({
          issues: issues ?? [],
          docLength: view.state.doc.length
        })
      });
    }
  };
}
