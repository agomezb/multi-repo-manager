import * as vscode from 'vscode';

export interface GitRepo {
  name: string;
  path: string;
  rootUri: vscode.Uri;
  currentBranch?: string;
  ahead?: number;
  behind?: number;
  isClean?: boolean;
  modifiedCount?: number;
  untrackedCount?: number;
  remoteOriginUrl?: string;
  uncommittedFiles?: Set<string>;
}

export interface GitCommandResult {
  repoName: string;
  repoPath: string;
  command: string;
  success: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface PredefinedGitAction {
  id: string;
  label: string;
  description: string;
  icon: string;
  tooltip?: string;
  execute: () => Promise<void>;
}

export interface CliExecutionOptions {
  command: string;
  repoPaths?: string[]; // If undefined, runs on all repos
  timeoutMs?: number;
}
