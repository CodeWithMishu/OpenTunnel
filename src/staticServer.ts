/**
 * StaticServer - Built-in HTTP server that serves static files
 * 
 * This allows users to expose static HTML/CSS/JS projects without
 * needing to run a separate dev server like http-server or live-server.
 */

import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';
import * as net from 'net';
import { EventEmitter } from 'events';

// MIME types for common web files
const MIME_TYPES: Record<string, string> = {
    // HTML
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    
    // CSS
    '.css': 'text/css; charset=utf-8',
    
    // JavaScript
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.jsx': 'application/javascript; charset=utf-8',
    '.ts': 'application/typescript; charset=utf-8',
    '.tsx': 'application/typescript; charset=utf-8',
    
    // JSON
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    
    // Images
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.bmp': 'image/bmp',
    '.avif': 'image/avif',
    
    // Fonts
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.eot': 'application/vnd.ms-fontobject',
    
    // Video
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.ogv': 'video/ogg',
    '.mov': 'video/quicktime',
    
    // Audio
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac',
    '.oga': 'audio/ogg',
    
    // Documents
    '.pdf': 'application/pdf',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.xml': 'application/xml',
    
    // WebAssembly
    '.wasm': 'application/wasm',
    
    // Manifest files
    '.webmanifest': 'application/manifest+json',
    '.manifest': 'text/cache-manifest',
    
    // Other
    '.zip': 'application/zip',
    '.gz': 'application/gzip',
    '.tar': 'application/x-tar',
};

export interface StaticServerOptions {
    rootDir: string;
    port?: number;
    host?: string;
    indexFile?: string;
    spa?: boolean; // Single Page Application mode - fallback to index.html
    cors?: boolean;
}

export interface StaticServerInfo {
    port: number;
    host: string;
    rootDir: string;
    url: string;
    startedAt: Date;
    requestCount: number;
}

export class StaticServer extends EventEmitter {
    private server: http.Server | null = null;
    private options: Required<StaticServerOptions>;
    private port: number = 0;
    private requestCount: number = 0;
    private startedAt: Date = new Date();

    constructor(options: StaticServerOptions) {
        super();
        this.options = {
            rootDir: options.rootDir,
            port: options.port || 0, // 0 = auto-assign
            host: options.host || '127.0.0.1',
            indexFile: options.indexFile || 'index.html',
            spa: options.spa !== undefined ? options.spa : false,
            cors: options.cors !== undefined ? options.cors : true,
        };
    }

    async start(): Promise<StaticServerInfo> {
        return new Promise((resolve, reject) => {
            // Validate root directory
            if (!fs.existsSync(this.options.rootDir)) {
                reject(new Error(`Directory does not exist: ${this.options.rootDir}`));
                return;
            }

            this.server = http.createServer((req, res) => {
                this.handleRequest(req, res);
            });

            this.server.on('error', (err: NodeJS.ErrnoException) => {
                if (err.code === 'EADDRINUSE') {
                    // Try another port
                    this.options.port = 0;
                    this.server?.listen(0, this.options.host);
                } else {
                    reject(err);
                }
            });

            this.server.listen(this.options.port, this.options.host, () => {
                const addr = this.server?.address() as net.AddressInfo;
                this.port = addr.port;
                this.startedAt = new Date();
                
                const info = this.getInfo();
                this.emit('started', info);
                resolve(info);
            });
        });
    }

    stop(): void {
        if (this.server) {
            this.server.close();
            this.server = null;
            this.emit('stopped');
        }
    }

    getInfo(): StaticServerInfo {
        return {
            port: this.port,
            host: this.options.host,
            rootDir: this.options.rootDir,
            url: `http://${this.options.host}:${this.port}`,
            startedAt: this.startedAt,
            requestCount: this.requestCount,
        };
    }

    getPort(): number {
        return this.port;
    }

    isRunning(): boolean {
        return this.server !== null;
    }

    private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
        this.requestCount++;
        
