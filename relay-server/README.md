# OpenTunnel Relay Server

The relay server acts as a bridge between the public internet and your local development server. It's designed to be self-hostable and completely open-source.

## How It Works

```
[Internet] → [Relay Server] → [WebSocket] → [VS Code Extension] → [localhost:PORT]
```

1. The VS Code extension establishes a WebSocket connection to the relay server
2. The relay server assigns a unique subdomain (e.g., `swift-cloud-123.your-domain.com`)
3. When HTTP requests arrive at that subdomain, they're forwarded through the WebSocket to your local machine
4. Your local server's response is sent back through the same channel

## Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Or build and run
npm run build
npm start
```

### Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 8080 | HTTP server port |
| `HTTPS_PORT` | 8443 | HTTPS server port |
| `DOMAIN` | localhost | Base domain for tunnels |
| `USE_HTTPS` | false | Enable HTTPS |
| `SSL_CERT` | - | Path to SSL certificate |
| `SSL_KEY` | - | Path to SSL private key |
| `MAX_TUNNELS` | 1000 | Maximum concurrent tunnels |
| `REQUEST_TIMEOUT` | 30000 | Request timeout in ms |

## Production Deployment

### Using Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 8080
CMD ["node", "dist/server.js"]
```

Build and run:
```bash
npm run build
docker build -t opentunnel-relay .
docker run -p 8080:8080 -e DOMAIN=tunnel.yourdomain.com opentunnel-relay
```

### DNS Setup

For production, you'll need wildcard DNS:

1. Add an A record for `tunnel.yourdomain.com` pointing to your server
2. Add a wildcard A record `*.tunnel.yourdomain.com` pointing to the same server

### SSL/HTTPS with Let's Encrypt

For HTTPS with wildcard certificates:

```bash
# Using certbot with DNS challenge
certbot certonly --manual --preferred-challenges dns \
  -d tunnel.yourdomain.com \
  -d *.tunnel.yourdomain.com
```

Then configure environment:
```
USE_HTTPS=true
SSL_CERT=/etc/letsencrypt/live/tunnel.yourdomain.com/fullchain.pem
SSL_KEY=/etc/letsencrypt/live/tunnel.yourdomain.com/privkey.pem
```

### Using a Reverse Proxy (Recommended)

For production, use nginx or Caddy as a reverse proxy:

**Caddy** (automatic HTTPS):
```
*.tunnel.yourdomain.com {
    reverse_proxy localhost:8080
}
```

**nginx**:
```nginx
server {
    listen 443 ssl;
    server_name *.tunnel.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## API Endpoints

### Health Check
```
GET /health
```
Returns server status and tunnel count.

### Stats
```
GET /stats
```
Returns server statistics.

## Security Considerations

1. **No Authentication by Default**: This server doesn't require authentication. Anyone can create tunnels.
2. **Rate Limiting**: Consider adding rate limiting in production (via nginx, Caddy, or code modification).
3. **Tunnel Limits**: The `MAX_TUNNELS` setting prevents resource exhaustion.
4. **Timeout**: The `REQUEST_TIMEOUT` prevents hanging connections.

## License

MIT License - See main project LICENSE file.
