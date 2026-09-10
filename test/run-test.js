const Module = require('module');

// Mock VS Code API
const mockVscode = {
  window: {
    createOutputChannel: (name) => ({
      append: (txt) => {},
      appendLine: (line) => {},
      clear: () => {},
      show: () => {}
    }),
    showInformationMessage: () => Promise.resolve(),
    showErrorMessage: () => Promise.resolve(),
    showWarningMessage: () => Promise.resolve(),
    withProgress: (options, task) => task({ report: () => {} }),
    showInputBox: () => Promise.resolve('test-branch'),
    createTerminal: (opts) => ({ show: () => {} }),
    registerTreeDataProvider: () => ({ dispose: () => {} }),
    registerWebviewViewProvider: () => ({ dispose: () => {} })
  },
  workspace: {
    workspaceFolders: [],
    getConfiguration: () => ({
      get: (key, defaultValue) => defaultValue
    }),
    onDidChangeWorkspaceFolders: () => ({ dispose: () => {} })
  },
  commands: {
    registerCommand: () => ({ dispose: () => {} }),
    executeCommand: () => Promise.resolve()
  },
  Uri: {
    file: (path) => ({ fsPath: path, path, scheme: 'file' })
  },
  EventEmitter: class {
    constructor() {
      this.listeners = [];
      this.event = (listener) => {
        this.listeners.push(listener);
        return { dispose: () => {} };
      };
    }
    fire(data) {
      this.listeners.forEach(l => l(data));
    }
  },
  ThemeIcon: class {
    constructor(id, color) {
      this.id = id;
      this.color = color;
    }
    static Folder = new this('folder');
    static File = new this('file');
  },
  ThemeColor: class {
    constructor(id) {
      this.id = id;
    }
  },
  TreeItem: class {
    constructor(label, collapsibleState) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  },
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2
  },
  ProgressLocation: {
    Notification: 15,
    Window: 10
  },
  MarkdownString: class {
    constructor() {
      this.value = '';
    }
    appendMarkdown(txt) {
      this.value += txt;
    }
  },
  extensions: {
    getExtension: () => undefined
  }
};

// Intercept require('vscode')
const originalRequire = Module.prototype.require;
Module.prototype.require = function (path) {
  if (path === 'vscode') {
    return mockVscode;
  }
  return originalRequire.apply(this, arguments);
};

console.log('✓ Mock VS Code environment loaded.');
