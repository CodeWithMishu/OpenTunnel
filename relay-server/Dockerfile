FROM node:20-alpine AS builder

LABEL maintainer="OpenTunnel"
LABEL description="OpenTunnel Relay Server - Self-hostable tunnel relay"

WORKDIR /app

# Install all deps (including devDependencies for build)
COPY package*.json ./
RUN npm ci

# Build TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ---- Production image ----
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

# Cloud platforms set PORT automatically; we don't set a default here
# to let the platform's PORT take precedence
ENV NODE_ENV=production

# Expose common ports (actual port is set by PORT env var)
EXPOSE 8080 10000

# Health check - use PORT env var
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||8080)+'/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "dist/server.js"]
