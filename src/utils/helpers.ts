/**
 * Helper utilities for OpenTunnel
 */

import * as crypto from 'crypto';

/**
 * Generate a unique tunnel ID
 */
export function generateTunnelId(): string {
    return crypto.randomBytes(16).toString('hex');
}

/**
 * Generate a random subdomain
 */
export function generateSubdomain(): string {
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
    
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const number = Math.floor(Math.random() * 1000);
    
    return `${adjective}-${noun}-${number}`;
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Format duration in milliseconds to human readable string
 */
export function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * Check if a port is valid
 */
export function isValidPort(port: number): boolean {
    return Number.isInteger(port) && port >= 1 && port <= 65535;
}

/**
 * Parse URL and validate
 */
export function isValidUrl(urlString: string): boolean {
    try {
        new URL(urlString);
        return true;
    } catch {
        return false;
    }
}

/**
 * Sanitize subdomain string
 */
export function sanitizeSubdomain(subdomain: string): string {
    return subdomain
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 63);
}

/**
 * Get HTTP method color for UI
 */
export function getMethodColor(method: string): string {
    const colors: Record<string, string> = {
        'GET': '#61affe',
        'POST': '#49cc90',
        'PUT': '#fca130',
        'DELETE': '#f93e3e',
        'PATCH': '#50e3c2',
        'OPTIONS': '#0d5aa7',
        'HEAD': '#9012fe'
    };
    return colors[method.toUpperCase()] || '#999999';
}

/**
 * Get status code color for UI
 */
export function getStatusColor(status: number): string {
    if (status >= 200 && status < 300) return '#49cc90';
    if (status >= 300 && status < 400) return '#fca130';
    if (status >= 400 && status < 500) return '#f93e3e';
    if (status >= 500) return '#9012fe';
    return '#999999';
}

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength - 3) + '...';
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeoutId: NodeJS.Timeout | null = null;
    
    return function (this: any, ...args: Parameters<T>) {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            func.apply(this, args);
        }, wait);
    };
}
