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
exports.EmptyNoticeTreeItem = exports.FileSystemTreeItem = exports.RepoTreeItem = exports.GitProjectExplorerProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const gitService_1 = require("../../services/gitService");
class GitProjectExplorerProvider {
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    gitService;
    isGlobalOnlyUncommitted = false;
    repoFilterOverrides = new Map();
    constructor() {
        this.gitService = gitService_1.GitService.getInstance();
        this.gitService.onDidChangeRepositories(() => {
            this.refresh();
        });
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    toggleGlobalOnlyUncommitted() {
        this.isGlobalOnlyUncommitted = !this.isGlobalOnlyUncommitted;
        vscode.commands.executeCommand('setContext', 'gitProjectExplorer.isOnlyUncommitted', this.isGlobalOnlyUncommitted);
        this.refresh();
        return this.isGlobalOnlyUncommitted;
    }
    toggleRepoOnlyUncommitted(repoPath) {
        const current = this.isRepoFilteringUncommitted(repoPath);
        const next = !current;
        this.repoFilterOverrides.set(repoPath, next);
        this.refresh();
        return next;
    }
    isRepoFilteringUncommitted(repoPath) {
        if (this.repoFilterOverrides.has(repoPath)) {
            return this.repoFilterOverrides.get(repoPath);
        }
        return this.isGlobalOnlyUncommitted;
    }
    getIsGlobalOnlyUncommitted() {
        return this.isGlobalOnlyUncommitted;
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren(element) {
        if (!element) {
            // Root level: Git Repositories
            let repos = this.gitService.getRepositories();
            if (repos.length === 0) {
                return [new EmptyNoticeTreeItem('No Git repositories found (click Refresh to rescan)')];
            }
            if (this.isGlobalOnlyUncommitted) {
                repos = repos.filter(r => !r.isClean);
                if (repos.length === 0) {
                    return [new EmptyNoticeTreeItem('No repositories with uncommitted changes found')];
                }
            }
            return repos.map(repo => {
                const isFiltered = this.isRepoFilteringUncommitted(repo.path);
                return new RepoTreeItem(repo, isFiltered);
            });
        }
        if (element instanceof EmptyNoticeTreeItem) {
            return [];
        }
        let dirPath;
        let repoPath;
        let isFiltered;
        let uncommittedPaths;
        if (element instanceof RepoTreeItem) {
            dirPath = element.repo.path;
            repoPath = element.repo.path;
            isFiltered = element.isFiltered;
            if (isFiltered) {
                uncommittedPaths = element.repo.uncommittedFiles || await this.gitService.getUncommittedFilePaths(repoPath);
                if (!uncommittedPaths || uncommittedPaths.size === 0) {
                    return [new EmptyNoticeTreeItem('(No uncommitted changes in this repository)')];
                }
            }
        }
        else if (element instanceof FileSystemTreeItem && element.isDirectory) {
            dirPath = element.fsPath;
            repoPath = element.repoPath || element.fsPath;
            isFiltered = !!element.isFiltered;
            uncommittedPaths = element.uncommittedPaths;
        }
        else {
            return [];
        }
        try {
            const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
            const items = [];
            for (const entry of entries) {
                // Skip .git directory and system metadata files
                if (entry.name === '.git' || entry.name === '.DS_Store' || entry.name === 'Thumbs.db') {
                    continue;
                }
                const fullPath = path.join(dirPath, entry.name);
                const isDirectory = entry.isDirectory();
                if (isFiltered && uncommittedPaths) {
                    const relPath = path.normalize(path.relative(repoPath, fullPath));
                    if (isDirectory) {
                        // Check if this directory or any subpath contains an uncommitted file
                        const hasChangedFile = Array.from(uncommittedPaths).some(p => p === relPath || p.startsWith(relPath + path.sep));
                        if (!hasChangedFile) {
                            continue;
                        }
                    }
                    else {
                        // File: only show if in uncommitted list
                        if (!uncommittedPaths.has(relPath)) {
                            continue;
                        }
                    }
                }
                items.push(new FileSystemTreeItem(fullPath, entry.name, isDirectory, repoPath, isFiltered, uncommittedPaths));
            }
            // Sort: Folders first, then alphabetically
            items.sort((a, b) => {
                if (a.isDirectory && !b.isDirectory)
                    return -1;
                if (!a.isDirectory && b.isDirectory)
                    return 1;
                return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
            });
            return items;
        }
        catch (error) {
            return [new EmptyNoticeTreeItem(`Error reading directory: ${error}`)];
        }
    }
}
exports.GitProjectExplorerProvider = GitProjectExplorerProvider;
class RepoTreeItem extends vscode.TreeItem {
    repo;
    isFiltered;
    constructor(repo, isFiltered = false) {
        super(repo.name, vscode.TreeItemCollapsibleState.Collapsed);
        this.repo = repo;
        this.isFiltered = isFiltered;
        this.id = `repo:${repo.path}`;
        this.resourceUri = repo.rootUri;
        this.contextValue = isFiltered ? 'repo-filtered' : 'repo';
        // Badge / Description: current branch and dirty status
        let desc = '';
        if (repo.currentBranch) {
            desc = `[${repo.currentBranch}]`;
        }
        if (!repo.isClean) {
            const changes = (repo.modifiedCount || 0) + (repo.untrackedCount || 0);
            desc += ` *${changes}`;
        }
        if ((repo.ahead || 0) > 0 || (repo.behind || 0) > 0) {
            desc += ` ↑${repo.ahead || 0} ↓${repo.behind || 0}`;
        }
        if (isFiltered) {
            desc += ' (uncommitted only)';
        }
        this.description = desc;
        // Tooltip with detailed repo stats
        const tooltip = new vscode.MarkdownString();
        tooltip.appendMarkdown(`### $(repo) **${repo.name}**\n\n`);
        tooltip.appendMarkdown(`- **Path:** \`${repo.path}\`\n`);
        if (repo.currentBranch) {
            tooltip.appendMarkdown(`- **Branch:** \`${repo.currentBranch}\`\n`);
        }
        if (repo.remoteOriginUrl) {
            tooltip.appendMarkdown(`- **Remote:** \`${repo.remoteOriginUrl}\`\n`);
        }
        tooltip.appendMarkdown(`- **Status:** ${repo.isClean ? 'Clean' : `Modified (${repo.modifiedCount}), Untracked (${repo.untrackedCount})`}\n`);
        if (isFiltered) {
            tooltip.appendMarkdown(`- **Filter:** Show only uncommitted changes (active)\n`);
        }
        if ((repo.ahead || 0) > 0 || (repo.behind || 0) > 0) {
            tooltip.appendMarkdown(`- **Sync:** Ahead: ${repo.ahead}, Behind: ${repo.behind}\n`);
        }
        this.tooltip = tooltip;
        // Icon
        if (!repo.isClean) {
            this.iconPath = new vscode.ThemeIcon('repo', new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'));
        }
        else {
            this.iconPath = new vscode.ThemeIcon('repo');
        }
    }
}
exports.RepoTreeItem = RepoTreeItem;
class FileSystemTreeItem extends vscode.TreeItem {
    fsPath;
    label;
    isDirectory;
    repoPath;
    isFiltered;
    uncommittedPaths;
    constructor(fsPath, label, isDirectory, repoPath, isFiltered, uncommittedPaths) {
        super(label, isDirectory
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None);
        this.fsPath = fsPath;
        this.label = label;
        this.isDirectory = isDirectory;
        this.repoPath = repoPath;
        this.isFiltered = isFiltered;
        this.uncommittedPaths = uncommittedPaths;
        this.id = `fs:${fsPath}`;
        this.resourceUri = vscode.Uri.file(fsPath);
        this.contextValue = isDirectory ? 'folder' : 'file';
        if (!isDirectory) {
            // File click opens editor
            this.command = {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [this.resourceUri]
            };
        }
        else {
            this.iconPath = vscode.ThemeIcon.Folder;
        }
    }
}
exports.FileSystemTreeItem = FileSystemTreeItem;
class EmptyNoticeTreeItem extends vscode.TreeItem {
    constructor(message) {
        super(message, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('info');
        this.contextValue = 'empty_notice';
    }
}
exports.EmptyNoticeTreeItem = EmptyNoticeTreeItem;
//# sourceMappingURL=gitProjectExplorerProvider.js.map