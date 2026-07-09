This is an electron app to help edit blog posts and other markdown content while providing live feedback from
LLMs and other services.

It's written in vanilla JS. 

## App vision

The goal of this app is to provide a minimilast editor for markdown content. Specifically for static sites (jekyll, hugo, etc). 
The primary type of text that's edited is markdown with frontmatter. Almost always we're editing relative to a git repo. So the project
must be git aware. For example a save (CMD+S) leads to a git commit. And there's an indication of whether the repo is synced with a remote.

The app is intended to stay minimalist, but allow guided feedback. Currently that feedback comes from LanguageTool. But in the future it might
come from elsewhere.

The app is intended to work primarilly on Mac / OSX.

## Architecture

It's important to respect the architecture. And various tests here actually enforced via tests.

- renderer - the UI process, which is a vanilla JS app
- main - the main process, which is a nodejs app that runs the renderer and provides services (file, git, corrections, etc) to the renderer

### Renderer architecture

The renderer is intentionally component-based. NOT MVC, etc.

By component, we mean that the there is some segment of the app (ie the editor, issues sidebar, etc) that holds state related to that segment. And the component interacts with backend services to get data, update state, and modify the environment. 

Components can also hold other components to delegate part of the UI. In fact the entire app is a component, with subcomponents. However, it's generally discouraged that components hold other components by reference. A component either *owns* other components.

When a comopnent does need to react to another compoenent, it does so through callbacks, ie onSubmit or onApply. The callbacks should semantically relate to a UI action that the user would do in this. IE not "onButtonClick".

Every component has a corresponding HTML file that defines the UI for that component. The HTML file is loaded asyncronously by the component when it's setup.

Please note: modals are also components.

In addition to components, the renderer holds 'services' that just forward the IPC calls back to the main process. These are kept intentionally thin.

### Renderer testing

The primary method of testing the renderer is through e2e testing. What is e2e testing? We mean mocking the boundaries of the renderer, and testing without knowledge of internals. That means instantiating the app component, interacting with CSS, and observing how the DOM changes, and how the services are called.

In these tests the renderer service layer is mocked, so that the renderer can be tested without knowledge of the main process.

See tests/e2e/renderer/*.js for more

Secondarily, various unit tests also exist. These are of secondary importance, as the guts of the renderer might change. But of note, there's a test that tests if components act like components (essentially similar to type checking, but JS doesn't have strong typing).

That test is tests/unit/components-contract.test.js

If a test breaks. DO NOT change the test without checking with the user first. 

### Main architecture

Main generally tries to split up functionality into modules. Each module has a class that might instantiate some backend state. But also registers IPC handlers.

Then e2e testing occurs by calling the handler functions directly. Setting up any fake filesystem, etc as needed. Then confirming correct behavior.

Tests can be found in tests/e2e/main/*.js


## How to develop code

When you're asked to make a functional change, follow a TDD flow:

1. ALWAYS create an e2e test
2. Run the test, ensure it fails
3. Make the functional change
4. Run the test, ensure it passes


## Co-authoring

A human being may have working changes in this repo. Don't overwrite those working changes without asking.
