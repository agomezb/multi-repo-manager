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
exports.OutputLogger = void 0;
const vscode = __importStar(require("vscode"));
class OutputLogger {
    static instance;
    channel;
    constructor() {
        this.channel = vscode.window.createOutputChannel('Git Project Explorer');
    }
    static getInstance() {
        if (!OutputLogger.instance) {
            OutputLogger.instance = new OutputLogger();
        }
        return OutputLogger.instance;
    }
    show(preserveFocus = true) {
        this.channel.show(preserveFocus);
    }
    log(message) {
        const timestamp = new Date().toLocaleTimeString();
        this.channel.appendLine(`[${timestamp}] ${message}`);
    }
    append(text) {
        this.channel.append(text);
    }
    appendLine(line = '') {
        this.channel.appendLine(line);
    }
    clear() {
        this.channel.clear();
    }
    logHeader(title) {
        const bar = '='.repeat(60);
        this.appendLine();
        this.appendLine(bar);
        this.log(`>>> ${title.toUpperCase()}`);
        this.appendLine(bar);
    }
    logCommandSummary(command, results) {
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
exports.OutputLogger = OutputLogger;
//# sourceMappingURL=outputChannel.js.map