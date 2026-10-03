# Git Project Explorer

Manage every Git repository in your workspace from one place. Git Project Explorer is built for multi-repo workspaces: it finds all the repositories under your open folders and lets you browse, filter, and run Git commands across all of them at once.

It adds a **Git Project Explorer** container to the Activity Bar with three views:

- **Explorer**: one tree per repository, with branch, changes, and ahead/behind status.
- **Commands**: one-click Git operations (fetch, pull, push, checkout, stash) across all repositories.
- **CLI**: run any shell or Git command on all repositories, or only on the ones you pick.

## Features

### Automatic repository detection

- Scans your workspace folders for Git repositories, up to a configurable depth.
- Skips heavy folders such as `node_modules`, `dist`, `build`, `target`, `.venv`, and `vendor`.
- Uses VS Code's built-in Git extension when it is available.
- Shows each repository's current branch, whether it has uncommitted changes, and how many commits it is ahead of or behind its upstream.

### Explorer

- Each repository is a root node that expands into its folders and files. Click a file to open it.
- **Show Only Uncommitted** (view title bar) filters the tree down to repositories with uncommitted changes, and within them to the modified and untracked files only. Click again to show everything.
- Each repository also has its own inline filter button, so you can focus on the changes in one repository without filtering the others.
- Inline actions on each repository:
  - **Open in Terminal** opens an integrated terminal at the repository root.
  - **More Actions...** runs pull, pull from main, push, fetch, checkout, stash, stash pop, or status on that repository alone.
- **Reveal in File Manager** (right-click) shows a repository, folder, or file in Finder or File Explorer.

### Commands

Run Git operations on every repository at once, with a progress notification and a summary of the results:

| Command | What it runs in each repository |
|---|---|
| Fetch All | `git fetch --all --prune` |
| Pull All (Current Branch) | `git pull` |
| Pull from Main/Master | `git pull origin <primary branch>`, merging the first existing branch from `gitProjectExplorer.defaultBranchNames` into the current branch |
| Push All | `git push`, after a confirmation dialog |
| Status Summary | A combined summary of uncommitted changes |
| Checkout Branch | `git checkout <branch>`, for a branch name you enter |
| Stash All | `git stash` |
| Stash Pop | `git stash pop` |

All commands are also available from the Command Palette under the **Git Project Explorer** category.

### CLI

- Run any command (for example `git status -s`, `git branch -a`, or `npm test`) across repositories.
- Use the checkboxes to run on all repositories or only the selected ones.
- Shortcut chips for common commands, plus a history of recent commands.
- Live `stdout` and `stderr` output, labeled by repository.

## Requirements

- VS Code 1.85 or later.
- Git installed and available on your `PATH`.

## Getting started

1. Open a folder (or a multi-root workspace) that contains several Git repositories.
2. Click the **Git Project Explorer** icon in the Activity Bar.
3. Your repositories appear in the **Explorer** view. Use **Refresh** in the view title bar if you add or remove repositories.

Every Git command the extension runs is logged. Use **Show Multi-Repo Output Log** in the view title bar to see the full output.

## Extension settings

| Setting | Default | Description |
|---|---|---|
| `gitProjectExplorer.searchDepth` | `4` | Maximum folder depth to search for Git repositories. |
| `gitProjectExplorer.excludePatterns` | `node_modules`, `.cache`, `dist`, `build`, `target`, `.venv`, `vendor` | Glob patterns to skip while scanning. |
| `gitProjectExplorer.defaultBranchNames` | `["main", "master", "develop"]` | Branch names tried, in order, as the primary branch for **Pull from Main/Master**. |

## Release notes

See the [CHANGELOG](CHANGELOG.md).

## Contributing

Bug reports and pull requests are welcome on [GitHub](https://github.com/agomezb/multi-repo-manager). See [CONTRIBUTING](CONTRIBUTING.md) to set up a development environment.

## License

[MIT](LICENSE)
