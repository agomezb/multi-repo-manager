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
exports.GitService = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
const outputChannel_1 = require("./outputChannel");
class GitService {
    static instance;
    repositories = [];
    logger;
    _onDidChangeRepositories = new vscode.EventEmitter();
    onDidChangeRepositories = this._onDidChangeRepositories.event;
    constructor() {
        this.logger = outputChannel_1.OutputLogger.getInstance();
    }
    static getInstance() {
        if (!GitService.instance) {
            GitService.instance = new GitService();
        }
        return GitService.instance;
    }
    getRepositories() {
        return this.repositories;
    }
    /**
     * Discovers all git repositories inside open workspace folders.
     */
    async discoverRepositories() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            this.repositories = [];
            this._onDidChangeRepositories.fire(this.repositories);
            return [];
        }
        const config = vscode.workspace.getConfiguration('gitProjectExplorer');
        const maxDepth = config.get('searchDepth', 4);
        const excludePatterns = config.get('excludePatterns', [
            '**/node_modules/**',
            '**/.cache/**',
            '**/dist/**',
            '**/build/**',
            '**/target/**',
            '**/.venv/**',
            '**/vendor/**'
        ]);
        const foundRepoPaths = new Set();
        // 1. Check if VS Code's built-in Git extension has already opened any repos
        try {
            const gitExtension = vscode.extensions.getExtension('vscode.git');
            if (gitExtension) {
                const gitApi = gitExtension.exports?.getAPI ? gitExtension.exports.getAPI(1) : null;
                if (gitApi && gitApi.repositories) {
                    for (const repo of gitApi.repositories) {
                        const rootPath = repo.rootUri?.fsPath;
                        if (rootPath) {
                            foundRepoPaths.add(path.normalize(rootPath));
                        }
                    }
                }
            }
        }
        catch {
            // VS Code git extension might not be active or available, proceed to manual scan
        }
        // 2. Scan workspace folders on disk
        for (const folder of workspaceFolders) {
            const folderPath = folder.uri.fsPath;
            await this.scanDirectoryForGit(folderPath, 0, maxDepth, excludePatterns, foundRepoPaths);
        }
        // 3. Build GitRepo metadata for each discovered path
        const repoList = [];
        for (const repoPath of foundRepoPaths) {
            const repoName = path.basename(repoPath);
            const repoInfo = {
                name: repoName,
                path: repoPath,
                rootUri: vscode.Uri.file(repoPath),
                isClean: true,
                ahead: 0,
                behind: 0,
                modifiedCount: 0,
                untrackedCount: 0
            };
            try {
                await this.populateGitInfo(repoInfo);
            }
            catch (err) {
                this.logger.log(`Warning: Failed to read status for ${repoName}: ${err}`);
            }
            repoList.push(repoInfo);
        }
        // Sort alphabetically by name
        repoList.sort((a, b) => a.name.localeCompare(b.name));
        this.repositories = repoList;
        this._onDidChangeRepositories.fire(this.repositories);
        return this.repositories;
    }
    async scanDirectoryForGit(dirPath, currentDepth, maxDepth, excludePatterns, foundRepoPaths) {
        if (currentDepth > maxDepth) {
            return;
        }
        // Check if this directory itself contains a .git folder or file (e.g. submodule/worktree)
        const gitEntryPath = path.join(dirPath, '.git');
        try {
            const gitStat = await fs.promises.stat(gitEntryPath);
            if (gitStat.isDirectory() || gitStat.isFile()) {
                foundRepoPaths.add(path.normalize(dirPath));
                // Once a git repo is found, don't dive deeper into it looking for more unless submodules
                // We still check subdirectories if depth allows, but avoid .git itself
            }
        }
        catch {
            // No .git here, continue
        }
        let entries;
        try {
            entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            if (!entry.isDirectory()) {
                continue;
            }
            const entryName = entry.name;
            // Skip .git and common bulky directories
            if (entryName === '.git' || entryName === 'node_modules' || entryName.startsWith('.git-')) {
                continue;
            }
            const fullSubPath = path.join(dirPath, entryName);
            // Check exclude patterns
            const isExcluded = excludePatterns.some(pat => {
                const cleanPat = pat.replace(/\*\*/g, '').replace(/\*/g, '');
                return fullSubPath.includes(cleanPat);
            });
            if (!isExcluded) {
                await this.scanDirectoryForGit(fullSubPath, currentDepth + 1, maxDepth, excludePatterns, foundRepoPaths);
            }
        }
    }
    /**
     * Fetches Git branch and status details for a repository.
     */
    async populateGitInfo(repo) {
        // Current branch
        const branchRes = await this.runRawCommand(repo.path, 'git rev-parse --abbrev-ref HEAD');
        if (branchRes.success) {
            repo.currentBranch = branchRes.stdout.trim();
        }
        // Remote origin url
        const remoteRes = await this.runRawCommand(repo.path, 'git remote get-url origin');
        if (remoteRes.success) {
            repo.remoteOriginUrl = remoteRes.stdout.trim();
        }
        // Git status porcelain with branch tracking
        const statusRes = await this.runRawCommand(repo.path, 'git status --porcelain=v1 -uall -b');
        if (statusRes.success) {
            const lines = statusRes.stdout.split('\n');
            let modified = 0;
            let untracked = 0;
            const uncommittedFiles = new Set();
            for (const line of lines) {
                if (!line.trim())
                    continue;
                if (line.startsWith('##')) {
                    // Parse ahead/behind, e.g. "## main...origin/main [ahead 1, behind 2]"
                    const aheadMatch = line.match(/ahead (\d+)/);
                    const behindMatch = line.match(/behind (\d+)/);
                    repo.ahead = aheadMatch ? parseInt(aheadMatch[1], 10) : 0;
                    repo.behind = behindMatch ? parseInt(behindMatch[1], 10) : 0;
                }
                else {
                    let filePath = line.slice(3).trim();
                    if (filePath.includes(' -> ')) {
                        filePath = filePath.split(' -> ').pop().trim();
                    }
                    if (filePath.startsWith('"') && filePath.endsWith('"')) {
                        filePath = filePath.slice(1, -1);
                    }
                    uncommittedFiles.add(path.normalize(filePath));
                    if (line.startsWith('??')) {
                        untracked++;
                    }
                    else {
                        modified++;
                    }
                }
            }
            repo.modifiedCount = modified;
            repo.untrackedCount = untracked;
            repo.isClean = modified === 0 && untracked === 0;
            repo.uncommittedFiles = uncommittedFiles;
        }
    }
    /**
     * Retrieves the set of relative file paths with uncommitted changes for a repo.
     */
    async getUncommittedFilePaths(repoPath) {
        const statusRes = await this.runRawCommand(repoPath, 'git status --porcelain=v1 -uall');
        const filePaths = new Set();
        if (!statusRes.success || !statusRes.stdout) {
            return filePaths;
        }
        const lines = statusRes.stdout.split('\n');
        for (const line of lines) {
            if (!line.trim() || line.startsWith('##'))
                continue;
            let filePath = line.slice(3).trim();
            if (filePath.includes(' -> ')) {
                filePath = filePath.split(' -> ').pop().trim();
            }
            if (filePath.startsWith('"') && filePath.endsWith('"')) {
                filePath = filePath.slice(1, -1);
            }
            filePaths.add(path.normalize(filePath));
        }
        return filePaths;
    }
    runRawCommand(cwd, command, timeoutMs = 60000) {
        const startTime = Date.now();
        const systemPath = process.env.PATH || '';
        const defaultPaths = '/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';
        const env = { ...process.env, PATH: systemPath ? `${defaultPaths}:${systemPath}` : defaultPaths };
        return new Promise(resolve => {
            (0, child_process_1.exec)(command, { cwd, timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024, env }, (error, stdout, stderr) => {
                const durationMs = Date.now() - startTime;
                resolve({
                    success: !error,
                    stdout: stdout || '',
                    stderr: stderr || (error ? error.message : ''),
                    durationMs
                });
            });
        });
    }
    /**
     * Runs a command across all (or specified) repositories concurrently.
     */
    async executeCommandOnRepositories(command, targetRepos) {
        const repos = targetRepos && targetRepos.length > 0 ? targetRepos : this.repositories;
        if (repos.length === 0) {
            return [];
        }
        this.logger.logHeader(`Running: "${command}" on ${repos.length} repositor${repos.length === 1 ? 'y' : 'ies'}`);
        const promises = repos.map(async (repo) => {
            this.logger.log(`[${repo.name}] Starting: ${command}`);
            const res = await this.runRawCommand(repo.path, command);
            const result = {
                repoName: repo.name,
                repoPath: repo.path,
                command,
                success: res.success,
                stdout: res.stdout,
                stderr: res.stderr,
                durationMs: res.durationMs
            };
            if (res.success) {
                this.logger.log(`[${repo.name}] ✓ Completed in ${res.durationMs}ms`);
            }
            else {
                this.logger.log(`[${repo.name}] ✗ Error: ${res.stderr.trim() || 'Command failed'}`);
            }
            return result;
        });
        const results = await Promise.all(promises);
        this.logger.logCommandSummary(command, results);
        // Refresh repo metadata in background after mutations
        this.refreshRepositoriesState();
        return results;
    }
    async refreshRepositoriesState() {
        for (const repo of this.repositories) {
            try {
                await this.populateGitInfo(repo);
            }
            catch {
                // Continue
            }
        }
        this._onDidChangeRepositories.fire(this.repositories);
    }
    // Predefined operations
    async fetchAll(targetRepos) {
        return this.executeCommandOnRepositories('git fetch --all --prune', targetRepos);
    }
    async pullAll(targetRepos) {
        return this.executeCommandOnRepositories('git pull', targetRepos);
    }
    async pushAll(targetRepos) {
        return this.executeCommandOnRepositories('git push', targetRepos);
    }
    async stashAll(targetRepos) {
        return this.executeCommandOnRepositories('git stash', targetRepos);
    }
    async stashPopAll(targetRepos) {
        return this.executeCommandOnRepositories('git stash pop', targetRepos);
    }
    /**
     * Detects the main/default branch for each repository and executes pull from it.
     */
    async pullMainAll(targetRepos) {
        const repos = targetRepos && targetRepos.length > 0 ? targetRepos : this.repositories;
        if (repos.length === 0)
            return [];
        const config = vscode.workspace.getConfiguration('gitProjectExplorer');
        const defaultCandidates = config.get('defaultBranchNames', ['main', 'master', 'develop']);
        this.logger.logHeader(`Pull from Main/Master on ${repos.length} repositories`);
        const promises = repos.map(async (repo) => {
            // Find candidate branch that exists or default to main
            let primaryBranch = 'main';
            for (const candidate of defaultCandidates) {
                const check = await this.runRawCommand(repo.path, `git rev-parse --verify ${candidate}`);
                if (check.success) {
                    primaryBranch = candidate;
                    break;
                }
            }
            const pullCmd = `git pull origin ${primaryBranch}`;
            this.logger.log(`[${repo.name}] Pulling from default branch (${primaryBranch}): ${pullCmd}`);
            const res = await this.runRawCommand(repo.path, pullCmd);
            return {
                repoName: repo.name,
                repoPath: repo.path,
                command: pullCmd,
                success: res.success,
                stdout: res.stdout,
                stderr: res.stderr,
                durationMs: res.durationMs
            };
        });
        const results = await Promise.all(promises);
        this.logger.logCommandSummary('Pull from Main/Master', results);
        this.refreshRepositoriesState();
        return results;
    }
    async checkoutBranchAll(branchName, targetRepos) {
        return this.executeCommandOnRepositories(`git checkout ${branchName}`, targetRepos);
    }
}
exports.GitService = GitService;
//# sourceMappingURL=gitService.js.map