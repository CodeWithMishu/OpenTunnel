/**
 * OpenTunnel Relay Server
 * 
 * Uses PATH-BASED routing (not subdomain-based) so URLs work from any device
 * on the same network. URLs look like: http://<machine-ip>:8080/t/<slug>/
 * 
 * Self-hostable and open-source.
 */

import http from 'http';
import https from 'https';
import fs from 'fs';
import os from 'os';
import { URL } from 'url';
import WebSocket, { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';

// Configuration
const config = {
    port: parseInt(process.env.PORT || '8080', 10),
    httpsPort: parseInt(process.env.HTTPS_PORT || '8443', 10),
    useHttps: process.env.USE_HTTPS === 'true',
    sslCert: process.env.SSL_CERT || '',
    sslKey: process.env.SSL_KEY || '',
    maxTunnels: parseInt(process.env.MAX_TUNNELS || '1000', 10),
    requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '30000', 10),
    logLevel: process.env.LOG_LEVEL || 'info',
    // PUBLIC_URL overrides auto-detected base URL.
    // Set this when deploying to cloud, e.g. https://opentunnel.onrender.com
    publicUrl: process.env.PUBLIC_URL || ''
};

// Types
interface TunnelConnection {
    ws: WebSocket;
    tunnelId: string;
    slug: string;
    localPort: number;
    connectedAt: Date;
    requestCount: number;
    pendingRequests: Map<string, PendingRequest>;
}

interface PendingRequest {
    resolve: (response: TunnelResponse) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
    startTime: number;
}

interface TunnelResponse {
    statusCode: number;
    headers: Record<string, string>;
    body: string; // Base64 encoded
}

// Storage
const tunnels: Map<string, TunnelConnection> = new Map();
const slugToTunnel: Map<string, string> = new Map();

// Logger
function log(level: string, message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    if (data) {
        console.log(logMessage, JSON.stringify(data));
    } else {
        console.log(logMessage);
    }
}

// Get machine's LAN IP address
function getLanIp(): string {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        const nets = interfaces[name];
        if (!nets) continue;
        for (const net of nets) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return '127.0.0.1';
}

/**
 * Determine the public-facing base URL for tunnel links.
 * Priority: PUBLIC_URL env var > Host header > LAN IP fallback
 */
function getBaseUrl(hostHeader?: string): string {
    // 1. Explicit PUBLIC_URL env var (set when deploying to cloud)
    if (config.publicUrl) {
        return config.publicUrl.replace(/\/$/, ''); // strip trailing slash
    }

    // 2. Derive from the incoming request's Host header
    //    Cloud platforms (Render, Railway, Fly, Heroku) set this correctly.
    if (hostHeader) {
        // If Host includes a well-known cloud domain, trust it and use https
        const cloudPatterns = ['.onrender.com', '.railway.app', '.fly.dev',
            '.herokuapp.com', '.vercel.app', '.up.railway.app', '.azurewebsites.net'];
        const isCloud = cloudPatterns.some(p => hostHeader.includes(p));
        if (isCloud) {
            return `https://${hostHeader}`;
        }
        // Otherwise use the Host header with the current protocol
        const protocol = config.useHttps ? 'https' : 'http';
        return `${protocol}://${hostHeader}`;
    }

    // 3. Fallback: LAN IP + port
    const lanIp = getLanIp();
    const activePort = config.useHttps ? config.httpsPort : config.port;
    const protocol = config.useHttps ? 'https' : 'http';
    return `${protocol}://${lanIp}:${activePort}`;
}

// Generate a random slug for tunnel URL paths
function generateSlug(): string {
    const adjectives = [
        'swift', 'bright', 'calm', 'eager', 'fancy', 'gentle', 'happy',
        'jolly', 'kind', 'lively', 'merry', 'nice', 'proud', 'quick',
        'royal', 'super', 'tiny', 'ultra', 'vivid', 'warm', 'young', 'zesty'
    ];
    const nouns = [
        'apple', 'beach', 'cloud', 'dream', 'eagle', 'flame', 'grove',
        'heart', 'island', 'jewel', 'kite', 'lake', 'moon', 'nest',
        'ocean', 'pearl', 'quest', 'river', 'star', 'tree', 'wave', 'zen'
    ];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(Math.random() * 1000);
    return `${adj}-${noun}-${num}`;
}

