const http = require('http');
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const config = require('./config');
const wsServerManager = require('./websocket/wsServer');
const trackingService = require('./services/trackingService');

// Inisialisasi rute
const authRoutes = require('./routes/authRoutes');
const deviceRoutes = require('./routes/deviceRoutes');
const locationRoutes = require('./routes/locationRoutes');
const placeRoutes = require('./routes/placeRoutes');

const app = express();
const server = http.createServer(app);

// Hubungkan WebSocket Server dengan Tracking Service
wsServerManager.setTrackingService(trackingService);
trackingService.setWebSocketServer(wsServerManager);
wsServerManager.init(server);

// Middleware
app.use(cors());
app.use(compression());
app.use(express.json());

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

// Fallback jika rute tidak ditemukan: kembali ke index.html untuk Single Page Application
app.get('*', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]:', reason);
});

// Jalankan Server
server.listen(config.PORT, config.HOST, async () => {
  console.log(`====================================================`);
  console.log(`🚀 Aplikasi Tanpilan Backend Berjalan di Port ${config.PORT}`);
  console.log(`📱 Web App HP:   http://localhost:${config.PORT}/`);
  console.log(`🖥️ Simulator:   http://localhost:${config.PORT}/simulator/DualDeviceSimulator.html`);
  console.log(`📡 REST API:     http://localhost:${config.PORT}/api`);
  console.log(`⚡ WebSocket:    ws://localhost:${config.PORT}/ws`);
  console.log(`====================================================`);
});

module.exports = { app, server };
