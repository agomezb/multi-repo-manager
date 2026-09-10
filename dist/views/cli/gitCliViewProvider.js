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
exports.GitCliViewProvider = void 0;
const vscode = __importStar(require("vscode"));
const gitService_1 = require("../../services/gitService");
const outputChannel_1 = require("../../services/outputChannel");
class GitCliViewProvider {
    extensionUri;
    static viewType = 'gitProjectExplorer.cli';
    view;
    gitService;
    logger;
    commandHistory = [
        'git status -s',
        'git branch -a',
        'git log -1 --oneline',
        'git remote -v'
    ];
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
        this.logger = outputChannel_1.OutputLogger.getInstance();
        this.gitService = gitService_1.GitService.getInstance();
        this.gitService.onDidChangeRepositories(() => {
            this.updateWebviewRepos();
        });
    }
    resolveWebviewView(webviewView, context, _token) {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.extensionUri, 'media'),
                this.extensionUri
            ]
        };
        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
        // Refresh repos whenever view becomes visible
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this.updateWebviewRepos();
            }
        });
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'ready': {
                    this.logger.log('[CLI Webview] Ready signal received.');
                    await this.updateWebviewRepos();
                    break;
                }
                case 'execute': {
                    const command = data.command?.trim();
                    const targetPaths = data.selectedRepoPaths;
                    if (!command) {
                        vscode.window.showWarningMessage('Please enter a command to execute.');
                        return;
                    }
                    if (!this.commandHistory.includes(command)) {
                        this.commandHistory.unshift(command);
                        if (this.commandHistory.length > 20) {
                            this.commandHistory.pop();
                        }
                    }
                    await this.executeCommandInWebview(command, targetPaths);
                    break;
                }
                case 'refreshRepos': {
                    this.logger.log('[CLI Webview] Refresh requested from webview.');
                    await this.gitService.discoverRepositories();
                    await this.updateWebviewRepos();
                    break;
                }
                case 'showOutputChannel': {
                    this.logger.show();
                    break;
                }
                case 'clientError': {
                    this.logger.log(`[CLI Webview Client Error] ${data.error}`);
                    break;
                }
            }
        });
        // Send initial list of repos with fallbacks
        setTimeout(() => {
            this.updateWebviewRepos();
        }, 150);
    }
    async updateWebviewRepos() {
        if (!this.view)
            return;
        let repos = this.gitService.getRepositories();
        if (repos.length === 0) {
            repos = await this.gitService.discoverRepositories();
        }
        this.logger.log(`[CLI Webview] Syncing ${repos.length} repository/repositories with UI.`);
        this.view.webview.postMessage({
            type: 'setRepositories',
            repositories: repos.map(r => ({
                name: r.name,
                path: r.path,
                branch: r.currentBranch || 'unknown',
                isClean: r.isClean
            })),
            history: this.commandHistory
        });
    }
    async executeCommandInWebview(command, targetPaths) {
        if (!this.view)
            return;
        let repos = this.gitService.getRepositories();
        if (repos.length === 0) {
            repos = await this.gitService.discoverRepositories();
        }
        if (targetPaths && targetPaths.length > 0) {
            repos = repos.filter(r => targetPaths.includes(r.path));
        }
        if (repos.length === 0) {
            this.view.webview.postMessage({
                type: 'executionFinish',
                results: []
            });
            this.view.webview.postMessage({
                type: 'log',
                text: '⚠ No repositories selected or found in workspace. Open a folder with Git repositories.',
                isError: true
            });
            return;
        }
        this.view.webview.postMessage({
            type: 'executionStart',
            command,
            repoCount: repos.length
        });
        try {
            const results = await this.gitService.executeCommandOnRepositories(command, repos);
            this.view.webview.postMessage({
                type: 'executionFinish',
                results: results.map(r => ({
                    repoName: r.repoName,
                    success: r.success,
                    stdout: r.stdout,
                    stderr: r.stderr,
                    durationMs: r.durationMs
                }))
            });
        }
        catch (err) {
            this.view.webview.postMessage({
                type: 'executionFinish',
                results: []
            });
            this.view.webview.postMessage({
                type: 'log',
                text: `Error executing command: ${err?.message || err}`,
                isError: true
            });
        }
    }
    getNonce() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
    getHtmlForWebview(webview) {
        const nonce = this.getNonce();
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'cli.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'cli.css'));
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource}; font-src ${webview.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Multi-Repo CLI</title>
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <div class="command-box">
    <div class="section-title">
      <span>Command to Execute</span>
    </div>
    <div class="input-row">
      <input type="text" id="cmdInput" placeholder="e.g. git status -s, git branch, npm test" value="git status -s" />
      <button id="runBtn">Run</button>
    </div>
    <div class="chips-container" id="chipsContainer">
      <span class="chip" data-cmd="git status -s">status -s</span>
      <span class="chip" data-cmd="git branch -a">branches</span>
      <span class="chip" data-cmd="git log -1 --oneline">last commit</span>
      <span class="chip" data-cmd="git remote -v">remotes</span>
      <span class="chip" data-cmd="git fetch">fetch</span>
    </div>
  </div>

  <div class="section-title">
    <span>Target Repositories</span>
    <div>
      <button class="secondary" id="selectAllBtn">Select All</button>
      <button class="secondary" id="deselectAllBtn">Deselect All</button>
    </div>
  </div>
  <div class="repo-selector" id="repoList">
    <div style="opacity: 0.6; font-size: 11px;">Scanning for repositories...</div>
  </div>

  <div class="console-header">
    <div class="section-title" style="margin: 0;">Console Output</div>
    <div>
      <button class="secondary" id="clearBtn">Clear</button>
    </div>
  </div>
  <div class="console-output" id="output">Ready. Type a command or click a chip above and click Run to execute across repositories.</div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}
exports.GitCliViewProvider = GitCliViewProvider;
//# sourceMappingURL=gitCliViewProvider.js.map