// Get a unique slug
function getUniqueSlug(requested?: string): string {
    if (requested) {
        const sanitized = requested.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 63);
        if (sanitized && !slugToTunnel.has(sanitized)) {
            return sanitized;
        }
    }
    let slug: string;
    let attempts = 0;
    do {
        slug = generateSlug();
        attempts++;
    } while (slugToTunnel.has(slug) && attempts < 100);
    return slug;
}

// Create WebSocket server
function createWebSocketServer(server: http.Server | https.Server): void {
    const wss = new WebSocketServer({ server, path: '/tunnel' });

    wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
        const url = new URL(req.url || '', `http://${req.headers.host}`);
        const tunnelId = url.searchParams.get('tunnelId') || uuidv4();
        const localPort = parseInt(url.searchParams.get('port') || '3000', 10);
        const requestedSlug = url.searchParams.get('subdomain') || undefined;

        if (tunnels.size >= config.maxTunnels) {
            log('warn', 'Max tunnels reached, rejecting connection');
            ws.send(JSON.stringify({ type: 'error', message: 'Server at capacity. Please try again later.' }));
            ws.close();
            return;
        }

        const slug = getUniqueSlug(requestedSlug);
        const baseUrl = getBaseUrl(req.headers.host);
        const publicUrl = `${baseUrl}/t/${slug}`;

        const connection: TunnelConnection = {
            ws,
            tunnelId,
            slug,
            localPort,
            connectedAt: new Date(),
            requestCount: 0,
            pendingRequests: new Map()
        };

        tunnels.set(tunnelId, connection);
        slugToTunnel.set(slug, tunnelId);

        log('info', `Tunnel connected: /t/${slug} -> localhost:${localPort}`, { tunnelId });

        // Send connection confirmation
        ws.send(JSON.stringify({
            type: 'connected',
            tunnelId,
            subdomain: slug,
            publicUrl
        }));

        // Handle messages from client
        ws.on('message', (data: Buffer) => {
            try {
                const message = JSON.parse(data.toString());
                handleClientMessage(connection, message);
            } catch (error) {
                log('error', 'Failed to parse client message');
            }
        });

        // Handle disconnection
        ws.on('close', () => {
            log('info', `Tunnel disconnected: /t/${slug}`, { tunnelId });
            for (const [, pending] of connection.pendingRequests) {
                clearTimeout(pending.timeout);
                pending.reject(new Error('Tunnel disconnected'));
            }
            tunnels.delete(tunnelId);
            slugToTunnel.delete(slug);
        });

        ws.on('error', (error) => {
            log('error', `WebSocket error for tunnel /t/${slug}: ${error.message}`);
        });

        // Keep-alive ping
        const pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, 30000);

        ws.on('close', () => clearInterval(pingInterval));
    });

    log('info', 'WebSocket server initialized');
}

// Handle messages from tunnel client
function handleClientMessage(connection: TunnelConnection, message: any): void {
    switch (message.type) {
        case 'response':
            handleTunnelResponse(connection, message);
            break;
        case 'pong':
            break;
        default:
            log('warn', `Unknown message type from client: ${message.type}`);
    }
}

// Handle response from tunnel client
function handleTunnelResponse(connection: TunnelConnection, message: any): void {
    const { requestId, statusCode, headers, body } = message;
    const pending = connection.pendingRequests.get(requestId);
    if (pending) {
        clearTimeout(pending.timeout);
        connection.pendingRequests.delete(requestId);
        pending.resolve({
            statusCode: statusCode || 200,
            headers: headers || {},
            body: body || ''
        });
    }
}

// Forward HTTP request to tunnel client
async function forwardRequest(
    connection: TunnelConnection,
    method: string,
    path: string,
    headers: Record<string, string>,
    body: Buffer
): Promise<TunnelResponse> {
    const requestId = uuidv4();
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            connection.pendingRequests.delete(requestId);
            reject(new Error('Request timeout'));
        }, config.requestTimeout);

        connection.pendingRequests.set(requestId, { resolve, reject, timeout, startTime: Date.now() });

        connection.ws.send(JSON.stringify({
            type: 'request',
            requestId,
            method,
            path,
            headers,
            body: body.toString('base64')
        }));
        connection.requestCount++;
    });
}

