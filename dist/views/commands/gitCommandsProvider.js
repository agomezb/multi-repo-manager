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
exports.CommandTreeItem = exports.GitCommandsProvider = void 0;
const vscode = __importStar(require("vscode"));
class GitCommandsProvider {
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    commands = [
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
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (element) {
            return Promise.resolve([]);
        }
        return Promise.resolve(this.commands.map(cmd => new CommandTreeItem(cmd)));
    }
}
exports.GitCommandsProvider = GitCommandsProvider;
class CommandTreeItem extends vscode.TreeItem {
    def;
    constructor(def) {
        super(def.label, vscode.TreeItemCollapsibleState.None);
        this.def = def;
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
exports.CommandTreeItem = CommandTreeItem;
//# sourceMappingURL=gitCommandsProvider.js.map