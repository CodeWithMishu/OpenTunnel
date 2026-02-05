/**
 * OpenTunnel - Expose Localhost Without Lock-In
 * 
 * Main extension entry point
 */

import * as vscode from 'vscode';
import { TunnelManager } from './tunnelManager';
import { StatusBarManager } from './ui/statusBar';
import { TunnelTreeProvider, RequestTreeProvider } from './ui/treeView';
import { Logger } from './utils/logger';
import { detectRunningServers, getPortLabel, DetectedPort } from './utils/portScanner';

let tunnelManager: TunnelManager;
let statusBarManager: StatusBarManager;
let tunnelTreeProvider: TunnelTreeProvider;
let requestTreeProvider: RequestTreeProvider;
let logger: Logger;

export function activate(context: vscode.ExtensionContext): void {
    logger = new Logger('OpenTunnel');
    logger.info('OpenTunnel extension is activating...');

    // Initialize managers
    tunnelManager = new TunnelManager(context);
    statusBarManager = new StatusBarManager();
    tunnelTreeProvider = new TunnelTreeProvider(tunnelManager);
    requestTreeProvider = new RequestTreeProvider(tunnelManager);

    // Register tree views
    const tunnelTreeView = vscode.window.createTreeView('opentunnel.tunnels', {
        treeDataProvider: tunnelTreeProvider,
        showCollapseAll: false
    });

    const requestTreeView = vscode.window.createTreeView('opentunnel.requests', {
        treeDataProvider: requestTreeProvider,
        showCollapseAll: true
    });

    // Register commands
    const commands = [
        vscode.commands.registerCommand('opentunnel.startTunnel', () => startTunnel()),
        vscode.commands.registerCommand('opentunnel.stopTunnel', (item?: any) => stopTunnel(item)),
        vscode.commands.registerCommand('opentunnel.showStatus', () => showStatus()),
        vscode.commands.registerCommand('opentunnel.copyUrl', (item?: any) => copyUrl(item)),
        vscode.commands.registerCommand('opentunnel.openInBrowser', (item?: any) => openInBrowser(item)),
        vscode.commands.registerCommand('opentunnel.showDashboard', () => showDashboard(context))
    ];

    // Subscribe to tunnel events
    tunnelManager.onTunnelStarted((tunnel: any) => {
        statusBarManager.setConnected(tunnel.publicUrl, tunnel.localPort);
        tunnelTreeProvider.refresh();
        
        const config = vscode.workspace.getConfiguration('opentunnel');
        if (config.get<boolean>('showNotifications', true)) {
            vscode.window.showInformationMessage(
                `🚀 Tunnel active: ${tunnel.publicUrl}`,
                'Copy URL',
                'Open in Browser'
            ).then(selection => {
                if (selection === 'Copy URL') {
                    vscode.env.clipboard.writeText(tunnel.publicUrl);
                    vscode.window.showInformationMessage('URL copied to clipboard!');
                } else if (selection === 'Open in Browser') {
                    vscode.env.openExternal(vscode.Uri.parse(tunnel.publicUrl));
                }
            });
        }
    });

    tunnelManager.onTunnelStopped((tunnelId: string) => {
        const activeTunnels = tunnelManager.getActiveTunnels();
        if (activeTunnels.length === 0) {
            statusBarManager.setDisconnected();
        } else {
            const firstTunnel = activeTunnels[0];
            statusBarManager.setConnected(firstTunnel.publicUrl, firstTunnel.localPort);
        }
        tunnelTreeProvider.refresh();
    });

    tunnelManager.onTunnelError((error: any) => {
        statusBarManager.setError(error.message);
        vscode.window.showErrorMessage(`OpenTunnel Error: ${error.message}`);
    });

    tunnelManager.onRequestReceived((request: any) => {
        requestTreeProvider.addRequest(request);
    });

    // Register disposables
    context.subscriptions.push(
        ...commands,
        tunnelTreeView,
        requestTreeView,
        statusBarManager,
        tunnelManager
    );

    logger.info('OpenTunnel extension activated successfully!');
}

