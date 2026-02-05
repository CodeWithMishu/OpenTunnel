/**
 * TunnelClient - WebSocket-based tunnel client
 * 
 * Connects to the relay server and handles proxying HTTP requests
 * to the local development server.
 */

import { EventEmitter } from 'events';
import * as http from 'http';
import * as https from 'https';
import WebSocket from 'ws';
import { Logger } from './utils/logger';

export interface TunnelInfo {
    id: string;
    localPort: number;
    publicUrl: string;
    subdomain: string;
    connectedAt: Date;
    requestCount: number;
}

export interface RequestInfo {
    id: string;
    tunnelId: string;
    method: string;
    path: string;
    headers: Record<string, string>;
    status?: number;
    timestamp: Date;
    duration?: number;
}

export interface TunnelClientOptions {
    tunnelId: string;
    localPort: number;
    relayServer: string;
    subdomain?: string;
    autoReconnect?: boolean;
    maxReconnectAttempts?: number;
}

interface RelayMessage {
    type: string;
    [key: string]: any;
}

interface HttpRequest {
    requestId: string;
    method: string;
    path: string;
    headers: Record<string, string>;
    body?: string;
}

export class TunnelClient extends EventEmitter {
    private options: TunnelClientOptions;
    private ws: WebSocket | null = null;
    private tunnelInfo: TunnelInfo | null = null;
    private logger: Logger;
    private reconnectAttempts: number = 0;
    private isConnecting: boolean = false;
    private shouldReconnect: boolean = true;
    private pingInterval: NodeJS.Timeout | null = null;
    private requestCount: number = 0;

    constructor(options: TunnelClientOptions) {
        super();
        this.options = {
            autoReconnect: true,
            maxReconnectAttempts: 5,
            ...options
        };
        this.logger = new Logger(`TunnelClient:${options.tunnelId.slice(0, 8)}`);
    }

    async connect(): Promise<TunnelInfo> {
        if (this.isConnecting) {
            throw new Error('Already connecting');
        }

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            throw new Error('Already connected');
        }

        this.isConnecting = true;
        this.shouldReconnect = true;