        const parsedUrl = url.parse(req.url || '/', true);
        let pathname = decodeURIComponent(parsedUrl.pathname || '/');

        // Security: prevent directory traversal attacks
        pathname = path.normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '');
        
        let filePath = path.join(this.options.rootDir, pathname);

        // Handle directory requests
        if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
            filePath = path.join(filePath, this.options.indexFile);
        }

        // CORS headers
        if (this.options.cors) {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', '*');
            
            // Handle preflight requests
            if (req.method === 'OPTIONS') {
                res.writeHead(204);
                res.end();
                return;
            }
        }

        // Serve the file
        this.serveFile(filePath, pathname, req, res);
    }

    private serveFile(
        filePath: string,
        pathname: string,
        req: http.IncomingMessage,
        res: http.ServerResponse
    ): void {
        fs.stat(filePath, (err, stats) => {
            if (err || !stats.isFile()) {
                // File not found - try SPA fallback
                if (this.options.spa) {
                    const indexPath = path.join(this.options.rootDir, this.options.indexFile);
                    if (fs.existsSync(indexPath)) {
                        this.sendFile(indexPath, res);
                        return;
                    }
                }
                
                // 404 Not Found
                res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(`
                    <!DOCTYPE html>
                    <html>
                    <head><title>404 Not Found</title></head>
                    <body style="font-family: system-ui; text-align: center; padding: 50px;">
                        <h1>404 Not Found</h1>
                        <p>The requested file was not found: ${pathname}</p>
                        <hr>
                        <p><small>OpenTunnel Static Server</small></p>
                    </body>
                    </html>
                `);
                return;
            }

            this.sendFile(filePath, res, stats);
        });
    }

    private sendFile(filePath: string, res: http.ServerResponse, stats?: fs.Stats): void {
        const ext = path.extname(filePath).toLowerCase();
        const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

        // Read and send file
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Internal Server Error');
                return;
            }

            // Cache headers for static assets
            const isAsset = ['.css', '.js', '.png', '.jpg', '.gif', '.woff2', '.woff'].includes(ext);
            
            res.writeHead(200, {
                'Content-Type': mimeType,
                'Content-Length': data.length,
                'Cache-Control': isAsset ? 'public, max-age=3600' : 'no-cache',
                'X-Content-Type-Options': 'nosniff',
            });
            
            res.end(data);
        });
    }
}

/**
 * StaticServerManager - Manages multiple static servers
 */
export class StaticServerManager {
    private servers: Map<number, StaticServer> = new Map();

    async startServer(options: StaticServerOptions): Promise<StaticServerInfo> {
        const server = new StaticServer(options);
        const info = await server.start();
        this.servers.set(info.port, server);
        return info;
    }

    stopServer(port: number): void {
        const server = this.servers.get(port);
        if (server) {
            server.stop();
            this.servers.delete(port);
        }
    }

    stopAllServers(): void {
        for (const server of this.servers.values()) {
            server.stop();
        }
        this.servers.clear();
    }

    getRunningServers(): StaticServerInfo[] {
        const infos: StaticServerInfo[] = [];
        for (const server of this.servers.values()) {
            if (server.isRunning()) {
                infos.push(server.getInfo());
            }
        }
        return infos;
    }

    getServerByPort(port: number): StaticServer | undefined {
        return this.servers.get(port);
    }
}

// Singleton instance
let staticServerManager: StaticServerManager | null = null;

export function getStaticServerManager(): StaticServerManager {
    if (!staticServerManager) {
        staticServerManager = new StaticServerManager();
    }
    return staticServerManager;
}

/**
 * Find a free port on the system
 */
export async function findFreePort(startPort: number = 8000): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.on('error', () => {
            // Port in use, try next
            findFreePort(startPort + 1).then(resolve).catch(reject);
        });
        server.listen(startPort, '127.0.0.1', () => {
            const port = (server.address() as net.AddressInfo).port;
            server.close(() => resolve(port));
        });
    });
}
