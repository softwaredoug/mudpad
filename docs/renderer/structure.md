# Renderer structure

This document describes the current renderer architecture and the responsibilities of components, modals, and services.

## High-level layout

- `src/renderer/main.js` wires the app together, instantiates services and components, and owns top-level UI glue.
- `src/renderer/components/` holds stateful UI components.
- `src/renderer/modals/` contains modal UI classes and their HTML fragments.
- `src/renderer/services/` contains thin IPC wrappers.

## Components

### EditorComponent

Location: `src/renderer/components/editor-component.js`

Responsibilities:
- Owns editor state: active file path, text buffer, dirty tracking.
- Owns corrections state: current issues list.
- Schedules debounce checks and runs spell/grammar analysis.
- Applies, dismisses, and ignores issues through the corrections service.
- Publishes issue updates via `onIssuesChanged`.

State exposure:
- Pull-based getters: `getFilePath()`, `getText()`, `isDirty()`, `getIssues()`.
- Push-based callbacks: `onIssuesChanged(issues)` for future issue list components.

Backend interaction:
- Uses `FileService` to read/save files.
- Uses `CorrectionsService` to run checks, analyze, apply, dismiss, ignore.

### Issue

Location: `src/renderer/components/issue.js`

Responsibilities:
- Wraps raw issue data and proxies fields.
- Delegates actions to `EditorComponent` (`apply()`, `dismiss()`, `ignore()`).

### DirectorySelector

Location: `src/renderer/components/directory-selector.js`

Responsibilities:
- Loads its own HTML fragment via `BaseComponent`.
- Manages directory selection, validation, and persistence.
- Emits directory/glob changes and status updates.

### FileList

Location: `src/renderer/components/file-list.js`

Responsibilities:
- Renders the active file list and empty state messaging.
- Highlights the active file.
- Emits file open events on double click.
- Owns new file creation and new folder modal triggering.
- Loads its own HTML fragment via `BaseComponent`.

### IssuesSidebar

Location: `src/renderer/components/issues-sidebar.js`

Responsibilities:
- Loads its own HTML fragment via `BaseComponent`.
- Renders issue list, empty state, and action buttons.

## Modals

All modals use a shared `BaseModal` to load HTML fragments and manage open/close behavior.

### BaseComponent + BaseModal

- `BaseComponent` (in `src/renderer/modals/base-component.js`) loads and mounts HTML fragments.
- `BaseModal` (in `src/renderer/modals/base-modal.js`) composes `BaseComponent` and adds modal behavior:
  - open/close
  - backdrop click
  - escape to close

Each modal is a class that composes `BaseModal` and binds its own controls:
- `CommitModal`
- `RepoModal`
- `RenameModal`
- `NewFolderModal`
- `DeleteModal`

Each modal has an HTML fragment in `src/renderer/modals/*.html` and is loaded via `?raw`.

State exposure:
- Modals own their internal UI state (inputs, errors, focus) and expose methods like `open()`, `close()`, `isOpen()`.
- Modals do not publish state; higher-level components pull state from the editor or services.

Backend interaction:
- Modals directly call backend services (`FileService` for commits/rename/delete, `CorrectionsService` where relevant).

## Services

Services are thin IPC wrappers around `window.api`:

- `FileService`: file I/O, git status/sync, create/rename/delete, save, commit.
- `CorrectionsService`: corrections checks/analyze/apply/dismiss/ignore, set corrections directory.

## What else to know

- UI components pull state from `EditorComponent` instead of duplicating state in `main.js`.
- Renderer components do not access main-process APIs directly; they call services.
- `main.js` is expected to shrink as more UI components are extracted.
