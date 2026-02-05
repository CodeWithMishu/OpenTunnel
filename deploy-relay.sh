#!/bin/bash
# deploy-relay.sh - Quick deployment helper

set -e

echo "🚀 OpenTunnel Relay Deployment Helper"
echo "====================================="

# Check if git repo exists
if [ ! -d ".git" ]; then
    echo "❌ Not a git repository. Please run 'git init' and push to GitHub first."
    exit 1
fi

# Get git remote URL
REPO_URL=$(git remote get-url origin 2>/dev/null || echo "")
if [ -z "$REPO_URL" ]; then
    echo "❌ No git remote 'origin' found. Please push this repo to GitHub first."
    echo "   Example: git remote add origin https://github.com/USERNAME/opentunnel.git"
    exit 1
fi

echo "📦 Found repository: $REPO_URL"
echo ""

# Build relay server to make sure it works
echo "🔨 Building relay server..."
cd relay-server
npm install --silent
npm run build --silent
cd ..

echo "✅ Relay server builds successfully"
echo ""

echo "🌐 Choose deployment platform:"
echo "  1) Render.com (Free forever, easiest)"
echo "  2) Railway (Free with GitHub)"  
echo "  3) Fly.io (Advanced users)"
echo ""

read -p "Enter choice (1-3): " choice

case $choice in
    1)
        echo ""
        echo "🎯 Render.com Deployment"
        echo "========================"
        echo "1. Go to: https://render.com"
        echo "2. Click: New + → Blueprint"
        echo "3. Connect your GitHub repo: $(basename "$REPO_URL" .git)"
        echo "4. Render will auto-read render.yaml and deploy"
        echo "5. Copy your URL (like: https://opentunnel-relay-abc123.onrender.com)"
        echo "6. Run: ./update-relay-url.sh YOUR_URL"
        ;;
    2)
        echo ""
        echo "🚂 Railway Deployment"
        echo "===================="
        echo "1. Go to: https://railway.app"
        echo "2. Click: New Project → Deploy from GitHub"
        echo "3. Select your repo: $(basename "$REPO_URL" .git)"
        echo "4. Railway will auto-read railway.json and deploy"
        echo "5. Copy your URL (like: https://opentunnel-relay.up.railway.app)"
        echo "6. Run: ./update-relay-url.sh YOUR_URL"
        ;;
    3)
        echo ""
        echo "✈️ Fly.io Deployment"
        echo "==================="
        echo "1. Install Fly CLI: curl -L https://fly.io/install.sh | sh"
        echo "2. Run: fly auth signup"
        echo "3. Run: cd relay-server && fly launch --name opentunnel-relay-$(whoami)"
        echo "4. Run: fly deploy"
        echo "5. Your URL will be: https://opentunnel-relay-$(whoami).fly.dev"
        echo "6. Run: ./update-relay-url.sh https://opentunnel-relay-$(whoami).fly.dev"
        ;;
    *)
        echo "Invalid choice. Exiting."
        exit 1
        ;;
esac

echo ""
echo "📝 After deployment, remember to:"
echo "   1. Update extension code with your relay URL"
echo "   2. Test with F5 (Extension Development Host)"
echo "   3. Package with: vsce package"
echo "   4. Publish with: vsce publish"
echo ""
echo "🎉 See MARKETPLACE.md for detailed instructions!"