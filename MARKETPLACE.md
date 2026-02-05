# Publishing to VS Code Marketplace

## Step 1: Deploy Your Relay Server (Required)

**You MUST do this first** — the extension won't work without a public relay server.

### Option A: Render.com (Recommended - Free Forever)

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → **Sign up** → **New +** → **Blueprint**
3. Connect your GitHub repo → Render auto-reads `render.yaml` 
4. Click **Deploy** → Wait 2-3 minutes
5. Copy your URL (e.g., `https://opentunnel-relay-abc123.onrender.com`)
6. **Update the extension code** (see Step 2)

### Option B: Railway (Free with GitHub account)

1. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**
2. Select your repo → Railway reads `railway.json`
3. Copy your URL (e.g., `https://opentunnel-relay.up.railway.app`)

### Option C: Fly.io (More advanced)

```bash
cd relay-server
fly launch --name opentunnel-relay-YOUR-USERNAME
fly deploy
```

## Step 2: Update Extension Code

Replace `opentunnel-relay.onrender.com` with your actual Render URL in these files:

1. **package.json** - Line 134 (default setting)
2. **src/tunnelManager.ts** - Line 26 (fallback default)  
3. **.vscode/settings.json** - Line 2 (workspace settings)

**Example:**
```json
"default": "wss://your-actual-relay-url.onrender.com/tunnel"
```

## Step 3: Test Everything

1. Compile: `npm run compile`
2. Press F5 → Extension Development Host opens
3. Run "OpenTunnel: Start Tunnel" 
4. Should connect to your deployed relay (not localhost)
5. Test the public URL from your phone

## Step 4: Package Extension

```bash
npm install -g vsce
vsce package
```

Creates `opentunnel-1.0.0.vsix`

## Step 5: Publish to Marketplace

```bash
# Get publisher access token from https://dev.azure.com
vsce publish -p YOUR_ACCESS_TOKEN
```

OR manually upload the .vsix at [marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage)

## Important Notes

- **Free Render tier** handles 1000+ concurrent users easily
- **URLs are like:** `https://your-relay.onrender.com/t/happy-cloud-123`
- **Zero user setup** — extension works immediately after install
- **Your relay costs $0** but serves all extension users worldwide

## Render Free Tier Limits

- ✅ 750 hours/month (always free if your app gets traffic)
- ✅ Unlimited bandwidth  
- ✅ Custom domains
- ✅ HTTPS/WebSocket support
- ⚠️ Sleeps after 15min inactivity (1-2sec startup delay)

For most users this is perfect. If you get huge adoption, upgrade to Render's $7/month plan for always-on.

## User Experience Flow

1. User finds "OpenTunnel" on VS Code marketplace
2. User clicks Install → extension installs in seconds
3. User runs "OpenTunnel: Start Tunnel" → auto-detects local servers
4. Extension connects to YOUR relay server → generates public URL
5. User shares URL → works from any device worldwide

**No user configuration needed!** ✨