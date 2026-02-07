/**
 * StatusBarManager - Manages the VS Code status bar items
 */

import * as vscode from 'vscode';

export class StatusBarManager implements vscode.Disposable {
    private statusBarItem: vscode.StatusBarItem;
    private stopButton: vscode.StatusBarItem;

    constructor() {
        // Main status item (higher priority = more to the left)
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            101
        );
        
        // Stop button (lower priority = more to the right)
        this.stopButton = vscode.window.createStatusBarItem(
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
        this.statusBarItem.color = undefined;
        
        // Hide stop button when disconnected
        this.stopButton.hide();
    }

    setConnecting(): void {
        this.statusBarItem.text = '$(sync~spin) Connecting...';
        this.statusBarItem.tooltip = 'Establishing tunnel connection...';
        this.statusBarItem.command = undefined;
        this.statusBarItem.backgroundColor = undefined;
        
        // Hide stop button while connecting
        this.stopButton.hide();
    }

    setConnected(publicUrl: string, localPort: number): void {
        this.statusBarItem.text = `$(broadcast) :${localPort} → Online`;
        this.statusBarItem.tooltip = new vscode.MarkdownString(
            `**OpenTunnel Active**\n\n` +
            `🌐 ${publicUrl}\n\n` +
            `📡 localhost:${localPort}\n\n` +
            `_Click to copy URL_`
        );
        this.statusBarItem.command = 'opentunnel.copyUrl';
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
        this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.prominentForeground');
        
        // Show stop button
        this.stopButton.text = '$(debug-stop)';
        this.stopButton.tooltip = 'Stop Tunnel';
        this.stopButton.command = 'opentunnel.stopAllTunnels';
        this.stopButton.backgroundColor = undefined;
        this.stopButton.show();
    }

    setError(message: string): void {
        this.statusBarItem.text = '$(error) Tunnel Error';
        this.statusBarItem.tooltip = `Error: ${message}\nClick to retry`;
        this.statusBarItem.command = 'opentunnel.startTunnel';
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        this.statusBarItem.color = undefined;
        
        // Hide stop button on error
        this.stopButton.hide();

        // Reset to disconnected state after 5 seconds
        setTimeout(() => {
            if (this.statusBarItem.text.includes('Error')) {
                this.setDisconnected();
            }
        }, 5000);
    }

    setReconnecting(attempt: number): void {
        this.statusBarItem.text = `$(sync~spin) Reconnecting (${attempt})...`;
        this.statusBarItem.tooltip = `Attempting to reconnect (attempt ${attempt})`;
        this.statusBarItem.command = undefined;
        this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        
        // Keep stop button visible during reconnection
        this.stopButton.show();
    }

    dispose(): void {
        this.statusBarItem.dispose();
        this.stopButton.dispose();
    }
}
