/**
 * Port Scanner - Auto-detect running local servers
 */

import * as net from 'net';
import { exec } from 'child_process';

export interface DetectedPort {
    port: number;
    name?: string;
}

// Well-known dev server ports with friendly names
const KNOWN_PORTS: Record<number, string> = {
    80: 'HTTP',
    443: 'HTTPS',
    1234: 'Parcel',
    3000: 'React / Express / Rails',
    3001: 'React (alt)',
    3333: 'AdonisJS',
    4000: 'Phoenix / Gatsby',
    4200: 'Angular',
    4321: 'Astro',
    5000: 'Flask / Python',
    5173: 'Vite',
    5174: 'Vite (alt)',
    5500: 'Live Server',
    5555: 'Expo',
    6006: 'Storybook',
    8000: 'Django / PHP',
    8080: 'Webpack / Tomcat',
    8081: 'Metro Bundler',
    8443: 'HTTPS (alt)',
    8888: 'Jupyter',
    9000: 'SonarQube / PHP',
    9090: 'Prometheus',
    9229: 'Node Debug',
    19006: 'Expo Web',
    24678: 'Vite HMR',
};

/**
 * Check if a single port is open (has something listening)
 */
function isPortOpen(port: number, timeout: number = 300): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(timeout);

        socket.on('connect', () => {
            socket.destroy();
            resolve(true);
        });

        socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
        });

        socket.on('error', () => {
            socket.destroy();
            resolve(false);
        });

        socket.connect(port, '127.0.0.1');
    });
}

/**
 * Scan common dev ports and return which ones are open
 */
export async function scanCommonPorts(): Promise<DetectedPort[]> {
    const portsToScan = Object.keys(KNOWN_PORTS).map(Number);
    const detected: DetectedPort[] = [];

    // Scan all ports in parallel for speed
    const results = await Promise.all(
        portsToScan.map(async (port) => ({
            port,
            open: await isPortOpen(port),
        }))
    );

    for (const result of results) {
        if (result.open) {
            detected.push({
                port: result.port,
                name: KNOWN_PORTS[result.port],
            });
        }
    }

    return detected;
}

/**
 * Try to detect ports using system commands (ss/netstat) for more thorough scan.
 * Falls back to the socket-based scan if system commands fail.
 */
export async function detectRunningServers(): Promise<DetectedPort[]> {
    try {
        const systemPorts = await getPortsFromSystem();
        if (systemPorts.length > 0) {
            return systemPorts;
        }
    } catch {
        // System command failed, fall back to socket scan
    }
    return scanCommonPorts();
}

/**
 * Get listening ports from system using ss (Linux) or netstat
 */
function getPortsFromSystem(): Promise<DetectedPort[]> {
    return new Promise((resolve, reject) => {
        // Use ss on Linux (faster than netstat)
        const cmd = process.platform === 'linux'
            ? 'ss -tlnp 2>/dev/null | grep LISTEN'
            : process.platform === 'darwin'
            ? 'lsof -iTCP -sTCP:LISTEN -nP 2>/dev/null'
            : 'netstat -tln 2>/dev/null';

        exec(cmd, { timeout: 5000 }, (error, stdout) => {
            if (error) {
                reject(error);
                return;
            }

            const ports = new Set<number>();
            const lines = stdout.split('\n');

            for (const line of lines) {
                // Match port numbers from ss/netstat/lsof output
                // ss format:   LISTEN  0  128  0.0.0.0:3000  ...
                // lsof format: node  12345  user  22u  IPv4  ... TCP *:3000 (LISTEN)
                const matches = line.match(/:(\d+)\s/g) || line.match(/:(\d+)\s*\(/g);
                if (matches) {
                    for (const match of matches) {
                        const portStr = match.replace(/[:(\s]/g, '');
                        const port = parseInt(portStr, 10);
                        if (port > 0 && port < 65536 && port !== 8080) {
                            // Exclude relay server port 8080 from results
                            ports.add(port);
                        }
                    }
                }
            }

            const detected: DetectedPort[] = Array.from(ports)
                .sort((a, b) => a - b)
                .map(port => ({
                    port,
                    name: KNOWN_PORTS[port] || undefined,
                }));

            resolve(detected);
        });
    });
}

/**
 * Get a friendly label for a detected port
 */
export function getPortLabel(port: DetectedPort): string {
    if (port.name) {
        return `${port.port} — ${port.name}`;
    }
    return `${port.port}`;
}
