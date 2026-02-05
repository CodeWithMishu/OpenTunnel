/**
 * Logger utility for OpenTunnel
 */

import * as vscode from 'vscode';

export class Logger {
    private outputChannel: vscode.OutputChannel;
    private prefix: string;

    constructor(name: string) {
        this.prefix = name;
        this.outputChannel = vscode.window.createOutputChannel('OpenTunnel', { log: true });
    }

    private formatMessage(level: string, message: string): string {
        const timestamp = new Date().toISOString();
        return `[${timestamp}] [${level}] [${this.prefix}] ${message}`;
    }

    info(message: string): void {
        this.outputChannel.appendLine(this.formatMessage('INFO', message));
    }

    warn(message: string): void {
        this.outputChannel.appendLine(this.formatMessage('WARN', message));
    }

    error(message: string): void {
        this.outputChannel.appendLine(this.formatMessage('ERROR', message));
    }

    debug(message: string): void {
        this.outputChannel.appendLine(this.formatMessage('DEBUG', message));
    }

    show(): void {
        this.outputChannel.show();
    }
}
