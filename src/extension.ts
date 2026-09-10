import * as vscode from 'vscode';
import { GitService } from './services/gitService';
import { OutputLogger } from './services/outputChannel';
import { GitProjectExplorerProvider, RepoTreeItem, FileSystemTreeItem } from './views/explorer/gitProjectExplorerProvider';
import { GitCommandsProvider } from './views/commands/gitCommandsProvider';
import { GitCliViewProvider } from './views/cli/gitCliViewProvider';

export function activate(context: vscode.ExtensionContext) {
  const logger = OutputLogger.getInstance();
  const gitService = GitService.getInstance();

  logger.log('Git Project Explorer extension activated.');

  // 1. Providers
  const explorerProvider = new GitProjectExplorerProvider();
  vscode.window.registerTreeDataProvider('gitProjectExplorer.explorer', explorerProvider);
  vscode.commands.executeCommand('setContext', 'gitProjectExplorer.isOnlyUncommitted', false);

  const commandsProvider = new GitCommandsProvider();
  vscode.window.registerTreeDataProvider('gitProjectExplorer.commands', commandsProvider);

  const cliProvider = new GitCliViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(GitCliViewProvider.viewType, cliProvider, {
      webviewOptions: {
        retainContextWhenHidden: true
      }
    })
  );

  // 2. Command Registrations
  context.subscriptions.push(
    vscode.commands.registerCommand('gitProjectExplorer.refresh', async () => {
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Window,
          title: 'Git Project Explorer: Scanning repositories...'
        },
        async () => {
          const repos = await gitService.discoverRepositories();
          explorerProvider.refresh();
          commandsProvider.refresh();
          cliProvider.updateWebviewRepos();
          vscode.window.setStatusBarMessage(`Git Project Explorer: Found ${repos.length} repositories.`, 4000);
        }
      );
    }),

    vscode.commands.registerCommand('gitProjectExplorer.showOutput', () => {
      logger.show();
    }),

    vscode.commands.registerCommand('gitProjectExplorer.showOnlyUncommitted', () => {
      explorerProvider.toggleGlobalOnlyUncommitted();
      vscode.window.setStatusBarMessage('Git Project Explorer: Showing only uncommitted changes.', 3000);
    }),

    vscode.commands.registerCommand('gitProjectExplorer.showAll', () => {
      explorerProvider.toggleGlobalOnlyUncommitted();
      vscode.window.setStatusBarMessage('Git Project Explorer: Showing all repositories & files.', 3000);
    }),

    vscode.commands.registerCommand('gitProjectExplorer.toggleRepoShowOnlyUncommitted', (item?: RepoTreeItem) => {
      if (item && item.repo) {
        const nowFiltered = explorerProvider.toggleRepoOnlyUncommitted(item.repo.path);
        const msg = nowFiltered
          ? `Git Project Explorer: Showing only uncommitted files in ${item.repo.name}.`
          : `Git Project Explorer: Showing all files in ${item.repo.name}.`;
        vscode.window.setStatusBarMessage(msg, 3000);
      }
    }),

    vscode.commands.registerCommand('gitProjectExplorer.openInTerminal', (item?: RepoTreeItem) => {
      if (item && item.repo) {
        const term = vscode.window.createTerminal({
          name: `Git: ${item.repo.name}`,
          cwd: item.repo.path
        });
        term.show();
      }
    }),

    vscode.commands.registerCommand('gitProjectExplorer.revealInFileManager', (item?: RepoTreeItem | FileSystemTreeItem) => {
      if (!item) return;
      let targetUri: vscode.Uri | undefined;
      if (item instanceof RepoTreeItem) {
        targetUri = item.repo.rootUri;
      } else if (item instanceof FileSystemTreeItem) {
        targetUri = vscode.Uri.file(item.fsPath);
      }
      if (targetUri) {
        vscode.commands.executeCommand('revealFileInOS', targetUri);
      }
    }),

    // Multi-repo Git Operations with Progress Bar
    vscode.commands.registerCommand('gitProjectExplorer.fetchAll', async () => {
      await runWithProgress('Fetching all repositories...', async () => {
        const results = await gitService.fetchAll();
        handleCommandResults('Fetch All', results);
      });
    }),

    vscode.commands.registerCommand('gitProjectExplorer.pullAll', async () => {
      await runWithProgress('Pulling all repositories (current branch)...', async () => {
        const results = await gitService.pullAll();
        handleCommandResults('Pull All', results);
      });
    }),

    vscode.commands.registerCommand('gitProjectExplorer.pullMainAll', async () => {
      await runWithProgress('Pulling from default branch (main/master)...', async () => {
        const results = await gitService.pullMainAll();
        handleCommandResults('Pull from Main', results);
      });
    }),

    vscode.commands.registerCommand('gitProjectExplorer.pushAll', async () => {
      const confirmation = await vscode.window.showWarningMessage(
        'Are you sure you want to push current branches across ALL repositories?',
        { modal: true },
        'Yes, Push All'
      );
      if (confirmation !== 'Yes, Push All') {
        return;
      }

      await runWithProgress('Pushing all repositories...', async () => {
        const results = await gitService.pushAll();
        handleCommandResults('Push All', results);
      });
    }),

    vscode.commands.registerCommand('gitProjectExplorer.statusSummary', async () => {
      await runWithProgress('Checking status across repositories...', async () => {
        const repos = gitService.getRepositories();
        if (repos.length === 0) {
          vscode.window.showInformationMessage('No Git repositories found in workspace.');
          return;
        }

        logger.logHeader('Git Status Summary across Workspace');
        let dirtyCount = 0;

        for (const repo of repos) {
          const statusText = repo.isClean
            ? 'Clean'
            : `DIRTY (${repo.modifiedCount || 0} modified, ${repo.untrackedCount || 0} untracked)`;
          if (!repo.isClean) dirtyCount++;

          const syncText = `Ahead: ${repo.ahead || 0}, Behind: ${repo.behind || 0}`;
          logger.appendLine(`• [${repo.name}] Branch: ${repo.currentBranch || 'unknown'} | ${statusText} | ${syncText}`);
        }

        logger.appendLine();
        logger.appendLine(`Total: ${repos.length} repositories | ${dirtyCount} with uncommitted changes.`);
        logger.show();

        vscode.window.showInformationMessage(
          `Git Status: ${repos.length} repos (${dirtyCount} with changes). See Output for details.`
        );
      });
    }),

    vscode.commands.registerCommand('gitProjectExplorer.checkoutBranch', async () => {
      const repos = gitService.getRepositories();
      if (repos.length === 0) {
        vscode.window.showInformationMessage('No Git repositories found.');
        return;
      }

      const branchName = await vscode.window.showInputBox({
        prompt: 'Enter branch name to checkout across all repositories',
        placeHolder: 'e.g. main, develop, feature/my-feature'
      });

      if (!branchName || !branchName.trim()) {
        return;
      }

      await runWithProgress(`Switching to branch '${branchName}'...`, async () => {
        const results = await gitService.checkoutBranchAll(branchName.trim());
        handleCommandResults(`Checkout '${branchName}'`, results);
      });
    }),

    vscode.commands.registerCommand('gitProjectExplorer.stashAll', async () => {
      await runWithProgress('Stashing changes across repositories...', async () => {
        const results = await gitService.stashAll();
        handleCommandResults('Stash All', results);
      });
    }),

    vscode.commands.registerCommand('gitProjectExplorer.stashPopAll', async () => {
      await runWithProgress('Popping stashes across repositories...', async () => {
        const results = await gitService.stashPopAll();
        handleCommandResults('Stash Pop All', results);
      });
    }),

    vscode.commands.registerCommand('gitProjectExplorer.runCliCommand', async () => {
      const repos = gitService.getRepositories();
      if (repos.length === 0) {
        vscode.window.showInformationMessage('No Git repositories found.');
        return;
      }

      const cmd = await vscode.window.showInputBox({
        prompt: `Execute command on ${repos.length} repositories`,
        placeHolder: 'e.g. git status -s, git log -1, npm test'
      });

      if (!cmd || !cmd.trim()) {
        return;
      }

      logger.show();
      await runWithProgress(`Running "${cmd}" on ${repos.length} repositories...`, async () => {
        const results = await gitService.executeCommandOnRepositories(cmd.trim());
        handleCommandResults(`CLI: ${cmd}`, results);
      });
    })
  );

  // 3. Workspace folder change listener
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      await gitService.discoverRepositories();
      explorerProvider.refresh();
      commandsProvider.refresh();
      cliProvider.updateWebviewRepos();
    })
  );

  // Initial scan
  gitService.discoverRepositories().then(() => {
    explorerProvider.refresh();
    commandsProvider.refresh();
    cliProvider.updateWebviewRepos();
  });
}

async function runWithProgress(title: string, task: () => Promise<void>): Promise<void> {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Git Project Explorer: ${title}`,
      cancellable: false
    },
    async () => {
      await task();
    }
  );
}

function handleCommandResults(
  actionName: string,
  results: { repoName: string; success: boolean; stderr?: string }[]
): void {
  const failed = results.filter(r => !r.success);
  if (failed.length === 0) {
    vscode.window.showInformationMessage(
      `✓ ${actionName} finished successfully on all ${results.length} repositories.`
    );
  } else {
    const errorDetails = failed.map(f => f.repoName).join(', ');
    vscode.window.showErrorMessage(
      `⚠ ${actionName} completed with errors on ${failed.length}/${results.length} repos: ${errorDetails}. Check Output for details.`
    );
    OutputLogger.getInstance().show();
  }
}

export function deactivate() {
  OutputLogger.getInstance().log('Git Project Explorer extension deactivated.');
}
