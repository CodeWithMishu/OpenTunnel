# OpenTunnel

<p align="center">
  <img src="assets/icon.png" alt="OpenTunnel Logo" width="128" height="128">
</p>

<p align="center">
  <strong>Expose Localhost to the Internet — Powered by Cloudflare Tunnel</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License">
  <img src="https://img.shields.io/badge/VS%20Code-Extension-purple.svg" alt="VS Code Extension">
  <img src="https://img.shields.io/badge/Open%20Source-❤️-red.svg" alt="Open Source">
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#usage">Usage</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#contributing">Contributing</a>
</p>

---

**OpenTunnel** is a free and open-source VS Code extension that turns your local development server into a public HTTPS URL — instantly. Powered by Cloudflare's free Quick Tunnels.

- ✅ **No accounts** — no sign-up, no API keys
- ✅ **No relay server** — direct Cloudflare tunnel, nothing to deploy
- ✅ **Free HTTPS** — every URL is `https://`
- ✅ **Works with ALL frameworks** — React, Vite, Next.js, Django, Flask, Express, anything
- ✅ **Zero configuration** — just click and share

## Features

| Feature | Description |
|---------|-------------|
| 🖱️ **One-click tunneling** | Start a tunnel directly from VS Code |
| 🌍 **Public HTTPS URLs** | Get a URL like `https://random-words.trycloudflare.com` |
| 🔍 **Auto-detects servers** | Finds your running dev servers automatically |
| 📁 **Static file serving** | Serve any folder as a website with one click |
| 📊 **Live request monitor** | See incoming HTTP requests in real-time |
| 📋 **Dashboard** | Full overview of all active tunnels |
| 🔌 **Works with everything** | React, Vue, Vite, Next.js, Express, Django, Flask, Rails, PHP... |

## Installation

### From VSIX

```bash
code --install-extension opentunnel-2.0.0.vsix
```

### From Source

```bash
git clone https://github.com/CodeWithMishu/OpenTunnel
cd OpenTunnel
npm install
npm run compile
# Press F5 in VS Code to launch Extension Development Host
```

## Usage

### Starting a Tunnel

1. **Command Palette**: Press `Ctrl+Shift+P` / `Cmd+Shift+P` and type "OpenTunnel: Start Tunnel"
2. **Activity Bar**: Click the OpenTunnel icon in the sidebar and use the "Start Tunnel" button
3. **Status Bar**: Click the "OpenTunnel" item

The extension will:
1. Auto-detect running servers on your machine
2. Let you pick which port to expose
3. Download `cloudflared` automatically (one-time, ~30MB)
4. Give you a public HTTPS URL

### Static File Serving

Want to share a folder of HTML/CSS/JS files?

1. Run "OpenTunnel: Start Tunnel (Static Files)"
2. Pick a folder
3. Choose Regular or SPA mode
4. Get your public URL!

### Managing Tunnels

- **Copy URL**: Click the copy icon or use "OpenTunnel: Copy URL"
- **Open in Browser**: Click the browser icon
- **Stop Tunnel**: Use the stop button in the sidebar
- **Dashboard**: Run "OpenTunnel: Show Dashboard" for a full overview

### Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `opentunnel.defaultPort` | `3000` | Default port when no server is auto-detected |
| `opentunnel.showNotifications` | `true` | Show notifications when tunnel starts |
| `opentunnel.logRequests` | `true` | Log incoming requests in the sidebar |

## How It Works

```
┌─────────────────┐       ┌──────────────────┐       ┌─────────────────┐
│   Any Browser   │ ───▶  │   Cloudflare     │ ───▶  │  VS Code +      │
│  (any device)   │       │   Edge Network   │       │  cloudflared    │
└─────────────────┘       └──────────────────┘       └─────────────────┘
                                                             │
                                                             ▼
                                                     ┌─────────────────┐
                                                     │  localhost:3000  │
                                                     │  (your app)     │
                                                     └─────────────────┘
```

1. The extension starts `cloudflared tunnel --url http://localhost:PORT`
2. Cloudflare assigns a free public URL (e.g., `https://happy-cat-abc123.trycloudflare.com`)
3. All traffic flows through Cloudflare's edge network → your machine
4. No relay server, no middleman, no data stored

### Why Cloudflare Quick Tunnels?

- **Free forever** — Cloudflare's Quick Tunnels require no account and are completely free
- **Subdomain-based** — Your app runs at the root `/`, so ALL frameworks work perfectly
- **HTTPS included** — Every tunnel gets automatic TLS
- **Fast** — Traffic goes through Cloudflare's global edge network
- **Reliable** — Backed by Cloudflare's infrastructure

## Commands

| Command | Description |
|---------|-------------|
| `OpenTunnel: Start Tunnel` | Expose a running server |
| `OpenTunnel: Start Tunnel (Static Files)` | Serve a folder as a website |
| `OpenTunnel: Stop Tunnel` | Stop a specific tunnel |
| `OpenTunnel: Stop All Tunnels` | Stop all active tunnels |
| `OpenTunnel: Copy URL` | Copy tunnel URL to clipboard |
| `OpenTunnel: Open in Browser` | Open tunnel URL in browser |
| `OpenTunnel: Show Status` | Show current tunnel status |
| `OpenTunnel: Show Dashboard` | Open the dashboard webview |

## Security

- **Temporary URLs**: Each tunnel gets a random URL, discarded when stopped
- **No data logging**: Traffic flows directly through Cloudflare — OpenTunnel stores nothing
- **Open source**: Audit the entire codebase
- **Local only**: `cloudflared` runs on your machine, no cloud servers to manage

> ⚠️ Only expose development servers. Never tunnel production databases or sensitive services.

## Troubleshooting

### "Connection refused" error
Make sure your local dev server is running on the specified port before starting the tunnel.

### Tunnel takes long to start
The first run downloads `cloudflared` (~30MB). After that, it's cached and starts in seconds.

### cloudflared download fails
You can install cloudflared manually: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

### URL not working
Cloudflare Quick Tunnel URLs are temporary. If the tunnel process stops, the URL stops working. Just start a new tunnel.

## Contributing

We welcome contributions! 🎉

```bash
git clone https://github.com/CodeWithMishu/OpenTunnel
cd OpenTunnel
npm install
npm run compile
# Press F5 to launch Extension Development Host
```

### Ideas for contributions
- 🔍 Better dev server auto-detection
- 📱 Mobile testing optimizations
- 🎨 UI/UX improvements
- 📚 Documentation & tutorials

## License

MIT License — See [LICENSE](LICENSE) file.

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/CodeWithMishu">CodeWithMishu</a>
</p>

<p align="center">
  <strong>⭐ Star this repo if you find it helpful!</strong>
</p>
