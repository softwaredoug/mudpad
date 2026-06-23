# Implementation Notes

This document outlines a concrete implementation approach for the Electron editor.

## Goals

- Raw markdown editing with GitHub-like presentation.
- Squiggle feedback for spell (red), grammar (green), and LLM copy edits (yellow).
- Filesystem-backed documents with frontmatter; no database.

## Tech Choices

- Editor: CodeMirror 6 with decoration marks for squiggles.
- Spell check: local spell checker (e.g., hunspell) with fast, incremental scan.
- Grammar check: local LanguageTool server for privacy/offline support.
- LLM copy edit: OpenAI API; user-triggered analysis only.

## High-Level Architecture

- Main process (Electron): window lifecycle, file dialogs, filesystem access, IPC.
- Renderer: editor shell, CodeMirror view, corrections UI, settings.
- Services: spell/grammar/LLM adapters, diff apply, range mapping utilities.

## Data Model

Issue object (shared across all corrections):

- id: string
- type: spell | grammar | llm
- range: { start: number, end: number }
- message: string
- suggestions: string[]
- source: string
- confidence: number
- status: open | accepted | rejected

## Data Flow

1. Open file -> load raw markdown into editor buffer.
2. On edit -> debounce -> spell + grammar checks -> update squiggles.
3. User clicks Analyze -> LLM copy edit -> issue list + yellow squiggles.
4. User accepts/rejects -> apply text diff to buffer.
5. Save -> write raw markdown to disk.

## UI Notes

- Inline squiggles via CodeMirror decorations.
- Hover tooltip for each issue; shows explanation and actions.
- Side panel to filter by type and apply suggestions in bulk.
- Legend for red/green/yellow in the editor footer.

## Range Mapping

- Maintain a mapping utility to keep issue ranges accurate as edits occur.
- Invalidate stale LLM results on significant edits; prompt re-run.

## Testing

- Unit: range mapping, diff application, frontmatter parsing.
- E2E: open file, edit, see squiggles, apply suggestion, save.
- Integration: LLM request/response with real OpenAI API.
