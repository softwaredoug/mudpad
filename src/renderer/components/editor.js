import { EditorState, StateEffect, StateField, Compartment } from "@codemirror/state";
import { EditorView, Decoration, keymap, hoverTooltip, placeholder } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { history, historyKeymap } from "@codemirror/commands";
import { search, searchKeymap } from "@codemirror/search";
import { createIssueComponents } from "./issues.js";

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

function createIssuesTooltip({ issueContext } = {}) {
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

        void createIssueComponents(container, issueContext, [match]).then(
          (components) => {
            for (const issueComponent of components) {
              const originalApply = issueComponent.onApply;
              const originalDismiss = issueComponent.onDismiss;
              const originalIgnore = issueComponent.onIgnore;

              issueComponent.onSelect = () => closeTooltip();
              issueComponent.getFilePath = () => issueComponent.filePath;

              issueComponent.onApply = async (issue) => {
                await originalApply?.(issue);
                closeTooltip();
              };
              issueComponent.onDismiss = async (issue) => {
                await originalDismiss?.(issue);
                closeTooltip();
              };
              issueComponent.onIgnore = async (issue, word) => {
                await originalIgnore?.(issue, word);
                closeTooltip();
              };
            }
          }
        );

        return { dom: container };
      }
    };
  });
}

const imageLinkPattern = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

function normalizeImageUrl(url) {
  const trimmed = (url ?? "").trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function findImageUrlAtPos(view, pos) {
  imageLinkPattern.lastIndex = 0;
  const line = view.state.doc.lineAt(pos);
  const text = line.text;
  let match;
  while ((match = imageLinkPattern.exec(text)) !== null) {
    const fullMatch = match[0];
    const rawUrl = match[1];
    const urlIndex = fullMatch.indexOf(rawUrl);
    if (urlIndex === -1) {
      continue;
    }
    const urlStart = line.from + match.index + urlIndex;
    const urlEnd = urlStart + rawUrl.length;
    if (pos >= urlStart && pos <= urlEnd) {
      return {
        url: normalizeImageUrl(rawUrl),
        range: { start: urlStart, end: urlEnd }
      };
    }
  }
  return null;
}

function createImagePreviewHandlers({ resolveImageUrl, onPreviewOpen, onPreviewClose } = {}) {
  let activePreview = null;
  const clearPreview = () => {
    if (!activePreview) {
      return;
    }
    activePreview = null;
    onPreviewClose?.();
  };
  return EditorView.domEventHandlers({
    mousemove(event, view) {
      if (!onPreviewOpen) {
        return false;
      }
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos == null) {
        clearPreview();
        return false;
      }
      const match = findImageUrlAtPos(view, pos);
      if (!match?.url) {
        clearPreview();
        return false;
      }
      const resolved = resolveImageUrl ? resolveImageUrl(match.url) : match.url;
      if (!resolved) {
        clearPreview();
        return false;
      }
      if (
        activePreview
        && activePreview.src === resolved
        && activePreview.start === match.range.start
        && activePreview.end === match.range.end
      ) {
        return false;
      }
      activePreview = {
        src: resolved,
        start: match.range.start,
        end: match.range.end,
        raw: match.url
      };
      onPreviewOpen({ src: resolved, raw: match.url });
      return false;
    },
    mouseleave() {
      clearPreview();
      return false;
    }
  });
}

export function createEditor({
  parent,
  initialText,
  onChange,
  issueContext,
  onDisabledDblClick,
  resolveImageUrl,
  onImagePreviewOpen,
  onImagePreviewClose
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
      createIssuesTooltip({ issueContext }),
      createImagePreviewHandlers({
        resolveImageUrl,
        onPreviewOpen: onImagePreviewOpen,
        onPreviewClose: onImagePreviewClose
      }),
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
    insertTextAtCursor: (text) => {
      const selection = view.state.selection.main;
      const insertText = text ?? "";
      view.dispatch({
        changes: { from: selection.from, to: selection.to, insert: insertText },
        selection: { anchor: selection.from + insertText.length }
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