async function startTunnel(): Promise<void> {
    const config = vscode.workspace.getConfiguration('opentunnel');
    const defaultPort = config.get<number>('defaultPort', 3000);

    // Auto-detect running local servers
    let port: number | undefined;

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Scanning for running servers...' },
        async () => {
            const detected = await detectRunningServers();

            if (detected.length === 0) {
                // No servers found — fall back to manual input
                const portInput = await vscode.window.showInputBox({
                    prompt: 'No running servers detected. Enter the local port to expose',
                    value: defaultPort.toString(),
                    validateInput: (value: string) => {
                        const p = parseInt(value, 10);
                        if (isNaN(p) || p < 1 || p > 65535) {
                            return 'Please enter a valid port number (1-65535)';
                        }
                        return null;
                    }
                });

                if (portInput) {
                    port = parseInt(portInput, 10);
                }
            } else if (detected.length === 1) {
                // Exactly one server found — use it directly
                port = detected[0].port;
                vscode.window.showInformationMessage(
                    `Auto-detected server on port ${detected[0].port}${detected[0].name ? ' (' + detected[0].name + ')' : ''}`
                );
            } else {
                // Multiple servers found — let user pick
                const items = detected.map((d: DetectedPort) => ({
                    label: `$(server) Port ${d.port}`,
                    description: d.name || '',
                    detail: `Expose localhost:${d.port} to the internet`,
                    port: d.port
                }));

                // Add manual entry option at the bottom
                items.push({
                    label: '$(edit) Enter port manually...',
                    description: '',
                    detail: 'Type a custom port number',
                    port: -1
                });

                const selection: any = await vscode.window.showQuickPick(items, {
                    placeHolder: `Found ${detected.length} running servers — select one to expose`,
                    matchOnDescription: true
                });

                if (!selection) {
                    return; // User cancelled
                }

                if (selection.port === -1) {
                    // Manual entry
                    const portInput = await vscode.window.showInputBox({
                        prompt: 'Enter the local port to expose',
                        value: defaultPort.toString(),
                        validateInput: (value: string) => {
                            const p = parseInt(value, 10);
                            if (isNaN(p) || p < 1 || p > 65535) {
                                return 'Please enter a valid port number (1-65535)';
                            }
                            return null;
                        }
                    });
                    if (portInput) {
                        port = parseInt(portInput, 10);
                    }
                } else {
                    port = selection.port;
                }
            }
        }
    );

    if (!port) {
        return; // User cancelled
    }

    // Check if port is already tunneled
    const existingTunnel = tunnelManager.getTunnelByPort(port);
    if (existingTunnel) {
        vscode.window.showWarningMessage(`Port ${port} is already being tunneled to ${existingTunnel.publicUrl}`);
        return;
    }

    try {
        statusBarManager.setConnecting();
        await tunnelManager.startTunnel(port);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Failed to start tunnel: ${message}`);
        statusBarManager.setDisconnected();
    }
}

async function stopTunnel(item?: any): Promise<void> {
    let tunnelId: string | undefined;

    if (item?.tunnelId) {
        tunnelId = item.tunnelId;
    } else {
        const tunnels = tunnelManager.getActiveTunnels();
        if (tunnels.length === 0) {
            vscode.window.showInformationMessage('No active tunnels to stop.');
            return;
        }

        if (tunnels.length === 1) {
            tunnelId = tunnels[0].id;
        } else {
            const selection = await vscode.window.showQuickPick(
                tunnels.map((t: any) => ({
                    label: `Port ${t.localPort}`,
                    description: t.publicUrl,
                    tunnelId: t.id
                })),
                { placeHolder: 'Select a tunnel to stop' }
            );

            if (!selection) {
                return;
            }
            tunnelId = (selection as any).tunnelId;
        }
    }

    if (tunnelId) {
        tunnelManager.stopTunnel(tunnelId);
        vscode.window.showInformationMessage('Tunnel stopped.');
    }
}

function showStatus(): void {
    const tunnels = tunnelManager.getActiveTunnels();
    
    if (tunnels.length === 0) {
        vscode.window.showInformationMessage('No active tunnels. Use "OpenTunnel: Start Tunnel" to create one.');
        return;
    }

    const statusMessage = tunnels.map((t: any) => 
        `Port ${t.localPort} → ${t.publicUrl}`
    ).join('\n');

    vscode.window.showInformationMessage(`Active Tunnels:\n${statusMessage}`);
}

async function copyUrl(item?: any): Promise<void> {
    let url: string | undefined;

    if (item?.publicUrl) {
        url = item.publicUrl;
    } else {
        const tunnels = tunnelManager.getActiveTunnels();
        if (tunnels.length === 0) {
            vscode.window.showInformationMessage('No active tunnels.');
            return;
        }

        if (tunnels.length === 1) {
            url = tunnels[0].publicUrl;
        } else {
            const selection = await vscode.window.showQuickPick(
                tunnels.map((t: any) => ({
                    label: t.publicUrl,
                    description: `Port ${t.localPort}`,
                    url: t.publicUrl
                })),
                { placeHolder: 'Select a URL to copy' }
            );

            if (!selection) {
                return;
            }
            url = (selection as any).url;
        }
    }

    if (url) {
        await vscode.env.clipboard.writeText(url);
        vscode.window.showInformationMessage('URL copied to clipboard!');
    }
}

async function openInBrowser(item?: any): Promise<void> {
    let url: string | undefined;

    if (item?.publicUrl) {
        url = item.publicUrl;
    } else {
        const tunnels = tunnelManager.getActiveTunnels();
        if (tunnels.length === 0) {
            vscode.window.showInformationMessage('No active tunnels.');
            return;
        }

        if (tunnels.length === 1) {
            url = tunnels[0].publicUrl;
        } else {
            const selection = await vscode.window.showQuickPick(
                tunnels.map((t: any) => ({
                    label: t.publicUrl,
                    description: `Port ${t.localPort}`,
                    url: t.publicUrl
                })),
                { placeHolder: 'Select a URL to open' }
            );

            if (!selection) {
                return;
            }
            url = (selection as any).url;
        }
    }

    if (url) {
        vscode.env.openExternal(vscode.Uri.parse(url));
    }
}

function showDashboard(context: vscode.ExtensionContext): void {
    const panel = vscode.window.createWebviewPanel(
        'opentunnelDashboard',
        'OpenTunnel Dashboard',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    const tunnels = tunnelManager.getActiveTunnels();
    const requests = tunnelManager.getRecentRequests();

    panel.webview.html = getDashboardHtml(tunnels, requests);

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(
        message => {
            switch (message.command) {
                case 'copyUrl':
                    vscode.env.clipboard.writeText(message.url);
                    vscode.window.showInformationMessage('URL copied!');
                    break;
                case 'stopTunnel':
                    tunnelManager.stopTunnel(message.tunnelId);
                    break;
                case 'refresh':
                    const updatedTunnels = tunnelManager.getActiveTunnels();
                    const updatedRequests = tunnelManager.getRecentRequests();
                    panel.webview.html = getDashboardHtml(updatedTunnels, updatedRequests);
                    break;
            }
        },
        undefined,
        context.subscriptions
    );
}

function getDashboardHtml(tunnels: any[], requests: any[]): string {
    const tunnelRows = tunnels.map(t => `
        <tr>
            <td>${t.localPort}</td>
            <td><a href="${t.publicUrl}" target="_blank">${t.publicUrl}</a></td>
            <td>${t.requestCount || 0}</td>
            <td>
                <button onclick="copyUrl('${t.publicUrl}')">📋 Copy</button>
                <button onclick="stopTunnel('${t.id}')">⏹️ Stop</button>
            </td>
        </tr>
    `).join('');

    const requestRows = requests.slice(0, 50).map(r => `
        <tr>
            <td><span class="method ${r.method.toLowerCase()}">${r.method}</span></td>
            <td>${r.path}</td>
            <td>${r.status || '-'}</td>
            <td>${new Date(r.timestamp).toLocaleTimeString()}</td>
        </tr>
    `).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OpenTunnel Dashboard</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        h1 {
            color: var(--vscode-textLink-foreground);
            border-bottom: 1px solid var(--vscode-textSeparator-foreground);
            padding-bottom: 10px;
        }
        h2 {
            margin-top: 30px;
            color: var(--vscode-textPreformat-foreground);
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
        }
        th, td {
            padding: 10px;
            text-align: left;
            border-bottom: 1px solid var(--vscode-textSeparator-foreground);
        }
        th {
            background-color: var(--vscode-editor-selectionBackground);
        }
        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 5px 10px;
            cursor: pointer;
            margin-right: 5px;
            border-radius: 3px;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        a {
            color: var(--vscode-textLink-foreground);
        }
        .method {
            padding: 2px 8px;
            border-radius: 3px;
            font-weight: bold;
            font-size: 12px;
        }
        .method.get { background-color: #61affe; color: white; }
        .method.post { background-color: #49cc90; color: white; }
        .method.put { background-color: #fca130; color: white; }
        .method.delete { background-color: #f93e3e; color: white; }
        .method.patch { background-color: #50e3c2; color: white; }
        .empty-state {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
        }
        .refresh-btn {
            float: right;
            margin-top: -40px;
        }
    </style>
</head>
<body>
    <h1>🚀 OpenTunnel Dashboard</h1>
    <button class="refresh-btn" onclick="refresh()">🔄 Refresh</button>
    
    <h2>Active Tunnels</h2>
    ${tunnels.length > 0 ? `
    <table>
        <thead>
            <tr>
                <th>Local Port</th>
                <th>Public URL</th>
                <th>Requests</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>
            ${tunnelRows}
        </tbody>
    </table>
    ` : '<div class="empty-state">No active tunnels. Start one using the command palette.</div>'}
    
    <h2>Recent Requests</h2>
    ${requests.length > 0 ? `
    <table>
        <thead>
            <tr>
                <th>Method</th>
                <th>Path</th>
                <th>Status</th>
                <th>Time</th>
            </tr>
        </thead>
        <tbody>
            ${requestRows}
        </tbody>
    </table>
    ` : '<div class="empty-state">No requests yet.</div>'}
    
    <script>
        const vscode = acquireVsCodeApi();
        
        function copyUrl(url) {
            vscode.postMessage({ command: 'copyUrl', url: url });
        }
        
        function stopTunnel(tunnelId) {
            vscode.postMessage({ command: 'stopTunnel', tunnelId: tunnelId });
            setTimeout(() => refresh(), 500);
        }
        
        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }
    </script>
</body>
</html>`;
}

export function deactivate(): void {
    logger?.info('OpenTunnel extension is deactivating...');
    tunnelManager?.dispose();
}
