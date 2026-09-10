import * as vscode from 'vscode';
import { GitService } from '../../services/gitService';
import { OutputLogger } from '../../services/outputChannel';

export interface CommandDefinition {
  id: string;
  commandId: string;
  label: string;
  description: string;
  icon: string;
  tooltip: string;
}

export class GitCommandsProvider implements vscode.TreeDataProvider<CommandTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<CommandTreeItem | undefined | null | void> =
    new vscode.EventEmitter<CommandTreeItem | undefined | null | void>();
  public readonly onDidChangeTreeData: vscode.Event<CommandTreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private commands: CommandDefinition[] = [
    {
      id: 'fetch',
      commandId: 'gitProjectExplorer.fetchAll',
      label: 'Fetch All Repositories',
      description: 'git fetch --all --prune',
      icon: 'sync',
      tooltip: 'Fetch all remotes and prune deleted branches across all detected repositories.'
    },
    {
      id: 'pull',
      commandId: 'gitProjectExplorer.pullAll',
      label: 'Pull All (Current Branch)',
      description: 'git pull',
      icon: 'cloud-download',
      tooltip: 'Pull changes on the current active branch across all repositories.'
    },
    {
      id: 'pullMain',
      commandId: 'gitProjectExplorer.pullMainAll',
      label: 'Pull from Main / Master',
      description: 'git pull origin main/master',
      icon: 'repo-pull',
      tooltip: 'Pull changes from the default primary branch (main/master) across all repositories.'
    },
    {
      id: 'push',
      commandId: 'gitProjectExplorer.pushAll',
      label: 'Push All Repositories',
      description: 'git push',
      icon: 'cloud-upload',
      tooltip: 'Push committed changes on current branches across all repositories.'
    },
    {
      id: 'status',
      commandId: 'gitProjectExplorer.statusSummary',
      label: 'Status Summary',
      description: 'git status --porcelain',
      icon: 'git-compare',
      tooltip: 'Show a consolidated status report of all repositories.'
    },
    {
      id: 'checkout',
      commandId: 'gitProjectExplorer.checkoutBranch',
      label: 'Checkout / Switch Branch',
      description: 'git checkout <branch>',
      icon: 'git-branch',
      tooltip: 'Switch to a specific branch across all repositories.'
    },
    {
      id: 'stash',
      commandId: 'gitProjectExplorer.stashAll',
      label: 'Stash All Repositories',
      description: 'git stash',
      icon: 'archive',
      tooltip: 'Stash dirty/uncommitted changes across all repositories.'
    },
    {
      id: 'stashPop',
      commandId: 'gitProjectExplorer.stashPopAll',
      label: 'Stash Pop All',
      description: 'git stash pop',
      icon: 'unarchive',
      tooltip: 'Reapply stashed changes across all repositories.'
    }
  ];

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(element: CommandTreeItem): vscode.TreeItem {
    return element;
  }

  public getChildren(element?: CommandTreeItem): Thenable<CommandTreeItem[]> {
    if (element) {
      return Promise.resolve([]);
    }
    return Promise.resolve(this.commands.map(cmd => new CommandTreeItem(cmd)));
  }
}

export class CommandTreeItem extends vscode.TreeItem {
  constructor(public readonly def: CommandDefinition) {
    super(def.label, vscode.TreeItemCollapsibleState.None);

    this.id = `cmd:${def.id}`;
    this.description = def.description;
    this.tooltip = `${def.label}\n${def.tooltip}\nCommand: ${def.description}`;
    this.iconPath = new vscode.ThemeIcon(def.icon);
    this.contextValue = 'gitCommand';

    this.command = {
      command: def.commandId,
      title: def.label
    };
  }
}
