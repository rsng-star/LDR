const WebSocket = require('ws');
const url = require('url');
const { getDeviceByToken, getDeviceById, updateDeviceStatus } = require('../db/database');
const { verifyToken, getUserById } = require('../utils/security');

class WebSocketServerManager {
  constructor() {
    this.wss = null;
    this.clients = new Map(); // deviceId -> Set of ws connections
    this.trackingService = null;
  }

  setTrackingService(trackingService) {
    this.trackingService = trackingService;
  }

  init(server) {
    this.wss = new WebSocket.Server({ server, path: '/ws' });

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    console.log('[WebSocket] Server diinisialisasi pada path /ws');
  }

  handleConnection(ws, req) {
    const parsedUrl = new URL(req.url, 'http://localhost');
    const parameters = Object.fromEntries(parsedUrl.searchParams.entries());
    let authenticatedDeviceId = null;

    // Otentikasi saat koneksi pertama kali melalui token query
    if (parameters.device_token) {
      const dev = getDeviceByToken(parameters.device_token);
      if (dev) {
        authenticatedDeviceId = dev.id;
      }
    } else if (parameters.token) {
      const decoded = verifyToken(parameters.token);
      if (decoded && decoded.id) {
        const { getDeviceByUserId } = require('../db/database');
        const dev = getDeviceByUserId(decoded.id);
        if (dev) {
          authenticatedDeviceId = dev.id;
        }
      }
    }

    if (authenticatedDeviceId) {
      this.registerClient(authenticatedDeviceId, ws);
    }

    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', async (rawMessage) => {
      try {
        const message = JSON.parse(rawMessage.toString());
        await this.handleMessage(ws, message);
      } catch (err) {
        console.error('[WebSocket] Format pesan tidak valid:', err.message);
        ws.send(JSON.stringify({ event: 'error', message: 'Format pesan JSON tidak valid' }));
      }
    });

    ws.on('close', () => {
      if (ws.deviceId) {
        this.unregisterClient(ws.deviceId, ws);
      }
    });

    ws.on('error', (err) => {
      console.error('[WebSocket] Socket error:', err.message);
    });
  }

  registerClient(deviceId, ws) {
    ws.deviceId = deviceId;
    if (!this.clients.has(deviceId)) {
      this.clients.set(deviceId, new Set());
    }
    this.clients.get(deviceId).add(ws);

    // Update status online di database
    updateDeviceStatus(deviceId, true);

    const dev = getDeviceById(deviceId);
    console.log(`[WebSocket] Perangkat #${deviceId} (${dev?.device_name || 'Device'}) terhubung.`);

    ws.send(JSON.stringify({
      event: 'authenticated',
      data: {
        deviceId,
        message: 'Koneksi realtime WebSocket aktif'
      }
    }));

    // Beri tahu pasangan bahwa perangkat ini sedang online
    if (dev && dev.partner_device_id) {
      this.sendToDevice(dev.partner_device_id, {
        event: 'partner_status',
        data: {
          deviceId,
          isOnline: true,
          lastSeen: new Date().toISOString()
        }
      });
    }
  }

  unregisterClient(deviceId, ws) {
    if (this.clients.has(deviceId)) {
      const set = this.clients.get(deviceId);
      set.delete(ws);
      if (set.size === 0) {
        this.clients.delete(deviceId);
        updateDeviceStatus(deviceId, false);

        const dev = getDeviceById(deviceId);
        console.log(`[WebSocket] Perangkat #${deviceId} terputus.`);

        // Beri tahu pasangan bahwa perangkat ini offline
        if (dev && dev.partner_device_id) {
          this.sendToDevice(dev.partner_device_id, {
            event: 'partner_status',
            data: {
              deviceId,
              isOnline: false,
              lastSeen: new Date().toISOString()
            }
          });
        }
      }
    }
  }

  async handleMessage(ws, message) {
    const { event, data } = message;

    // Otentikasi via pesan jika belum diautentikasi lewat URL
    if (event === 'auth') {
      const { deviceToken } = data || {};
      const dev = getDeviceByToken(deviceToken);
      if (dev) {
        this.registerClient(dev.id, ws);
      } else {
        ws.send(JSON.stringify({ event: 'auth_failed', message: 'Token perangkat tidak valid' }));
      }
      return;
    }

    if (!ws.deviceId) {
      return ws.send(JSON.stringify({ event: 'error', message: 'Harap otentikasi terlebih dahulu' }));
    }

    switch (event) {
      case 'ping':
        ws.send(JSON.stringify({ event: 'pong', timestamp: Date.now() }));
        break;

      case 'location_update':
        if (this.trackingService) {
          const res = await this.trackingService.processLocationUpdate(ws.deviceId, {
            latitude: data.latitude,
            longitude: data.longitude,
            accuracy: data.accuracy || 0,
            speed: data.speed || 0,
            heading: data.heading || 0,
            battery: data.battery
          });

          ws.send(JSON.stringify({
            event: 'location_ack',
            data: res
          }));
        }
        break;

      case 'battery_update':
        if (typeof data.battery === 'number') {
          updateDeviceStatus(ws.deviceId, true, data.battery);
          const dev = getDeviceById(ws.deviceId);
          if (dev && dev.partner_device_id) {
            this.sendToDevice(dev.partner_device_id, {
              event: 'partner_battery',
              data: {
                deviceId: ws.deviceId,
                battery: data.battery
              }
            });
          }
        }
        break;

      case 'send_poke': {
        const dev = getDeviceById(ws.deviceId);
        if (dev && dev.partner_device_id) {
          const pokeType = (data && data.type) ? data.type : 'heart';
          const senderName = dev.device_name || 'Pasangan Anda';
          this.sendToDevice(dev.partner_device_id, {
            event: 'partner_poke_received',
            data: {
              type: pokeType,
              senderId: ws.deviceId,
              senderName,
              timestamp: new Date().toISOString()
            }
          });
          ws.send(JSON.stringify({
            event: 'poke_sent_ack',
            data: { success: true, type: pokeType }
          }));
        }
        break;
      }

      default:
        console.warn(`[WebSocket] Unknown event: ${event}`);
    }
  }

  sendToDevice(deviceId, payload) {
    if (!this.clients.has(deviceId)) return false;
    const stringData = JSON.stringify(payload);
    let sentCount = 0;
    for (const ws of this.clients.get(deviceId)) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(stringData);
        sentCount++;
      }
    }
    return sentCount > 0;
  }
}

module.exports = new WebSocketServerManager();
