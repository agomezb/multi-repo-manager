import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { GitRepo, GitCommandResult } from '../models/types';
import { OutputLogger } from './outputChannel';

export class GitService {
  private static instance: GitService;
  private repositories: GitRepo[] = [];
  private logger: OutputLogger;

  private _onDidChangeRepositories = new vscode.EventEmitter<GitRepo[]>();
  public readonly onDidChangeRepositories = this._onDidChangeRepositories.event;

  private constructor() {
    this.logger = OutputLogger.getInstance();
  }

  public static getInstance(): GitService {
    if (!GitService.instance) {
      GitService.instance = new GitService();
    }
    return GitService.instance;
  }

  public getRepositories(): GitRepo[] {
    return this.repositories;
  }

  /**
   * Discovers all git repositories inside open workspace folders.
   */
  public async discoverRepositories(): Promise<GitRepo[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      this.repositories = [];
      this._onDidChangeRepositories.fire(this.repositories);
      return [];
    }

    const config = vscode.workspace.getConfiguration('gitProjectExplorer');
    const maxDepth = config.get<number>('searchDepth', 4);
    const excludePatterns = config.get<string[]>('excludePatterns', [
      '**/node_modules/**',
      '**/.cache/**',
      '**/dist/**',
      '**/build/**',
      '**/target/**',
      '**/.venv/**',
      '**/vendor/**'
    ]);

    const foundRepoPaths = new Set<string>();

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
    } catch {
      // VS Code git extension might not be active or available, proceed to manual scan
    }

    // 2. Scan workspace folders on disk
    for (const folder of workspaceFolders) {
      const folderPath = folder.uri.fsPath;
      await this.scanDirectoryForGit(folderPath, 0, maxDepth, excludePatterns, foundRepoPaths);
    }

    // 3. Build GitRepo metadata for each discovered path
    const repoList: GitRepo[] = [];
    for (const repoPath of foundRepoPaths) {
      const repoName = path.basename(repoPath);
      const repoInfo: GitRepo = {
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
      } catch (err) {
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

  private async scanDirectoryForGit(
    dirPath: string,
    currentDepth: number,
    maxDepth: number,
    excludePatterns: string[],
    foundRepoPaths: Set<string>
  ): Promise<void> {
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
    } catch {
      // No .git here, continue
    }

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    } catch {
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
  private async populateGitInfo(repo: GitRepo): Promise<void> {
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
      const uncommittedFiles = new Set<string>();

      for (const line of lines) {
        if (!line.trim()) continue;
        if (line.startsWith('##')) {
          // Parse ahead/behind, e.g. "## main...origin/main [ahead 1, behind 2]"
          const aheadMatch = line.match(/ahead (\d+)/);
          const behindMatch = line.match(/behind (\d+)/);
          repo.ahead = aheadMatch ? parseInt(aheadMatch[1], 10) : 0;
          repo.behind = behindMatch ? parseInt(behindMatch[1], 10) : 0;
        } else {
          let filePath = line.slice(3).trim();
          if (filePath.includes(' -> ')) {
            filePath = filePath.split(' -> ').pop()!.trim();
          }
          if (filePath.startsWith('"') && filePath.endsWith('"')) {
            filePath = filePath.slice(1, -1);
          }
          uncommittedFiles.add(path.normalize(filePath));

          if (line.startsWith('??')) {
            untracked++;
          } else {
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
  public async getUncommittedFilePaths(repoPath: string): Promise<Set<string>> {
    const statusRes = await this.runRawCommand(repoPath, 'git status --porcelain=v1 -uall');
    const filePaths = new Set<string>();
    if (!statusRes.success || !statusRes.stdout) {
      return filePaths;
    }

    const lines = statusRes.stdout.split('\n');
    for (const line of lines) {
      if (!line.trim() || line.startsWith('##')) continue;
      let filePath = line.slice(3).trim();
      if (filePath.includes(' -> ')) {
        filePath = filePath.split(' -> ').pop()!.trim();
      }
      if (filePath.startsWith('"') && filePath.endsWith('"')) {
        filePath = filePath.slice(1, -1);
      }
      filePaths.add(path.normalize(filePath));
    }
    return filePaths;
  }

  public runRawCommand(cwd: string, command: string, timeoutMs = 60000): Promise<{ success: boolean; stdout: string; stderr: string; durationMs: number }> {
    const startTime = Date.now();
    const systemPath = process.env.PATH || '';
    const defaultPaths = '/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';
    const env = { ...process.env, PATH: systemPath ? `${defaultPaths}:${systemPath}` : defaultPaths };

    return new Promise(resolve => {
      exec(command, { cwd, timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024, env }, (error, stdout, stderr) => {
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
  public async executeCommandOnRepositories(
    command: string,
    targetRepos?: GitRepo[]
  ): Promise<GitCommandResult[]> {
    const repos = targetRepos && targetRepos.length > 0 ? targetRepos : this.repositories;
    if (repos.length === 0) {
      return [];
    }

    this.logger.logHeader(`Running: "${command}" on ${repos.length} repositor${repos.length === 1 ? 'y' : 'ies'}`);

    const promises = repos.map(async repo => {
      this.logger.log(`[${repo.name}] Starting: ${command}`);
      const res = await this.runRawCommand(repo.path, command);
      const result: GitCommandResult = {
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
      } else {
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

  public async refreshRepositoriesState(): Promise<void> {
    for (const repo of this.repositories) {
      try {
        await this.populateGitInfo(repo);
      } catch {
        // Continue
      }
    }
    this._onDidChangeRepositories.fire(this.repositories);
  }

  // Predefined operations
  public async fetchAll(targetRepos?: GitRepo[]): Promise<GitCommandResult[]> {
    return this.executeCommandOnRepositories('git fetch --all --prune', targetRepos);
  }

  public async pullAll(targetRepos?: GitRepo[]): Promise<GitCommandResult[]> {
    return this.executeCommandOnRepositories('git pull', targetRepos);
  }

  public async pushAll(targetRepos?: GitRepo[]): Promise<GitCommandResult[]> {
    return this.executeCommandOnRepositories('git push', targetRepos);
  }

  public async stashAll(targetRepos?: GitRepo[]): Promise<GitCommandResult[]> {
    return this.executeCommandOnRepositories('git stash', targetRepos);
  }

  public async stashPopAll(targetRepos?: GitRepo[]): Promise<GitCommandResult[]> {
    return this.executeCommandOnRepositories('git stash pop', targetRepos);
  }

  /**
   * Detects the main/default branch for each repository and executes pull from it.
   */
  public async pullMainAll(targetRepos?: GitRepo[]): Promise<GitCommandResult[]> {
    const repos = targetRepos && targetRepos.length > 0 ? targetRepos : this.repositories;
    if (repos.length === 0) return [];

    const config = vscode.workspace.getConfiguration('gitProjectExplorer');
    const defaultCandidates = config.get<string[]>('defaultBranchNames', ['main', 'master', 'develop']);

    this.logger.logHeader(`Pull from Main/Master on ${repos.length} repositories`);

    const promises = repos.map(async repo => {
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

  public async checkoutBranchAll(branchName: string, targetRepos?: GitRepo[]): Promise<GitCommandResult[]> {
    return this.executeCommandOnRepositories(`git checkout ${branchName}`, targetRepos);
  }
}
