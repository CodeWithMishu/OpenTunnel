/**
 * TunnelManager - Manages all tunnel connections
 */

import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { TunnelClient, TunnelInfo, RequestInfo } from './tunnelClient';
import { Logger } from './utils/logger';
import { generateTunnelId } from './utils/helpers';

export class TunnelManager implements vscode.Disposable {
    private tunnels: Map<string, TunnelClient> = new Map();
    private requests: RequestInfo[] = [];
    private eventEmitter: EventEmitter = new EventEmitter();
    private logger: Logger;
    private context: vscode.ExtensionContext;
    private maxRequests: number = 100;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.logger = new Logger('TunnelManager');
    }

    async startTunnel(localPort: number, subdomain?: string): Promise<TunnelInfo> {
        const config = vscode.workspace.getConfiguration('opentunnel');
        const relayServer = config.get<string>('relayServer', 'wss://opentunnel-relay.onrender.com/tunnel');
        const autoReconnect = config.get<boolean>('autoReconnect', true);
        const maxReconnectAttempts = config.get<number>('maxReconnectAttempts', 5);
        const requestedSubdomain = subdomain || config.get<string>('subdomain', '');

        const tunnelId = generateTunnelId();
        
        this.logger.info(`Starting tunnel for port ${localPort} with ID ${tunnelId}`);

        const client = new TunnelClient({
            tunnelId,
            localPort,
            relayServer,
            subdomain: requestedSubdomain,
            autoReconnect,
            maxReconnectAttempts
        });

        // Subscribe to client events
        client.on('connected', (info: TunnelInfo) => {
            this.logger.info(`Tunnel connected: ${info.publicUrl}`);
            this.eventEmitter.emit('tunnelStarted', info);
        });

        client.on('disconnected', () => {
            this.logger.info(`Tunnel ${tunnelId} disconnected`);
            this.tunnels.delete(tunnelId);
            this.eventEmitter.emit('tunnelStopped', tunnelId);
        });

        client.on('error', (error: Error) => {
            this.logger.error(`Tunnel ${tunnelId} error: ${error.message}`);
            this.eventEmitter.emit('tunnelError', { tunnelId, message: error.message });
        });

        client.on('request', (request: RequestInfo) => {
            this.addRequest(request);
            this.eventEmitter.emit('requestReceived', request);
        });

        client.on('reconnecting', (attempt: number) => {
            this.logger.info(`Tunnel ${tunnelId} reconnecting (attempt ${attempt})`);
        });

        this.tunnels.set(tunnelId, client);

        try {
            const tunnelInfo = await client.connect();
            return tunnelInfo;
        } catch (error) {
            this.tunnels.delete(tunnelId);
            throw error;
        }
    }

    stopTunnel(tunnelId: string): void {
        const client = this.tunnels.get(tunnelId);
        if (client) {
            this.logger.info(`Stopping tunnel ${tunnelId}`);
            client.disconnect();
            this.tunnels.delete(tunnelId);
            this.eventEmitter.emit('tunnelStopped', tunnelId);
        }
    }

    stopAllTunnels(): void {
        this.logger.info('Stopping all tunnels');
        for (const [tunnelId, client] of this.tunnels) {
            client.disconnect();
            this.eventEmitter.emit('tunnelStopped', tunnelId);
        }
        this.tunnels.clear();
    }

    getActiveTunnels(): TunnelInfo[] {
        const tunnels: TunnelInfo[] = [];
        for (const client of this.tunnels.values()) {
            const info = client.getTunnelInfo();
            if (info) {
                tunnels.push(info);
            }
        }
        return tunnels;
    }

    getTunnelByPort(port: number): TunnelInfo | undefined {
        for (const client of this.tunnels.values()) {
            const info = client.getTunnelInfo();
            if (info && info.localPort === port) {
                return info;
            }
        }
        return undefined;
    }

    getTunnelById(tunnelId: string): TunnelInfo | undefined {
        const client = this.tunnels.get(tunnelId);
        return client?.getTunnelInfo() ?? undefined;
    }

    getRecentRequests(): RequestInfo[] {
        return [...this.requests];
    }

    private addRequest(request: RequestInfo): void {
        this.requests.unshift(request);
        if (this.requests.length > this.maxRequests) {
            this.requests = this.requests.slice(0, this.maxRequests);
        }
    }

    clearRequests(): void {
        this.requests = [];
    }

    // Event subscription methods
    onTunnelStarted(callback: (tunnel: TunnelInfo) => void): void {
        this.eventEmitter.on('tunnelStarted', callback);
    }

    onTunnelStopped(callback: (tunnelId: string) => void): void {
        this.eventEmitter.on('tunnelStopped', callback);
    }

    onTunnelError(callback: (error: { tunnelId: string; message: string }) => void): void {
        this.eventEmitter.on('tunnelError', callback);
    }

    onRequestReceived(callback: (request: RequestInfo) => void): void {
        this.eventEmitter.on('requestReceived', callback);
    }

    dispose(): void {
        this.stopAllTunnels();
        this.eventEmitter.removeAllListeners();
    }
}
