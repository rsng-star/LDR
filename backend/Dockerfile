FROM node:22-alpine

WORKDIR /app

# Install dependencies (hanya production)
COPY package*.json ./
RUN npm ci --omit=dev

# Salin source code dan UI statis PWA
COPY src/ ./src/
COPY public/ ./public/

# Siapkan direktori data untuk volume database SQLite dan hak akses non-root
RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "src/index.js"]
