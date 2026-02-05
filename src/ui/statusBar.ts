/**
 * StatusBarManager - Manages the VS Code status bar item
 */

import * as vscode from 'vscode';

export class StatusBarManager implements vscode.Disposable {
    private statusBarItem: vscode.StatusBarItem;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.setDisconnected();
        this.statusBarItem.show();
    }

    setDisconnected(): void {
        this.statusBarItem.text = '$(radio-tower) OpenTunnel';
        this.statusBarItem.tooltip = 'Click to start a tunnel';
        this.statusBarItem.command = 'opentunnel.startTunnel';
        this.statusBarItem.backgroundColor = undefined;
    }

    setConnecting(): void {
        this.statusBarItem.text = '$(sync~spin) OpenTunnel: Connecting...';
        this.statusBarItem.tooltip = 'Establishing tunnel connection...';
        this.statusBarItem.command = undefined;
        this.statusBarItem.backgroundColor = undefined;
    }

    setConnected(publicUrl: string, localPort: number): void {
        this.statusBarItem.text = `$(radio-tower) :${localPort} → Online`;
        this.statusBarItem.tooltip = `Tunnel active: ${publicUrl}\nClick to copy URL`;
        this.statusBarItem.command = 'opentunnel.copyUrl';
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
    }

    setError(message: string): void {
        this.statusBarItem.text = '$(error) OpenTunnel: Error';
        this.statusBarItem.tooltip = `Error: ${message}\nClick to retry`;
        this.statusBarItem.command = 'opentunnel.startTunnel';
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');

        // Reset to disconnected state after 5 seconds
        setTimeout(() => {
            if (this.statusBarItem.text.includes('Error')) {
                this.setDisconnected();
            }
        }, 5000);
    }

    setReconnecting(attempt: number): void {
        this.statusBarItem.text = `$(sync~spin) OpenTunnel: Reconnecting (${attempt})...`;
        this.statusBarItem.tooltip = `Attempting to reconnect (attempt ${attempt})`;
        this.statusBarItem.command = undefined;
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }

    dispose(): void {
        this.statusBarItem.dispose();
    }
}
