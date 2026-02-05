/**
 * TreeView Providers for OpenTunnel
 */

import * as vscode from 'vscode';
import { TunnelManager } from '../tunnelManager';
import { TunnelInfo, RequestInfo } from '../tunnelClient';

/**
 * TunnelTreeProvider - Shows active tunnels in the sidebar
 */
export class TunnelTreeProvider implements vscode.TreeDataProvider<TunnelTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TunnelTreeItem | undefined | null | void> = 
        new vscode.EventEmitter<TunnelTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TunnelTreeItem | undefined | null | void> = 
        this._onDidChangeTreeData.event;

    constructor(private tunnelManager: TunnelManager) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TunnelTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TunnelTreeItem): Thenable<TunnelTreeItem[]> {
        if (element) {
            // Return tunnel details as children
            return Promise.resolve(this.getTunnelDetails(element.tunnel));
        }

        const tunnels = this.tunnelManager.getActiveTunnels();
        const items = tunnels.map(tunnel => new TunnelTreeItem(tunnel));
        return Promise.resolve(items);
    }

    private getTunnelDetails(tunnel: TunnelInfo): TunnelTreeItem[] {
        const items: TunnelTreeItem[] = [
            new TunnelDetailItem('URL', tunnel.publicUrl, 'link'),
            new TunnelDetailItem('Local Port', tunnel.localPort.toString(), 'symbol-number'),
            new TunnelDetailItem('Requests', tunnel.requestCount.toString(), 'pulse'),
            new TunnelDetailItem('Connected', this.formatTime(tunnel.connectedAt), 'clock')
        ];
        return items;
    }

    private formatTime(date: Date): string {
        const now = new Date();
        const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
        
        if (diff < 60) return `${diff}s ago`;
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        return `${Math.floor(diff / 3600)}h ago`;
    }
}

class TunnelTreeItem extends vscode.TreeItem {
    constructor(
        public readonly tunnel: TunnelInfo
    ) {
        super(`Port ${tunnel.localPort}`, vscode.TreeItemCollapsibleState.Expanded);
        
        this.description = tunnel.publicUrl.replace(/^https?:\/\//, '');
        this.tooltip = new vscode.MarkdownString(
            `**Port:** ${tunnel.localPort}\n\n` +
            `**URL:** [${tunnel.publicUrl}](${tunnel.publicUrl})\n\n` +
            `**Requests:** ${tunnel.requestCount}\n\n` +
            `Click to copy URL`
        );
        this.iconPath = new vscode.ThemeIcon('radio-tower', new vscode.ThemeColor('charts.green'));
        this.contextValue = 'tunnel';
        
        // Store for context menu
        (this as any).tunnelId = tunnel.id;
        (this as any).publicUrl = tunnel.publicUrl;
    }
}

class TunnelDetailItem extends vscode.TreeItem {
    constructor(label: string, value: string, icon: string) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.description = value;
        this.iconPath = new vscode.ThemeIcon(icon);
    }

    // Needed to satisfy type but not used
    tunnel: TunnelInfo = {} as TunnelInfo;
}

/**
 * RequestTreeProvider - Shows recent HTTP requests in the sidebar
 */
export class RequestTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = 
        new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = 
        this._onDidChangeTreeData.event;

    private requests: RequestInfo[] = [];
    private maxRequests: number = 50;

    constructor(private tunnelManager: TunnelManager) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    addRequest(request: RequestInfo): void {
        this.requests.unshift(request);
        if (this.requests.length > this.maxRequests) {
            this.requests = this.requests.slice(0, this.maxRequests);
        }
        this.refresh();
    }

    clearRequests(): void {
        this.requests = [];
        this.refresh();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        if (element && element instanceof RequestTreeItem) {
            // Return request details as children
            return Promise.resolve(this.getRequestDetails(element.request));
        }

        const items = this.requests.map(request => new RequestTreeItem(request));
        return Promise.resolve(items);
    }

    private getRequestDetails(request: RequestInfo): vscode.TreeItem[] {
        const items: RequestDetailItem[] = [
            new RequestDetailItem('Path', request.path, 'symbol-file'),
            new RequestDetailItem('Status', request.status?.toString() || 'Pending', 'symbol-number'),
            new RequestDetailItem('Duration', request.duration ? `${request.duration}ms` : '-', 'clock'),
            new RequestDetailItem('Time', this.formatTime(request.timestamp), 'calendar')
        ];
        return items;
    }

    private formatTime(date: Date): string {
        return date.toLocaleTimeString();
    }
}

class RequestTreeItem extends vscode.TreeItem {
    constructor(
        public readonly request: RequestInfo
    ) {
        const label = `${request.method} ${request.path}`;
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        
        this.description = request.status ? `${request.status}` : 'Pending';
        this.tooltip = new vscode.MarkdownString(
            `**${request.method}** ${request.path}\n\n` +
            `**Status:** ${request.status || 'Pending'}\n\n` +
            `**Duration:** ${request.duration ? `${request.duration}ms` : '-'}\n\n` +
            `**Time:** ${request.timestamp.toLocaleString()}`
        );
        
        // Color based on method
        const methodColors: Record<string, string> = {
            'GET': 'charts.blue',
            'POST': 'charts.green',
            'PUT': 'charts.orange',
            'DELETE': 'charts.red',
            'PATCH': 'charts.purple'
        };
        
        this.iconPath = new vscode.ThemeIcon(
            this.getMethodIcon(request.method),
            new vscode.ThemeColor(methodColors[request.method] || 'charts.gray')
        );
        
        this.contextValue = 'request';
    }

    private getMethodIcon(method: string): string {
        const icons: Record<string, string> = {
            'GET': 'arrow-down',
            'POST': 'arrow-up',
            'PUT': 'arrow-swap',
            'DELETE': 'trash',
            'PATCH': 'edit'
        };
        return icons[method] || 'arrow-right';
    }
}

class RequestDetailItem extends vscode.TreeItem {
    constructor(label: string, value: string, icon: string) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.description = value;
        this.iconPath = new vscode.ThemeIcon(icon);
    }

    // Needed to satisfy type but not used
    request: RequestInfo = {} as RequestInfo;
}
