# Contributing to Git Project Explorer

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- [pnpm](https://pnpm.io/) 10. The easiest way to get it is through Corepack, which ships with Node.js:

  ```bash
  corepack enable
  ```

- [Visual Studio Code](https://code.visualstudio.com/)

## Setup

```bash
pnpm install
pnpm run compile
```

Use `pnpm run watch` instead of `compile` to rebuild on every change.

## Running the extension

1. Open this folder in VS Code.
2. Press **F5**, or pick **Run Extension** in the *Run and Debug* view. The `pnpm: compile` task runs first.
3. A new **Extension Development Host** window opens. Open a folder that contains several Git repositories in it.
4. Click the **Git Project Explorer** icon in the Activity Bar.

To pick up code changes, recompile and reload the Extension Development Host window (**Developer: Reload Window**).

## Tests

```bash
pnpm test
```

## Packaging and publishing

The extension is published with [`@vscode/vsce`](https://github.com/microsoft/vscode-vsce). Always pass `--no-dependencies`: `vsce` resolves dependencies with npm, which does not work with pnpm, and the extension has no runtime dependencies.

```bash
npx @vscode/vsce package --no-dependencies   # builds git-project-explorer-<version>.vsix
npx @vscode/vsce publish --no-dependencies   # publishes to the Marketplace
```

`.vscodeignore` controls which files go into the package. The `vscode:prepublish` script compiles the extension before packaging.

## Project structure

```
multi-repo-manager/
├── .vscode/                     # Launch and build task configuration
├── media/                       # Webview assets for the CLI view
├── resources/
│   ├── git-project-explorer.svg # Activity Bar icon
│   ├── icon.png                 # Marketplace icon
│   └── icon.svg                 # Source for icon.png
├── src/
│   ├── extension.ts             # Entry point and command registration
│   ├── models/
│   │   └── types.ts             # Shared TypeScript types
│   ├── services/
│   │   ├── gitService.ts        # Repository scanning and Git command runner
│   │   └── outputChannel.ts     # "Git Project Explorer" output channel
│   └── views/
│       ├── explorer/            # TreeDataProvider for the Explorer view
│       ├── commands/            # TreeDataProvider for the Commands view
│       └── cli/                 # WebviewViewProvider for the CLI view
├── test/                        # Test script and runner
├── package.json
└── tsconfig.json
```
