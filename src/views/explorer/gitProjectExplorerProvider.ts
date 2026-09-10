import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { GitRepo } from '../../models/types';
import { GitService } from '../../services/gitService';

export type GitTreeElement = RepoTreeItem | FileSystemTreeItem | EmptyNoticeTreeItem;

export class GitProjectExplorerProvider implements vscode.TreeDataProvider<GitTreeElement> {
  private _onDidChangeTreeData: vscode.EventEmitter<GitTreeElement | undefined | null | void> =
    new vscode.EventEmitter<GitTreeElement | undefined | null | void>();
  public readonly onDidChangeTreeData: vscode.Event<GitTreeElement | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private gitService: GitService;
  private isGlobalOnlyUncommitted: boolean = false;
  private repoFilterOverrides: Map<string, boolean> = new Map();

  constructor() {
    this.gitService = GitService.getInstance();
    this.gitService.onDidChangeRepositories(() => {
      this.refresh();
    });
  }

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  public toggleGlobalOnlyUncommitted(): boolean {
    this.isGlobalOnlyUncommitted = !this.isGlobalOnlyUncommitted;
    vscode.commands.executeCommand('setContext', 'gitProjectExplorer.isOnlyUncommitted', this.isGlobalOnlyUncommitted);
    this.refresh();
    return this.isGlobalOnlyUncommitted;
  }

  public toggleRepoOnlyUncommitted(repoPath: string): boolean {
    const current = this.isRepoFilteringUncommitted(repoPath);
    const next = !current;
    this.repoFilterOverrides.set(repoPath, next);
    this.refresh();
    return next;
  }

  public isRepoFilteringUncommitted(repoPath: string): boolean {
    if (this.repoFilterOverrides.has(repoPath)) {
      return this.repoFilterOverrides.get(repoPath)!;
    }
    return this.isGlobalOnlyUncommitted;
  }

  public getIsGlobalOnlyUncommitted(): boolean {
    return this.isGlobalOnlyUncommitted;
  }

  public getTreeItem(element: GitTreeElement): vscode.TreeItem {
    return element;
  }

  public async getChildren(element?: GitTreeElement): Promise<GitTreeElement[]> {
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

    let dirPath: string;
    let repoPath: string;
    let isFiltered: boolean;
    let uncommittedPaths: Set<string> | undefined;

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
    } else if (element instanceof FileSystemTreeItem && element.isDirectory) {
      dirPath = element.fsPath;
      repoPath = element.repoPath || element.fsPath;
      isFiltered = !!element.isFiltered;
      uncommittedPaths = element.uncommittedPaths;
    } else {
      return [];
    }

    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      const items: FileSystemTreeItem[] = [];

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
            const hasChangedFile = Array.from(uncommittedPaths).some(
              p => p === relPath || p.startsWith(relPath + path.sep)
            );
            if (!hasChangedFile) {
              continue;
            }
          } else {
            // File: only show if in uncommitted list
            if (!uncommittedPaths.has(relPath)) {
              continue;
            }
          }
        }

        items.push(
          new FileSystemTreeItem(
            fullPath,
            entry.name,
            isDirectory,
            repoPath,
            isFiltered,
            uncommittedPaths
          )
        );
      }

      // Sort: Folders first, then alphabetically
      items.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
      });

      return items;
    } catch (error) {
      return [new EmptyNoticeTreeItem(`Error reading directory: ${error}`)];
    }
  }
}

export class RepoTreeItem extends vscode.TreeItem {
  constructor(
    public readonly repo: GitRepo,
    public readonly isFiltered: boolean = false
  ) {
    super(repo.name, vscode.TreeItemCollapsibleState.Collapsed);

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
    } else {
      this.iconPath = new vscode.ThemeIcon('repo');
    }
  }
}

export class FileSystemTreeItem extends vscode.TreeItem {
  constructor(
    public readonly fsPath: string,
    public readonly label: string,
    public readonly isDirectory: boolean,
    public readonly repoPath?: string,
    public readonly isFiltered?: boolean,
    public readonly uncommittedPaths?: Set<string>
  ) {
    super(
      label,
      isDirectory
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );

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
    } else {
      this.iconPath = vscode.ThemeIcon.Folder;
    }
  }
}

export class EmptyNoticeTreeItem extends vscode.TreeItem {
  constructor(message: string) {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('info');
    this.contextValue = 'empty_notice';
  }
}