// Render the landing/404 page
function renderNotFoundPage(slug: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OpenTunnel - Tunnel Not Found</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
display:flex;justify-content:center;align-items:center;height:100vh;
background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff}
.card{text-align:center;padding:50px 40px;background:rgba(255,255,255,.12);
border-radius:24px;backdrop-filter:blur(16px);max-width:480px;width:90%}
h1{font-size:2.6em;margin-bottom:8px}
p{font-size:1.1em;opacity:.88;margin-top:12px;line-height:1.5}
code{background:rgba(0,0,0,.25);padding:4px 14px;border-radius:6px;font-size:.95em}
a{color:#fff;text-decoration:underline}
</style>
</head>
<body>
<div class="card">
<h1>🚀 OpenTunnel</h1>
<p>Tunnel <code>${slug}</code> is not active.</p>
<p>The tunnel may have been stopped, or the URL is incorrect.</p>
<p style="margin-top:24px"><a href="https://github.com/opentunnel/opentunnel">Learn more about OpenTunnel</a></p>
</div>
</body>
</html>`;
}

// Render the home/status page
function renderHomePage(hostHeader?: string): string {
    const baseUrl = getBaseUrl(hostHeader);
    const tunnelList = Array.from(tunnels.values()).map(t =>
        `<tr><td><a href="/t/${t.slug}" style="color:#fff">${baseUrl}/t/${t.slug}</a></td><td>${t.localPort}</td><td>${t.requestCount}</td></tr>`
    ).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OpenTunnel Relay Server</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;min-height:100vh;
display:flex;justify-content:center;align-items:center;padding:24px}
.card{text-align:center;padding:50px 40px;background:rgba(255,255,255,.12);
border-radius:24px;backdrop-filter:blur(16px);max-width:700px;width:100%}
h1{font-size:2.6em;margin-bottom:8px}
p{font-size:1.05em;opacity:.88;margin-top:12px;line-height:1.5}
table{width:100%;margin-top:20px;border-collapse:collapse}
th,td{padding:10px;text-align:left;border-bottom:1px solid rgba(255,255,255,.2)}
th{opacity:.7;font-size:.85em;text-transform:uppercase}
td a{word-break:break-all}
code{background:rgba(0,0,0,.25);padding:2px 8px;border-radius:4px;font-size:.9em}
.status{display:inline-block;background:rgba(73,204,144,.3);border:1px solid #49cc90;
padding:4px 16px;border-radius:20px;font-size:.9em;margin-top:8px}
</style>
</head>
<body>
<div class="card">
<h1>🚀 OpenTunnel</h1>
<p class="status">✅ Relay server online</p>
<p>Server: <code>${baseUrl}</code> &nbsp;|&nbsp; Active tunnels: <strong>${tunnels.size}</strong></p>
${tunnels.size > 0 ? `<table><thead><tr><th>Public URL</th><th>Local Port</th><th>Requests</th></tr></thead><tbody>${tunnelList}</tbody></table>` : '<p style="margin-top:24px;opacity:.6">No active tunnels right now.</p>'}
</div>
</body>
</html>`;
}

