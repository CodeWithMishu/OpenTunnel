/**
 * Cloudflared Binary Manager
 * 
 * Downloads, caches, and manages the cloudflared binary.
 * Supports Linux (x64/arm64), macOS (x64/arm64), Windows (x64).
 * Uses Cloudflare's free "quick tunnels" — no account required.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as https from 'https';
import * as http from 'http';
import { execFile, spawn } from 'child_process';
import { Logger } from './utils/logger';

const logger = new Logger('Cloudflared');

/** Platform-specific download URLs for cloudflared */
function getDownloadUrl(): { url: string; filename: string } | null {
    const platform = os.platform();
    const arch = os.arch();

    // https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
    const base = 'https://github.com/cloudflare/cloudflared/releases/latest/download';

    if (platform === 'linux') {
        if (arch === 'x64') { return { url: `${base}/cloudflared-linux-amd64`, filename: 'cloudflared' }; }
        if (arch === 'arm64') { return { url: `${base}/cloudflared-linux-arm64`, filename: 'cloudflared' }; }
        if (arch === 'arm') { return { url: `${base}/cloudflared-linux-arm`, filename: 'cloudflared' }; }
    }
    if (platform === 'darwin') {
        if (arch === 'x64') { return { url: `${base}/cloudflared-darwin-amd64.tgz`, filename: 'cloudflared' }; }
        if (arch === 'arm64') { return { url: `${base}/cloudflared-darwin-amd64.tgz`, filename: 'cloudflared' }; }
    }
    if (platform === 'win32') {
        if (arch === 'x64') { return { url: `${base}/cloudflared-windows-amd64.exe`, filename: 'cloudflared.exe' }; }
    }

    return null;
}

/** Get the directory where we store the cloudflared binary */
function getBinDir(context: vscode.ExtensionContext): string {
    return path.join(context.globalStorageUri.fsPath, 'bin');
}

/** Get the full path to the cloudflared binary */
export function getCloudflaredPath(context: vscode.ExtensionContext): string {
    const info = getDownloadUrl();
    const filename = info?.filename || (os.platform() === 'win32' ? 'cloudflared.exe' : 'cloudflared');
    return path.join(getBinDir(context), filename);
}

/** Check if cloudflared is already installed (in extension storage or system PATH) */
export async function isCloudflaredInstalled(context: vscode.ExtensionContext): Promise<string | null> {
    // 1. Check our cached copy
    const cachedPath = getCloudflaredPath(context);
    if (fs.existsSync(cachedPath)) {
        return cachedPath;
    }

    // 2. Check system PATH
    return new Promise((resolve) => {
        const cmd = os.platform() === 'win32' ? 'where' : 'which';
        execFile(cmd, ['cloudflared'], (err, stdout) => {
            if (!err && stdout.trim()) {
                resolve(stdout.trim().split('\n')[0]);
            } else {
                resolve(null);
            }
        });
    });
}

/** Download a file with redirect following */
function downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const doRequest = (currentUrl: string, redirectCount: number) => {
            if (redirectCount > 10) {
                reject(new Error('Too many redirects'));
                return;
            }

            const client = currentUrl.startsWith('https') ? https : http;
            client.get(currentUrl, { headers: { 'User-Agent': 'OpenTunnel-VSCode' } }, (res) => {
                // Follow redirects
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    doRequest(res.headers.location, redirectCount + 1);
                    return;
                }

                if (res.statusCode !== 200) {
                    reject(new Error(`Download failed: HTTP ${res.statusCode}`));
                    return;
                }

                const file = fs.createWriteStream(dest);
                res.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve();
                });
                file.on('error', (err) => {
                    fs.unlinkSync(dest);
                    reject(err);
                });
            }).on('error', reject);
        };

        doRequest(url, 0);
    });
}

/** Download and install cloudflared binary */
export async function installCloudflared(context: vscode.ExtensionContext): Promise<string> {
    const info = getDownloadUrl();
    if (!info) {
        throw new Error(`Unsupported platform: ${os.platform()} ${os.arch()}. Please install cloudflared manually.`);
    }

    const binDir = getBinDir(context);
    if (!fs.existsSync(binDir)) {
        fs.mkdirSync(binDir, { recursive: true });
    }

    const destPath = getCloudflaredPath(context);
    
    logger.info(`Downloading cloudflared from ${info.url}...`);

    // Handle .tgz for macOS
    if (info.url.endsWith('.tgz')) {
        const tgzPath = destPath + '.tgz';
        await downloadFile(info.url, tgzPath);
        
        // Extract using tar
        await new Promise<void>((resolve, reject) => {
            execFile('tar', ['-xzf', tgzPath, '-C', binDir], (err) => {
                try { fs.unlinkSync(tgzPath); } catch {}
                if (err) { reject(err); } else { resolve(); }
            });
        });
    } else {
        await downloadFile(info.url, destPath);
    }

    // Make executable on unix
    if (os.platform() !== 'win32') {
        fs.chmodSync(destPath, 0o755);
    }

    // Verify it works
    await new Promise<void>((resolve, reject) => {
        execFile(destPath, ['--version'], (err, stdout) => {
            if (err) {
                reject(new Error(`cloudflared binary not working: ${err.message}`));
            } else {
                logger.info(`Installed cloudflared: ${stdout.trim()}`);
                resolve();
            }
        });
    });

    return destPath;
}

/** Ensure cloudflared is available — download if needed */
export async function ensureCloudflared(context: vscode.ExtensionContext): Promise<string> {
    // Check if already available
    const existing = await isCloudflaredInstalled(context);
    if (existing) {
        logger.info(`Using cloudflared at: ${existing}`);
        return existing;
    }

    // Need to download — ask user
    const choice = await vscode.window.showInformationMessage(
        'OpenTunnel needs to download cloudflared (~30MB, one-time). This enables free, unlimited tunnels.',
        'Download Now',
        'Cancel'
    );

    if (choice !== 'Download Now') {
        throw new Error('cloudflared is required to create tunnels. Please try again.');
    }

    // Download with progress
    return await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Downloading cloudflared...',
            cancellable: false
        },
        async (progress) => {
            progress.report({ message: 'This is a one-time download (~30MB)' });
            const binPath = await installCloudflared(context);
            progress.report({ message: 'Done!' });
            return binPath;
        }
    );
}
