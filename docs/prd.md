# Editor w/ LLM feedback

This repo is an Electron app for editing text with spellchecking, grammar, and LLM feedback. It's meant to make humans better writers through improved copy-editing, not replace the human.

## Docs to edit

The docs to be edited are markdown files with frontmatter.

Docs are just files on disk. This app doesn't need a database.

## Presentation

The editor should look like the Github web editor. Just present the raw markdown text to edit.

Spelling / grammar / problem areas will be flagged with squiggles under the text. So just a textarea may be insufficient. We
need a richer text area that allows areas to be flagged / highlighted as needed.

## Corrections Layer

A corrections layer exists to interact / help copy-edit the text.

Corrections include

- Classic spell checking (red squiggle)
- Grammar checking (green squiggle)
- LLM copy editing feedback (yellow squiggle)