// Main HTTP request handler — PATH-BASED routing
function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const urlPath = req.url || '/';

    // Health check
    if (urlPath === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', tunnels: tunnels.size, uptime: process.uptime() }));
        return;
    }

    // Stats API
    if (urlPath === '/stats') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ activeTunnels: tunnels.size, maxTunnels: config.maxTunnels, uptime: process.uptime() }));
        return;
    }

    // Home page
    if (urlPath === '/' || urlPath === '') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(renderHomePage(req.headers.host));
        return;
    }

    // ---- Path-based tunnel routing: /t/<slug>/...  ----
    const tunnelMatch = urlPath.match(/^\/t\/([a-z0-9-]+)(\/.*)?$/);

    if (!tunnelMatch) {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end(renderNotFoundPage(urlPath));
        return;
    }

    const slug = tunnelMatch[1];
    const forwardPath = tunnelMatch[2] || '/';

    const tunnelId = slugToTunnel.get(slug);
    const connection = tunnelId ? tunnels.get(tunnelId) : undefined;

    if (!connection) {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end(renderNotFoundPage(slug));
        return;
    }

    if (connection.ws.readyState !== WebSocket.OPEN) {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Tunnel connection lost. Please try again.');
        return;
    }

    // Collect request body
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));

    req.on('end', async () => {
        const body = Buffer.concat(chunks);

        // Prepare headers
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.headers)) {
            if (value) {
                headers[key] = Array.isArray(value) ? value.join(', ') : value;
            }
        }

        try {
            const response = await forwardRequest(connection, req.method || 'GET', forwardPath, headers, body);

            // Decode the body
            let responseBody: Buffer | null = null;
            if (response.body) {
                responseBody = Buffer.from(response.body, 'base64');
            }

            // Check if this is an HTML response - rewrite URLs for proper asset loading
            const contentType = response.headers['content-type'] || '';
            if (contentType.includes('text/html') && responseBody) {
                const tunnelBase = `/t/${slug}`;
                let html = responseBody.toString('utf-8');
                
                // Step 1: Inject URL rewriting script FIRST (before any other scripts run)
                // This must be the VERY FIRST script in the document to catch all dynamic requests
                const urlRewriteScript = `<script data-opentunnel-injected="true">
(function() {
    if (window.__opentunnelInitialized) return;
    window.__opentunnelInitialized = true;
    
    var tunnelBase = "${tunnelBase}";
    
    // Helper to rewrite URLs
    function rewriteUrl(url) {
        if (typeof url !== 'string') return url;
        if (url.startsWith('/') && !url.startsWith('//') && !url.startsWith(tunnelBase + '/') && url !== tunnelBase) {
            return tunnelBase + url;
        }
        return url;
    }
    
    // Patch fetch
    var originalFetch = window.fetch;
    window.fetch = function(input, init) {
        if (typeof input === 'string') {
            input = rewriteUrl(input);
        } else if (input && input.url) {
            input = new Request(rewriteUrl(input.url), input);
        }
        return originalFetch.call(this, input, init);
    };
    
    // Patch XMLHttpRequest
    var originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        arguments[1] = rewriteUrl(url);
        return originalXHROpen.apply(this, arguments);
    };
    
    // Patch history for SPA routing
    var originalPushState = history.pushState;
    history.pushState = function(state, title, url) {
        if (url) arguments[2] = rewriteUrl(url);
        return originalPushState.apply(this, arguments);
    };
    var originalReplaceState = history.replaceState;
    history.replaceState = function(state, title, url) {
        if (url) arguments[2] = rewriteUrl(url);
        return originalReplaceState.apply(this, arguments);
    };
    
    // Patch DOM element property setters
    var patchProp = function(proto, prop) {
        var desc = Object.getOwnPropertyDescriptor(proto, prop);
        if (desc && desc.set) {
            Object.defineProperty(proto, prop, {
                set: function(val) { desc.set.call(this, rewriteUrl(val)); },
                get: desc.get
            });
        }
    };
    patchProp(HTMLImageElement.prototype, 'src');
    patchProp(HTMLScriptElement.prototype, 'src');
    patchProp(HTMLLinkElement.prototype, 'href');
    
    // Patch WebSocket — allow Vite HMR to fail gracefully
    var OriginalWebSocket = window.WebSocket;
    window.WebSocket = function(url, protocols) {
        try {
            if (url && typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) {
                var loc = window.location;
                var wsProto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
                url = wsProto + '//' + loc.host + rewriteUrl(url);
            }
            return protocols ? new OriginalWebSocket(url, protocols) : new OriginalWebSocket(url);
        } catch(e) {
            console.warn('[OpenTunnel] WebSocket suppressed:', e.message);
            // Return a dummy WebSocket-like object so Vite HMR does not crash
            return { readyState: 3, send: function(){}, close: function(){}, addEventListener: function(){}, removeEventListener: function(){}, OPEN: 1, CLOSED: 3 };
        }
    };
    window.WebSocket.prototype = OriginalWebSocket.prototype;
    window.WebSocket.CONNECTING = 0; window.WebSocket.OPEN = 1;
    window.WebSocket.CLOSING = 2;    window.WebSocket.CLOSED = 3;
    
    // Patch EventSource
    if (window.EventSource) {
        var OrigES = window.EventSource;
        window.EventSource = function(url, c) { return new OrigES(rewriteUrl(url), c); };
        window.EventSource.prototype = OrigES.prototype;
    }
    
    console.log('[OpenTunnel] URL rewriting active for:', tunnelBase);
})();
</script>`;
                
                // Step 2: Rewrite absolute URL attributes in HTML tags
                html = html.replace(new RegExp(`(src|href|action)=(["'])/(?!/|t/${slug}/)`, 'g'), `$1=$2${tunnelBase}/`);
                html = html.replace(new RegExp(`srcset=(["'])/(?!/|t/${slug}/)`, 'g'), `srcset=$1${tunnelBase}/`);
                html = html.replace(new RegExp(`data-src=(["'])/(?!/|t/${slug}/)`, 'g'), `data-src=$1${tunnelBase}/`);
                html = html.replace(new RegExp(`url\\((["']?)/(?!/|t/${slug}/)`, 'g'), `url($1${tunnelBase}/`);
                html = html.replace(new RegExp(`content=(["'])/(?!/|t/${slug}/)`, 'g'), `content=$1${tunnelBase}/`);
                
                // Step 3: CRITICAL — rewrite import statements INSIDE inline <script type="module"> blocks
                // Vite injects: <script type="module">import { x } from "/@react-refresh"</script>
                // These inline imports MUST be rewritten or the browser will 404 on them
                html = html.replace(
                    /(<script[^>]*type\s*=\s*["']module["'][^>]*>)([\s\S]*?)(<\/script>)/gi,
                    (match: string, openTag: string, scriptBody: string, closeTag: string) => {
                        // Rewrite import ... from "/..." patterns inside the inline module
                        let rewritten = scriptBody.replace(
                            new RegExp(`from\\s*(["'])/(?!/|t/${slug}/)`, 'g'),
                            `from $1${tunnelBase}/`
                        );
                        // Rewrite bare side-effect imports: import "/path"
                        rewritten = rewritten.replace(
                            new RegExp(`import\\s+(["'])/(?!/|t/${slug}/)`, 'g'),
                            `import $1${tunnelBase}/`
                        );
                        // Rewrite import("/...") dynamic imports
                        rewritten = rewritten.replace(
                            new RegExp(`import\\(\\s*(["'])/(?!/|t/${slug}/)`, 'g'),
                            `import($1${tunnelBase}/`
                        );
                        return openTag + rewritten + closeTag;
                    }
                );
                
                // Step 4: Inject our script at the VERY beginning of <head>
                if (html.match(/<head[^>]*>/i)) {
                    html = html.replace(/<head([^>]*)>/i, `<head$1>${urlRewriteScript}`);
                } else if (html.match(/<html[^>]*>/i)) {
                    html = html.replace(/<html([^>]*)>/i, `<html$1><head>${urlRewriteScript}</head>`);
                } else if (html.match(/<body[^>]*>/i)) {
                    html = html.replace(/<body([^>]*)>/i, `<body$1>${urlRewriteScript}`);
                } else {
                    html = urlRewriteScript + html;
                }
                
                responseBody = Buffer.from(html, 'utf-8');
                response.headers['content-length'] = responseBody.length.toString();
            }

            // Also rewrite JavaScript/TypeScript files for ES module imports
            // Vite and other bundlers use import statements with absolute paths
            if ((contentType.includes('javascript') || contentType.includes('typescript')) && responseBody) {
                const tunnelBase = `/t/${slug}`;
                let js = responseBody.toString('utf-8');
                
                const avoidPrefix = `/(?!/|t/${slug}/)`;
                
                // Rewrite import ... from "/..."
                js = js.replace(new RegExp(`from\\s*(['"])${avoidPrefix}`, 'g'), `from $1${tunnelBase}/`);
                                // Rewrite bare side-effect imports: import "/path" (Vite uses these for CSS and env)
                js = js.replace(new RegExp(`import\\s+(['"])${avoidPrefix}`, 'g'), `import $1${tunnelBase}/`);
                                // Rewrite dynamic imports: import("/path")
                js = js.replace(new RegExp(`import\\(\\s*(['"\`])${avoidPrefix}`, 'g'), `import($1${tunnelBase}/`);
                
                // Rewrite fetch calls: fetch("/api/...")
                js = js.replace(new RegExp(`fetch\\(\\s*(['"\`])${avoidPrefix}`, 'g'), `fetch($1${tunnelBase}/`);
                
                // Rewrite new URL("/path", ...)
                js = js.replace(new RegExp(`new\\s+URL\\(\\s*(['"\`])${avoidPrefix}`, 'g'), `new URL($1${tunnelBase}/`);
                
                // Rewrite sourceMappingURL
                js = js.replace(new RegExp(`//# sourceMappingURL=${avoidPrefix}`, 'g'), `//# sourceMappingURL=${tunnelBase}/`);
                
                // SPECIAL: Handle Vite's @vite/client and @react-refresh
                // Their WebSocket connections will fail through a tunnel and crash the entire app.
                // We wrap WebSocket creation in try-catch so HMR failure doesn't kill the page.
                if (forwardPath.includes('@vite/client')) {
                    // Store original WebSocket ref before our HTML-injected patch
                    js = `if(!window.__OrigWS)window.__OrigWS=WebSocket;\n` + js;
                    // Replace all new WebSocket(...) with a safe wrapper
                    js = js.replace(
                        /new\s+WebSocket\s*\(/g, 
                        `new (function(__wsUrl,__wsPr){try{return new(window.__OrigWS||WebSocket)(__wsUrl,__wsPr)}catch(e){console.warn("[OpenTunnel] HMR suppressed");return{readyState:3,send:function(){},close:function(){},addEventListener:function(t,h){if(t==="close"||t==="error")setTimeout(function(){try{h({type:t})}catch(e){}},100)},removeEventListener:function(){},OPEN:1,CLOSED:3}}})(` 
                    );
                }
                
                responseBody = Buffer.from(js, 'utf-8');
                response.headers['content-length'] = responseBody.length.toString();
            }

            // Rewrite CSS files for url() references
            if (contentType.includes('text/css') && responseBody) {
                const tunnelBase = `/t/${slug}`;
                let css = responseBody.toString('utf-8');
                
                // Rewrite url(/...) references
                css = css.replace(/url\(["']?\/(?!\/)/g, `url(${tunnelBase}/`);
                
                // Rewrite @import "/..."
                css = css.replace(/@import\s+["']\/(?!\/)/g, `@import "${tunnelBase}/`);
                
                responseBody = Buffer.from(css, 'utf-8');
                response.headers['content-length'] = responseBody.length.toString();
            }

            // Set response headers
            for (const [key, value] of Object.entries(response.headers)) {
                if (['transfer-encoding', 'connection', 'keep-alive'].includes(key.toLowerCase())) continue;
                res.setHeader(key, value);
            }

            res.writeHead(response.statusCode);
            if (responseBody) {
                res.end(responseBody);
            } else {
                res.end();
            }
        } catch (error: any) {
            log('error', `Forward failed: ${error.message}`);
            res.writeHead(502, { 'Content-Type': 'text/plain' });
            res.end('Failed to reach local server. Make sure your dev server is running.');
        }
    });

    req.on('error', (error) => {
        log('error', `Request error: ${error.message}`);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal server error');
    });
}

// Create HTTP server
function createHttpServer(): http.Server {
    return http.createServer(handleRequest);
}

// Main startup
function main(): void {
    const lanIp = getLanIp();

    log('info', '🚀 OpenTunnel Relay Server starting...');
    log('info', `Configuration:`, { port: config.port, lanIp, useHttps: config.useHttps, maxTunnels: config.maxTunnels });

    let server: http.Server | https.Server;

    if (config.useHttps && config.sslCert && config.sslKey) {
        try {
            server = https.createServer({
                cert: fs.readFileSync(config.sslCert),
                key: fs.readFileSync(config.sslKey)
            }, handleRequest);
            server.listen(config.httpsPort, '0.0.0.0', () => {
                log('info', `HTTPS server listening on 0.0.0.0:${config.httpsPort}`);
            });
        } catch (error) {
            log('error', 'SSL failed, falling back to HTTP');
            server = createHttpServer();
            server.listen(config.port, '0.0.0.0', () => {
                log('info', `HTTP server listening on 0.0.0.0:${config.port}`);
            });
        }
    } else {
        server = createHttpServer();
        server.listen(config.port, '0.0.0.0', () => {
            log('info', `HTTP server listening on 0.0.0.0:${config.port}`);
        });
    }

    createWebSocketServer(server);

    // Graceful shutdown
    const shutdown = (signal: string) => {
        log('info', `Received ${signal}, shutting down...`);
        for (const connection of tunnels.values()) {
            connection.ws.close(1001, 'Server shutting down');
        }
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(1), 5000);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    const baseUrl = getBaseUrl();
    log('info', '✅ OpenTunnel Relay Server ready!');
    log('info', `Open in browser: ${baseUrl}`);
    log('info', `Tunnel URLs will look like: ${baseUrl}/t/<slug>/`);
    if (config.publicUrl) {
        log('info', `Public URL (from env): ${config.publicUrl}`);
    } else {
        log('info', `No PUBLIC_URL set — using LAN IP. Set PUBLIC_URL env var for cloud deployments.`);
    }
}

main();