        return new Promise((resolve, reject) => {
            try {
                const wsUrl = new URL(this.options.relayServer);
                wsUrl.searchParams.set('tunnelId', this.options.tunnelId);
                wsUrl.searchParams.set('port', this.options.localPort.toString());
                if (this.options.subdomain) {
                    wsUrl.searchParams.set('subdomain', this.options.subdomain);
                }

                this.logger.info(`Connecting to relay server: ${wsUrl.toString()}`);

                this.ws = new WebSocket(wsUrl.toString());

                const connectionTimeout = setTimeout(() => {
                    if (this.isConnecting) {
                        this.isConnecting = false;
                        this.ws?.terminate();
                        reject(new Error('Connection timeout'));
                    }
                }, 30000);

                this.ws.on('open', () => {
                    this.logger.info('WebSocket connection established');
                    this.reconnectAttempts = 0;
                    this.startPingInterval();
                });

                this.ws.on('message', (data: Buffer) => {
                    try {
                        const message: RelayMessage = JSON.parse(data.toString());
                        this.handleMessage(message, resolve, reject, connectionTimeout);
                    } catch (error) {
                        this.logger.error(`Failed to parse message: ${error}`);
                    }
                });

                this.ws.on('close', (code: number, reason: Buffer) => {
                    clearTimeout(connectionTimeout);
                    this.stopPingInterval();
                    this.isConnecting = false;
                    
                    this.logger.info(`WebSocket closed: ${code} - ${reason.toString()}`);
                    
                    if (this.shouldReconnect && this.options.autoReconnect) {
                        this.attemptReconnect();
                    } else {
                        this.emit('disconnected');
                    }
                });

                this.ws.on('error', (error: Error) => {
                    clearTimeout(connectionTimeout);
                    this.logger.error(`WebSocket error: ${error.message}`);
                    
                    if (this.isConnecting) {
                        this.isConnecting = false;
                        reject(error);
                    } else {
                        this.emit('error', error);
                    }
                });

            } catch (error) {
                this.isConnecting = false;
                reject(error);
            }
        });
    }

    private handleMessage(
        message: RelayMessage,
        resolve: (info: TunnelInfo) => void,
        reject: (error: Error) => void,
        connectionTimeout: NodeJS.Timeout
    ): void {
        switch (message.type) {
            case 'connected':
                clearTimeout(connectionTimeout);
                this.isConnecting = false;
                
                this.tunnelInfo = {
                    id: this.options.tunnelId,
                    localPort: this.options.localPort,
                    publicUrl: message.publicUrl,
                    subdomain: message.subdomain,
                    connectedAt: new Date(),
                    requestCount: 0
                };
                
                this.logger.info(`Tunnel established: ${message.publicUrl}`);
                this.emit('connected', this.tunnelInfo);
                resolve(this.tunnelInfo);
                break;

            case 'error':
                clearTimeout(connectionTimeout);
                this.isConnecting = false;
                const error = new Error(message.message || 'Unknown error');
                this.emit('error', error);
                reject(error);
                break;

            case 'request':
                this.handleHttpRequest(message as unknown as HttpRequest);
                break;

            case 'ping':
                this.send({ type: 'pong' });
                break;

            default:
                this.logger.warn(`Unknown message type: ${message.type}`);
        }
    }

    private async handleHttpRequest(request: HttpRequest): Promise<void> {
        const startTime = Date.now();
        this.requestCount++;
        
        if (this.tunnelInfo) {
            this.tunnelInfo.requestCount = this.requestCount;
        }

        const requestInfo: RequestInfo = {
            id: request.requestId,
            tunnelId: this.options.tunnelId,
            method: request.method,
            path: request.path,
            headers: request.headers,
            timestamp: new Date()
        };

        this.logger.info(`Incoming request: ${request.method} ${request.path}`);
        this.emit('request', requestInfo);

        try {
            const response = await this.proxyRequest(request);
            
            requestInfo.status = response.statusCode;
            requestInfo.duration = Date.now() - startTime;

            this.send({
                type: 'response',
                requestId: request.requestId,
                statusCode: response.statusCode,
                headers: response.headers,
                body: response.body
            });

        } catch (error) {
            this.logger.error(`Proxy error: ${error}`);
            
            requestInfo.status = 502;
            requestInfo.duration = Date.now() - startTime;

            this.send({
                type: 'response',
                requestId: request.requestId,
                statusCode: 502,
                headers: { 'Content-Type': 'text/plain' },
                body: `Error connecting to localhost:${this.options.localPort}\n\nMake sure your local server is running.`
            });
        }
    }

    private proxyRequest(request: HttpRequest): Promise<{
        statusCode: number;
        headers: Record<string, string>;
        body: string;
    }> {
        return new Promise((resolve, reject) => {
            const url = `http://localhost:${this.options.localPort}${request.path}`;
            
            // Prepare headers, removing problematic ones
            const headers: Record<string, string> = { ...request.headers };
            delete headers['host'];
            delete headers['connection'];
            delete headers['keep-alive'];

            const options: http.RequestOptions = {
                hostname: 'localhost',
                port: this.options.localPort,
                path: request.path,
                method: request.method,
                headers
            };

            const req = http.request(options, (res) => {
                const chunks: Buffer[] = [];
                
                res.on('data', (chunk: Buffer) => {
                    chunks.push(chunk);
                });

                res.on('end', () => {
                    const body = Buffer.concat(chunks);
                    const headers: Record<string, string> = {};
                    
                    for (const [key, value] of Object.entries(res.headers)) {
                        if (value) {
                            headers[key] = Array.isArray(value) ? value.join(', ') : value;
                        }
                    }

                    // Remove problematic headers
                    delete headers['transfer-encoding'];
                    delete headers['connection'];

                    resolve({
                        statusCode: res.statusCode || 200,
                        headers,
                        body: body.toString('base64')
                    });
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.setTimeout(30000, () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            if (request.body) {
                const bodyBuffer = Buffer.from(request.body, 'base64');
                req.write(bodyBuffer);
            }

            req.end();
        });
    }

    private startPingInterval(): void {
        this.stopPingInterval();
        this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.ping();
            }
        }, 30000);
    }

    private stopPingInterval(): void {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    private attemptReconnect(): void {
        if (this.reconnectAttempts >= (this.options.maxReconnectAttempts || 5)) {
            this.logger.error('Max reconnect attempts reached');
            this.emit('disconnected');
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
        
        this.logger.info(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
        this.emit('reconnecting', this.reconnectAttempts);

        setTimeout(async () => {
            try {
                await this.connect();
            } catch (error) {
                this.logger.error(`Reconnect failed: ${error}`);
            }
        }, delay);
    }

    private send(message: RelayMessage): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }

    disconnect(): void {
        this.shouldReconnect = false;
        this.stopPingInterval();
        
        if (this.ws) {
            this.ws.close(1000, 'Client disconnect');
            this.ws = null;
        }
        
        this.tunnelInfo = null;
        this.emit('disconnected');
    }

    getTunnelInfo(): TunnelInfo | null {
        return this.tunnelInfo;
    }

    isConnected(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }
}
