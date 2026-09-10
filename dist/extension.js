"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const gitService_1 = require("./services/gitService");
const outputChannel_1 = require("./services/outputChannel");
const gitProjectExplorerProvider_1 = require("./views/explorer/gitProjectExplorerProvider");
const gitCommandsProvider_1 = require("./views/commands/gitCommandsProvider");
const gitCliViewProvider_1 = require("./views/cli/gitCliViewProvider");
function activate(context) {
    const logger = outputChannel_1.OutputLogger.getInstance();
    const gitService = gitService_1.GitService.getInstance();
    logger.log('Git Project Explorer extension activated.');
    // 1. Providers
    const explorerProvider = new gitProjectExplorerProvider_1.GitProjectExplorerProvider();
    vscode.window.registerTreeDataProvider('gitProjectExplorer.explorer', explorerProvider);
    vscode.commands.executeCommand('setContext', 'gitProjectExplorer.isOnlyUncommitted', false);
    const commandsProvider = new gitCommandsProvider_1.GitCommandsProvider();
    vscode.window.registerTreeDataProvider('gitProjectExplorer.commands', commandsProvider);
    const cliProvider = new gitCliViewProvider_1.GitCliViewProvider(context.extensionUri);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(gitCliViewProvider_1.GitCliViewProvider.viewType, cliProvider, {
        webviewOptions: {
            retainContextWhenHidden: true
        }
    }));
    // 2. Command Registrations
    context.subscriptions.push(vscode.commands.registerCommand('gitProjectExplorer.refresh', async () => {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Window,
            title: 'Git Project Explorer: Scanning repositories...'
        }, async () => {
            const repos = await gitService.discoverRepositories();
            explorerProvider.refresh();
            commandsProvider.refresh();
            cliProvider.updateWebviewRepos();
            vscode.window.setStatusBarMessage(`Git Project Explorer: Found ${repos.length} repositories.`, 4000);
        });
    }), vscode.commands.registerCommand('gitProjectExplorer.showOutput', () => {
        logger.show();
    }), vscode.commands.registerCommand('gitProjectExplorer.showOnlyUncommitted', () => {
        explorerProvider.toggleGlobalOnlyUncommitted();
        vscode.window.setStatusBarMessage('Git Project Explorer: Showing only uncommitted changes.', 3000);
    }), vscode.commands.registerCommand('gitProjectExplorer.showAll', () => {
        explorerProvider.toggleGlobalOnlyUncommitted();
        vscode.window.setStatusBarMessage('Git Project Explorer: Showing all repositories & files.', 3000);
    }), vscode.commands.registerCommand('gitProjectExplorer.toggleRepoShowOnlyUncommitted', (item) => {
        if (item && item.repo) {
            const nowFiltered = explorerProvider.toggleRepoOnlyUncommitted(item.repo.path);
            const msg = nowFiltered
                ? `Git Project Explorer: Showing only uncommitted files in ${item.repo.name}.`
                : `Git Project Explorer: Showing all files in ${item.repo.name}.`;
            vscode.window.setStatusBarMessage(msg, 3000);
        }
    }), vscode.commands.registerCommand('gitProjectExplorer.openInTerminal', (item) => {
        if (item && item.repo) {
            const term = vscode.window.createTerminal({
                name: `Git: ${item.repo.name}`,
                cwd: item.repo.path
            });
            term.show();
        }
    }), vscode.commands.registerCommand('gitProjectExplorer.revealInFileManager', (item) => {
        if (!item)
            return;
        let targetUri;
        if (item instanceof gitProjectExplorerProvider_1.RepoTreeItem) {
            targetUri = item.repo.rootUri;
        }
        else if (item instanceof gitProjectExplorerProvider_1.FileSystemTreeItem) {
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
    }), vscode.commands.registerCommand('gitProjectExplorer.pullAll', async () => {
        await runWithProgress('Pulling all repositories (current branch)...', async () => {
            const results = await gitService.pullAll();
            handleCommandResults('Pull All', results);
        });
    }), vscode.commands.registerCommand('gitProjectExplorer.pullMainAll', async () => {
        await runWithProgress('Pulling from default branch (main/master)...', async () => {
            const results = await gitService.pullMainAll();
            handleCommandResults('Pull from Main', results);
        });
    }), vscode.commands.registerCommand('gitProjectExplorer.pushAll', async () => {
        const confirmation = await vscode.window.showWarningMessage('Are you sure you want to push current branches across ALL repositories?', { modal: true }, 'Yes, Push All');
        if (confirmation !== 'Yes, Push All') {
            return;
        }
        await runWithProgress('Pushing all repositories...', async () => {
            const results = await gitService.pushAll();
            handleCommandResults('Push All', results);
        });
    }), vscode.commands.registerCommand('gitProjectExplorer.statusSummary', async () => {
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
                if (!repo.isClean)
                    dirtyCount++;
                const syncText = `Ahead: ${repo.ahead || 0}, Behind: ${repo.behind || 0}`;
                logger.appendLine(`• [${repo.name}] Branch: ${repo.currentBranch || 'unknown'} | ${statusText} | ${syncText}`);
            }
            logger.appendLine();
            logger.appendLine(`Total: ${repos.length} repositories | ${dirtyCount} with uncommitted changes.`);
            logger.show();
            vscode.window.showInformationMessage(`Git Status: ${repos.length} repos (${dirtyCount} with changes). See Output for details.`);
        });
    }), vscode.commands.registerCommand('gitProjectExplorer.checkoutBranch', async () => {
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
    }), vscode.commands.registerCommand('gitProjectExplorer.stashAll', async () => {
        await runWithProgress('Stashing changes across repositories...', async () => {
            const results = await gitService.stashAll();
            handleCommandResults('Stash All', results);
        });
    }), vscode.commands.registerCommand('gitProjectExplorer.stashPopAll', async () => {
        await runWithProgress('Popping stashes across repositories...', async () => {
            const results = await gitService.stashPopAll();
            handleCommandResults('Stash Pop All', results);
        });
    }), vscode.commands.registerCommand('gitProjectExplorer.runCliCommand', async () => {
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
    }));
    // 3. Workspace folder change listener
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(async () => {
        await gitService.discoverRepositories();
        explorerProvider.refresh();
        commandsProvider.refresh();
        cliProvider.updateWebviewRepos();
    }));
    // Initial scan
    gitService.discoverRepositories().then(() => {
        explorerProvider.refresh();
        commandsProvider.refresh();
        cliProvider.updateWebviewRepos();
    });
}
async function runWithProgress(title, task) {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Git Project Explorer: ${title}`,
        cancellable: false
    }, async () => {
        await task();
    });
}
function handleCommandResults(actionName, results) {
    const failed = results.filter(r => !r.success);
    if (failed.length === 0) {
        vscode.window.showInformationMessage(`✓ ${actionName} finished successfully on all ${results.length} repositories.`);
    }
    else {
        const errorDetails = failed.map(f => f.repoName).join(', ');
        vscode.window.showErrorMessage(`⚠ ${actionName} completed with errors on ${failed.length}/${results.length} repos: ${errorDetails}. Check Output for details.`);
        outputChannel_1.OutputLogger.getInstance().show();
    }
}
function deactivate() {
    outputChannel_1.OutputLogger.getInstance().log('Git Project Explorer extension deactivated.');
}
//# sourceMappingURL=extension.js.map