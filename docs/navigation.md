# Navigation + file interactions

Core file navigation primitives transcend just "Open":

There should be a top bar of the active directory. A dialog should be available to select the active directory.

There should be a side bar showing the markdown files in that directory

Double clicking should open that file

## Folder navigation

We should start with the users home directory selected

I should be able to type the path, and an error will show if after typing that file does not exist

Reloading the application should show the previously loaded folder

## GLOB behavior

In addition to typing a path at the top, I should be able to type a glob pattern along with the path to filter the files shown in the sidebar. For example, typing `/path/to/folder/*.md` should show only markdown files in that folder. Typing `/path/to/folder/**/*.md` should show all markdown files in that folder and all subfolders.

## Saving is committing

Saving should present a pop-up for a commit message (similar to using the github markdown editor) and saving should commit
with that message.

It should ask for a short message and a detailed message. At least the short message should be required. The detailed message can be optional.


## Sync state with 'origin'

When the directory is associated with a git repo, the bottom right should show a green light if the repo is in sync with the origin
and a red warning if the repo is not in sync with the origin. Clicking on the light should show a dialog with the current status of the repo and allow for syncing with the origin.

If the repo has not been pushed (ie local main is ahead of remote main), the bottomm right should show a red warning and clicking on it should show a dialog with the current status of the repo and allow for syncing with the origin.


## No save, open, etc buttons

There's no explicit save, open buttons. Just the file sidebar and the ability to select the active working directory.

## New file behavior

When creating a new file, it should be created as following to be friendly to Jekyll site

- A filename with the timestamp path YYYY-MM-DD-new-file-(N).md (N increments if file exists at N-1). N is omitted if the file does not exist. The timestamp is the current date in the user's timezone.
- Jekyll front matter is created as follows:

```yaml
---
layout: post
title: "New blog article"
description: "A new blog by Doug"
category: blog
draft: true
---
```

notice draft: true, that's important as it shows not published

Add this with git, if a git repo, with a git add command

## New folder behavior

When creating a new folder, we should give a dialog to enter the folder name, and create the folder in the current working directory.

## File rename behavior

Double clicking on the selected file will allow the user to rename the file.

Just pop up a dialog to do this

If the file is in a git repo, then the rename should be a git mv operation, and the user should be prompted to commit the change with a message.

When this rename happens, there's a commit. But prepopulate the form with "Moved file <path> to <new path>"

## File delete behavior

Within the double click dialog, there should be a delete button. This will delete the file.

Delete should perform a git rm operation if the file is in a git repo, and the user should be prompted to commit the change with a message.

When this delete happens, there's a commit. But prepopulate the form with "Deleted file <path>"

## Glob behavior

