import { EditorState, StateEffect, StateField, Compartment } from "@codemirror/state";
import { EditorView, Decoration, keymap, hoverTooltip, placeholder } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { history, historyKeymap } from "@codemirror/commands";
import { search, searchKeymap } from "@codemirror/search";

const setIssuesEffect = StateEffect.define();
const setHoverSuppressedEffect = StateEffect.define();

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

const hoverSuppressedState = StateField.define({
  create() {
    return false;
  },
  update(value, transaction) {
    let next = value;
    for (const effect of transaction.effects) {
      if (effect.is(setHoverSuppressedEffect)) {
        next = Boolean(effect.value);
      }
    }
    return next;
  }
});

function createIssuesTooltip({ onApplyIssue, onDismissIssue, onIgnoreIssue } = {}) {
  return hoverTooltip((view, pos) => {
    if (view.state.field(hoverSuppressedState)) {
      return null;
    }
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
          const closeTooltip = () => {
            view.dispatch({ effects: setHoverSuppressedEffect.of(true) });
            container.remove();
            setTimeout(() => {
              view.dispatch({ effects: setHoverSuppressedEffect.of(false) });
            }, 250);
          };

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

        if (onApplyIssue || onDismissIssue || onIgnoreIssue) {
          const actions = document.createElement("div");
          actions.className = "cm-tooltip-issue-actions";

          if (onApplyIssue) {
            const applyButton = document.createElement("button");
            applyButton.type = "button";
            applyButton.className = "cm-tooltip-issue-action";
            applyButton.textContent = "Apply";
            applyButton.disabled = !(match.suggestions && match.suggestions.length);
            applyButton.addEventListener("click", (event) => {
              event.preventDefault();
              event.stopPropagation();
              closeTooltip();
              onApplyIssue(match);
            });
            actions.appendChild(applyButton);
          }

          if (onDismissIssue) {
            const dismissButton = document.createElement("button");
            dismissButton.type = "button";
            dismissButton.className = "cm-tooltip-issue-action";
            dismissButton.textContent = "Dismiss";
            dismissButton.addEventListener("click", (event) => {
              event.preventDefault();
              event.stopPropagation();
              closeTooltip();
              onDismissIssue(match);
            });
            actions.appendChild(dismissButton);
          }

          if (onIgnoreIssue) {
            const ignoreButton = document.createElement("button");
            ignoreButton.type = "button";
            ignoreButton.className = "cm-tooltip-issue-action";
            ignoreButton.textContent = "Always Ignore";
            const canIgnore = match.type === "spell" && match.word;
            ignoreButton.disabled = !canIgnore;
            if (!canIgnore) {
              ignoreButton.title = "Available for spelling only";
            } else {
                ignoreButton.addEventListener("click", (event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  closeTooltip();
                  onIgnoreIssue(match);
                });
            }
            actions.appendChild(ignoreButton);
          }

          container.appendChild(actions);
        }

        return { dom: container };
      }
    };
  });
}

export function createEditor({
  parent,
  initialText,
  onChange,
  onApplyIssue,
  onDismissIssue,
  onIgnoreIssue,
  onDisabledDblClick
}) {
  const editableCompartment = new Compartment();
  const placeholderCompartment = new Compartment();
  const state = EditorState.create({
    doc: initialText,
    extensions: [
      markdown(),
      history(),
      search(),
      keymap.of([...searchKeymap, ...historyKeymap]),
      EditorView.contentAttributes.of({
        spellcheck: "false",
        autocorrect: "off",
        autocapitalize: "off"
      }),
      EditorView.lineWrapping,
      issuesField,
      issuesState,
      hoverSuppressedState,
      createIssuesTooltip({ onApplyIssue, onDismissIssue, onIgnoreIssue }),
      editableCompartment.of(EditorView.editable.of(true)),
      placeholderCompartment.of([]),
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

  if (onDisabledDblClick) {
    view.dom.addEventListener("dblclick", () => {
      const isEditable = view.state.facet(EditorView.editable);
      if (!isEditable) {
        onDisabledDblClick();
      }
    });
  }

  return {
    view,
    getText: () => view.state.doc.toString(),
    setText: (text) => {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text ?? "" }
      });
    },
    scrollTo: (from, to) => {
      const start = Math.max(0, from ?? 0);
      const end = Math.max(start, to ?? start);
      view.dispatch({
        selection: { anchor: start, head: end },
        scrollIntoView: true
      });
      view.focus();
    },
    replaceRange: (from, to, insert) => {
      view.dispatch({
        changes: { from, to, insert }
      });
    },
    setIssues: (issues) => {
      issues.forEach((issue) => {
        console.warn(`Setting issue:`, issue);
      });
      view.dispatch({
        effects: setIssuesEffect.of({
          issues: issues ?? [],
          docLength: view.state.doc.length
        })
      });
    },
    setEditable: (isEditable) => {
      view.dispatch({
        effects: editableCompartment.reconfigure(
          EditorView.editable.of(Boolean(isEditable))
        )
      });
    },
    setPlaceholder: (text) => {
      view.dispatch({
        effects: placeholderCompartment.reconfigure(
          text ? placeholder(text) : []
        )
      });
    }
  };
}
