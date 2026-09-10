import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { GitService } from '../src/services/gitService';
import { GitProjectExplorerProvider, RepoTreeItem, FileSystemTreeItem } from '../src/views/explorer/gitProjectExplorerProvider';

// Helper to run shell commands in test setup
function run(cmd: string, cwd: string) {
  return execSync(cmd, { cwd, stdio: 'pipe' }).toString();
}

async function main() {
  console.log('--- Setting up test multi-repo environment ---');
  const testRoot = path.join(__dirname, 'mock-repos');
  if (fs.existsSync(testRoot)) {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
  fs.mkdirSync(testRoot, { recursive: true });

  // Repo 1: frontend
  const repo1 = path.join(testRoot, 'repo-frontend');
  fs.mkdirSync(repo1);
  run('git init -b main', repo1);
  run('git config user.email "tester@example.com"', repo1);
  run('git config user.name "Tester"', repo1);
  fs.writeFileSync(path.join(repo1, 'package.json'), '{"name": "frontend"}');
  fs.mkdirSync(path.join(repo1, 'src'));
  fs.writeFileSync(path.join(repo1, 'src', 'index.js'), 'console.log("frontend");');
  run('git add .', repo1);
  run('git commit -m "initial commit in frontend"', repo1);

  // Repo 2: backend
  const repo2 = path.join(testRoot, 'repo-backend');
  fs.mkdirSync(repo2);
  run('git init -b main', repo2);
  run('git config user.email "tester@example.com"', repo2);
  run('git config user.name "Tester"', repo2);
  fs.writeFileSync(path.join(repo2, 'server.py'), 'print("backend")');
  fs.mkdirSync(path.join(repo2, 'api'));
  fs.writeFileSync(path.join(repo2, 'api', 'routes.py'), '# routes');
  run('git add .', repo2);
  run('git commit -m "initial commit in backend"', repo2);
  // Add an uncommitted file to backend
  fs.writeFileSync(path.join(repo2, 'dirty.txt'), 'pending changes');

  console.log('✓ Mock repos created: repo-frontend, repo-backend');

  const gitService = GitService.getInstance();

  console.log('\n--- Testing Raw Git Execution ---');
  const checkBranch1 = await gitService.runRawCommand(repo1, 'git branch --show-current');
  console.log('repo1 current branch:', checkBranch1.stdout.trim());
  if (checkBranch1.stdout.trim() !== 'main') {
    throw new Error('Expected repo1 branch to be main');
  }

  console.log('\n--- Testing Multi-Repo Execution ---');
  const repos = [
    { name: 'repo-frontend', path: repo1, rootUri: { fsPath: repo1 } as any },
    { name: 'repo-backend', path: repo2, rootUri: { fsPath: repo2 } as any }
  ];

  const results = await gitService.executeCommandOnRepositories('git status -s', repos);
  console.log(`Executed command on ${results.length} repositories:`);
  for (const r of results) {
    console.log(`[${r.repoName}] success: ${r.success}, stdout: "${r.stdout.trim()}"`);
  }

  // backend should report dirty.txt
  const backendResult = results.find(r => r.repoName === 'repo-backend');
  if (!backendResult || !backendResult.stdout.includes('dirty.txt')) {
    throw new Error('Expected repo-backend to report dirty.txt in git status');
  }
  console.log('✓ Verified multi-repo status execution detected uncommitted changes');

  console.log('\n--- Testing Explorer Provider Hierarchy ---');
  const explorerProvider = new GitProjectExplorerProvider();
  // Test getChildren on RepoTreeItem
  const repo1Item = new RepoTreeItem(repos[0]);
  const repo1Children = await explorerProvider.getChildren(repo1Item);
  console.log(`repo-frontend children count: ${repo1Children.length}`);
  const labels = (repo1Children as FileSystemTreeItem[]).map(c => c.label);
  console.log('repo-frontend children:', labels);
  if (!labels.includes('package.json') || !labels.includes('src')) {
    throw new Error('Expected repo-frontend to contain package.json and src');
  }
  console.log('✓ Verified Explorer hierarchy lists project files and directories');

  // Clean mock directory
  console.log('\n--- Testing Show Only Uncommitted Filter ---');
  const backendUncommitted = await gitService.getUncommittedFilePaths(repo2);
  console.log('repo-backend uncommitted files:', Array.from(backendUncommitted));
  if (!backendUncommitted.has('dirty.txt')) {
    throw new Error('Expected repo-backend to list dirty.txt in getUncommittedFilePaths');
  }

  // Populate repos in GitService for explorerProvider testing
  (gitService as any).repositories = [
    { name: 'repo-frontend', path: repo1, rootUri: { fsPath: repo1 } as any, isClean: true, modifiedCount: 0, untrackedCount: 0 },
    { name: 'repo-backend', path: repo2, rootUri: { fsPath: repo2 } as any, isClean: false, modifiedCount: 0, untrackedCount: 1, uncommittedFiles: backendUncommitted }
  ];

  // Test 1: Global filter ON
  console.log('Testing Global Filter ON...');
  explorerProvider.toggleGlobalOnlyUncommitted();
  const globalRoots = await explorerProvider.getChildren();
  const rootLabels = (globalRoots as RepoTreeItem[]).map(r => r.repo.name);
  console.log('Roots with global uncommitted filter:', rootLabels);
  if (rootLabels.includes('repo-frontend') || !rootLabels.includes('repo-backend')) {
    throw new Error('Global filter should only show repo-backend because repo-frontend is clean');
  }

  // Test 2: Children of repo-backend with filter ON
  const backendItemFiltered = globalRoots[0] as RepoTreeItem;
  const backendFilteredChildren = await explorerProvider.getChildren(backendItemFiltered);
  const backendChildLabels = (backendFilteredChildren as FileSystemTreeItem[]).map(c => c.label);
  console.log('repo-backend filtered children:', backendChildLabels);
  if (backendChildLabels.includes('server.py') || !backendChildLabels.includes('dirty.txt')) {
    throw new Error('Filtered repo-backend should only show dirty.txt, hiding server.py');
  }
  console.log('✓ Verified global Show Only Uncommitted hides clean repos and clean files');

  // Test 3: Toggle Global filter OFF, test per-repo filter
  console.log('Testing Per-Repo Filter...');
  explorerProvider.toggleGlobalOnlyUncommitted(); // Back to OFF
  const normalRoots = await explorerProvider.getChildren();
  if (normalRoots.length !== 2) {
    throw new Error('All repos should be shown when global filter is OFF');
  }

  // Toggle filter on repo-backend only
  explorerProvider.toggleRepoOnlyUncommitted(repo2);
  const updatedRoots = await explorerProvider.getChildren();
  const backendItem = (updatedRoots as RepoTreeItem[]).find(r => r.repo.name === 'repo-backend')!;
  if (!backendItem.isFiltered) {
    throw new Error('Expected repo-backend to be marked as filtered');
  }
  const perRepoFilteredChildren = await explorerProvider.getChildren(backendItem);
  const perRepoLabels = (perRepoFilteredChildren as FileSystemTreeItem[]).map(c => c.label);
  console.log('repo-backend per-repo filtered children:', perRepoLabels);
  if (perRepoLabels.includes('server.py') || !perRepoLabels.includes('dirty.txt')) {
    throw new Error('Per-repo filtered repo-backend should only show dirty.txt');
  }
  console.log('✓ Verified per-repo Show Only Uncommitted works independently');

  // Clean up mock directory
  fs.rmSync(testRoot, { recursive: true, force: true });
  console.log('\n=============================');
  console.log('ALL TESTS PASSED SUCCESSFULLY');
  console.log('=============================');
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
