import * as vscode from 'vscode';
import { GitCommandResult } from '../models/types';

export class OutputLogger {
  private static instance: OutputLogger;
  private channel: vscode.OutputChannel;

  private constructor() {
    this.channel = vscode.window.createOutputChannel('Git Project Explorer');
  }

  public static getInstance(): OutputLogger {
    if (!OutputLogger.instance) {
      OutputLogger.instance = new OutputLogger();
    }
    return OutputLogger.instance;
  }

  public show(preserveFocus: boolean = true): void {
    this.channel.show(preserveFocus);
  }

  public log(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    this.channel.appendLine(`[${timestamp}] ${message}`);
  }

  public append(text: string): void {
    this.channel.append(text);
  }

  public appendLine(line: string = ''): void {
    this.channel.appendLine(line);
  }

  public clear(): void {
    this.channel.clear();
  }

  public logHeader(title: string): void {
    const bar = '='.repeat(60);
    this.appendLine();
    this.appendLine(bar);
    this.log(`>>> ${title.toUpperCase()}`);
    this.appendLine(bar);
  }

  public logCommandSummary(command: string, results: GitCommandResult[]): void {
    this.appendLine();
    this.appendLine('-'.repeat(60));
    this.log(`Summary for: "${command}"`);
    this.appendLine('-'.repeat(60));

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    for (const res of results) {
      const statusIcon = res.success ? '✓ SUCCESS' : '✗ FAILED';
      const timing = `${res.durationMs}ms`;
      this.appendLine(`  [${res.repoName}] ${statusIcon} (${timing})`);
      
      if (res.stdout.trim()) {
        const lines = res.stdout.trim().split('\n');
        for (const line of lines) {
          this.appendLine(`    │ ${line}`);
        }
      }
      if (res.stderr.trim()) {
        const lines = res.stderr.trim().split('\n');
        for (const line of lines) {
          this.appendLine(`    ⚠ ${line}`);
        }
      }
    }

    this.appendLine('-'.repeat(60));
    this.log(`Total: ${results.length} repos | Success: ${successful.length} | Failed: ${failed.length}`);
    this.appendLine('-'.repeat(60));
  }
}
