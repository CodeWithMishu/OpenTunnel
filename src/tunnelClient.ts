/**
 * TunnelClient — powered by Cloudflare Quick Tunnels
 * 
 * Spawns `cloudflared tunnel --url http://localhost:PORT` and
 * parses stdout/stderr to extract the public URL.
 * No accounts, no API keys, no relay server needed.
 */

import { EventEmitter } from 'events';
import { ChildProcess, spawn } from 'child_process';
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
    cloudflaredPath: string;
}

export class TunnelClient extends EventEmitter {
    private options: TunnelClientOptions;
    private process: ChildProcess | null = null;
    private tunnelInfo: TunnelInfo | null = null;
    private logger: Logger;
    private requestCount: number = 0;
    private logLines: string[] = [];

    constructor(options: TunnelClientOptions) {
        super();
        this.options = options;
        this.logger = new Logger(`Tunnel:${options.tunnelId.slice(0, 8)}`);
    }

    /**
     * Start the cloudflared process and wait for the public URL.
     */
    async connect(): Promise<TunnelInfo> {
        if (this.process) {
            throw new Error('Already connected');
        }

        return new Promise((resolve, reject) => {
            const args = [
                'tunnel',
                '--url', `http://localhost:${this.options.localPort}`,
                '--no-autoupdate',
            ];

            this.logger.info(`Starting: ${this.options.cloudflaredPath} ${args.join(' ')}`);

            this.process = spawn(this.options.cloudflaredPath, args, {
                stdio: ['ignore', 'pipe', 'pipe'],
                env: { ...process.env, NO_AUTOUPDATE: 'true' },
            });

            let resolved = false;
            let output = '';

            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    this.logger.error('Timeout waiting for tunnel URL');
                    this.kill();
                    reject(new Error(
                        'Timeout waiting for cloudflared to start.\n' +
                        'Make sure a server is running on port ' + this.options.localPort + '.\n\n' +
                        'Recent output:\n' + output.slice(-300)
                    ));
                }
            }, 30000);

            const handleOutput = (data: Buffer) => {
                const text = data.toString();
                output += text;

                for (const line of text.split('\n')) {
                    const trimmed = line.trim();
                    if (trimmed) {
                        this.logLines.push(trimmed);
                        if (this.logLines.length > 200) { this.logLines.shift(); }
                    }
                }

                // Parse the trycloudflare.com URL
                const urlMatch = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
                if (urlMatch && !resolved) {
                    resolved = true;
                    clearTimeout(timeout);

                    const publicUrl = urlMatch[0];
                    this.tunnelInfo = {
                        id: this.options.tunnelId,
                        localPort: this.options.localPort,
                        publicUrl,
                        subdomain: publicUrl.replace('https://', '').replace('.trycloudflare.com', ''),
                        connectedAt: new Date(),
                        requestCount: 0,
                    };

                    this.logger.info(`Tunnel active: ${publicUrl} → localhost:${this.options.localPort}`);
                    this.emit('connected', this.tunnelInfo);
                    resolve(this.tunnelInfo);
                }

                this.parseRequestLogs(text);
            };

            this.process.stdout?.on('data', handleOutput);
            this.process.stderr?.on('data', handleOutput);

            this.process.on('error', (err) => {
                this.logger.error(`Process error: ${err.message}`);
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    reject(new Error(`cloudflared failed: ${err.message}`));
                }
                this.emit('error', err);
            });

            this.process.on('close', (code) => {
                this.logger.info(`cloudflared exited with code ${code}`);
                this.process = null;
                
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    reject(new Error(
                        `cloudflared exited unexpectedly (code ${code}).\n` +
                        output.slice(-500)
                    ));
                }
                
                this.emit('disconnected');
            });
        });
    }

    /**
     * Parse request logs from cloudflared output.
     */
    private parseRequestLogs(text: string): void {
        for (const line of text.split('\n')) {
            // Pattern: "status=200" and "method=GET" and "path=/..."
            const statusMatch = line.match(/status[=:]?\s*(\d{3})/i);
            const methodMatch = line.match(/method[=:]?\s*(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)/i);
            const pathMatch = line.match(/(?:path|url|origin)[=:]?\s*(\S+)/i);

            if (statusMatch && methodMatch) {
                this.requestCount++;
                if (this.tunnelInfo) { this.tunnelInfo.requestCount = this.requestCount; }
                
                const request: RequestInfo = {
                    id: `req-${Date.now()}-${this.requestCount}`,
                    tunnelId: this.options.tunnelId,
                    method: methodMatch[1],
                    path: pathMatch ? pathMatch[1] : '/',
                    headers: {},
                    status: parseInt(statusMatch[1], 10),
                    timestamp: new Date(),
                };
                this.emit('request', request);
            }
        }
    }

    disconnect(): void {
        this.kill();
        this.tunnelInfo = null;
        this.emit('disconnected');
    }

    private kill(): void {
        if (this.process) {
            try {
                this.process.kill('SIGTERM');
                const proc = this.process;
                setTimeout(() => {
                    try { proc.kill('SIGKILL'); } catch {}
                }, 3000);
            } catch {}
            this.process = null;
        }
    }

    getTunnelInfo(): TunnelInfo | null {
        return this.tunnelInfo;
    }

    isConnected(): boolean {
        return this.process !== null && this.tunnelInfo !== null;
    }

    getRecentLogs(): string[] {
        return [...this.logLines];
    }
}
