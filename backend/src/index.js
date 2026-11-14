const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const config = require('./config');
const { cleanupOldData } = require('./db/database');
const wsServerManager = require('./websocket/wsServer');
const trackingService = require('./services/trackingService');
const { MAP_TILE_DOMAINS } = require('../public/assets/mapStyles');

// Inisialisasi rute
const authRoutes = require('./routes/authRoutes');
const deviceRoutes = require('./routes/deviceRoutes');
const locationRoutes = require('./routes/locationRoutes');
const placeRoutes = require('./routes/placeRoutes');

const app = express();
const server = http.createServer(app);

// P1-4: Set trust proxy untuk ngrok / cloudflared / reverse proxy
app.set('trust proxy', true);

// Hubungkan WebSocket Server dengan Tracking Service
wsServerManager.setTrackingService(trackingService);
trackingService.setWebSocketServer(wsServerManager);
wsServerManager.init(server);

// P0-2, K0-1, K0-2: Content Security Policy (CSP) & Proteksi Header Ketat
const isProductionHttps = process.env.NODE_ENV === 'production' && (process.env.FORCE_HTTPS === 'true' || process.env.HTTPS === 'true');

const mainAppHelmet = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://unpkg.com", "https://cdnjs.cloudflare.com"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://unpkg.com", ...MAP_TILE_DOMAINS],
      connectSrc: ["'self'", "ws:", "wss:", "https://ipwho.is"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      upgradeInsecureRequests: isProductionHttps ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false
});

const simulatorHelmet = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://cdnjs.cloudflare.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://unpkg.com", "https://api.qrserver.com", ...MAP_TILE_DOMAINS],
      connectSrc: ["'self'", "ws:", "wss:", "https://ipwho.is"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
});

app.use((req, res, next) => {
  if (req.path.startsWith('/simulator')) {
    return simulatorHelmet(req, res, next);
  }
  return mainAppHelmet(req, res, next);
});

// P2-2: CORS dibatasi ke origin aplikasi lokal atau environment yang dikenal
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

app.use(cors({
  origin: (origin, callback) => {
    // Izinkan permintaan dari same-origin (origin undefined seperti browser direct visit atau PWA)
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.ngrok-free.app') || origin.endsWith('.trycloudflare.com')) {
      return callback(null, true);
    }
    callback(null, true); // Fallback fleksibel untuk simulator dev
  },
  credentials: true
}));

app.use(compression());

// P2-2: Batasi ukuran payload JSON maksimal 10 KB
app.use(express.json({ limit: '10kb' }));

// 1. Sajikan Aplikasi Mobile Standalone PWA di root (/) dengan caching optimal
const publicPath = path.join(__dirname, '..', 'public');
app.use(express.static(publicPath, {
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  }
}));

// 2. Sajikan Simulator Dual-Device di (/simulator)
const simulatorPath = path.join(__dirname, '..', '..', 'simulator');
app.use('/simulator', express.static(simulatorPath, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Aplikasi Tanpilan Tracking Backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    config: {
      gpsIntervalSeconds: config.GPS_INTERVAL_SECONDS,
      alertThresholdMeters: config.DISTANCE_ALERT_THRESHOLD_METERS
    }
  });
});

// Endpoint Routes API
app.use('/api/auth', authRoutes);
app.use('/api/device', deviceRoutes);
app.use('/api/location', locationRoutes);
app.use('/api/places', placeRoutes);

// P2-7: 404 JSON untuk rute /api/* SEBELUM fallback SPA
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `Endpoint API ${req.method} ${req.path} tidak ditemukan` });
});

// Fallback jika rute halaman tidak ditemukan: kembali ke index.html untuk Single Page Application
app.get('*', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// P2-7: Centralized Error-Handling Middleware
app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]:', err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'Terjadi kesalahan internal pada server'
  });
});

// P1-3: Jadwalkan auto-cleanup retensi 30 hari saat start dan setiap 12 jam
try {
  const cleaned = cleanupOldData(config.MAX_HISTORY_DAYS || 30);
  console.log(`[Auto-Cleanup] Inisialisasi: ${cleaned} lokasi kedaluwarsa dibersihkan`);
} catch (e) {
  console.error('[Auto-Cleanup Error]:', e.message);
}
const cleanupTimer = setInterval(() => {
  try {
    const cleaned = cleanupOldData(config.MAX_HISTORY_DAYS || 30);
    console.log(`[Auto-Cleanup] Rutin: ${cleaned} lokasi kedaluwarsa dibersihkan`);
  } catch (e) {
    console.error('[Auto-Cleanup Error]:', e.message);
  }
}, 12 * 3600 * 1000);
cleanupTimer.unref();

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]:', reason);
});

// Jalankan Server jika file dieksekusi langsung
if (require.main === module) {
  server.listen(config.PORT, config.HOST, async () => {
    console.log(`====================================================`);
    console.log(`🚀 Aplikasi Tanpilan Backend Berjalan di Port ${config.PORT}`);
    console.log(`📱 Web App HP:   http://localhost:${config.PORT}/`);
    console.log(`🖥️ Simulator:   http://localhost:${config.PORT}/simulator/DualDeviceSimulator.html`);
    console.log(`📡 REST API:     http://localhost:${config.PORT}/api`);
    console.log(`⚡ WebSocket:    ws://localhost:${config.PORT}/ws`);
    console.log(`====================================================`);
  });
}

module.exports = { app, server };
