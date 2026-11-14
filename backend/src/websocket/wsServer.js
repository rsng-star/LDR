const WebSocket = require('ws');
const { getDeviceByToken, getDeviceById, getVerifiedPartner, updateDeviceStatus } = require('../db/database');
const { validateCoordinates, validateAccuracy, validateSpeed, validateHeading, validateBattery } = require('../utils/validators');

class WebSocketServerManager {
  constructor() {
    this.wss = null;
    this.clients = new Map(); // deviceId -> Set of ws connections
    this.trackingService = null;
    this.heartbeatInterval = null;
  }

  setTrackingService(trackingService) {
    this.trackingService = trackingService;
  }

  init(server) {
    // P2-3: Batasi maxPayload menjadi 16 KB (default ws adalah 100 MiB)
    this.wss = new WebSocket.Server({
      server,
      path: '/ws',
      maxPayload: 16 * 1024
    });

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    // P2-3: Heartbeat periodik 30 detik untuk membersihkan koneksi zombie
    this.heartbeatInterval = setInterval(() => {
      if (!this.wss) return;
      for (const ws of this.wss.clients) {
        if (ws.isAlive === false) {
          console.log(`[WebSocket] Mematikan koneksi zombie (deviceId: ${ws.deviceId || 'unauthed'})`);
          ws.terminate();
          continue;
        }
        ws.isAlive = false;
        ws.ping();
      }
    }, 30000);

    console.log('[WebSocket] Server diinisialisasi pada path /ws dengan proteksi maxPayload 16KB & Heartbeat 30s');
  }

  handleConnection(ws, req) {
    ws.isAlive = true;
    ws.lastLocationUpdate = 0;
    ws.lastPoke = 0;

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
    console.log(`[WebSocket] Perangkat #${deviceId} (${dev?.device_name || 'Device'}) terautentikasi.`);

    ws.send(JSON.stringify({
      event: 'authenticated',
      data: {
        deviceId,
        message: 'Koneksi realtime WebSocket aktif'
      }
    }));

    // P0-4: Beri tahu pasangan timbal balik bahwa perangkat ini sedang online
    const verifiedPartner = getVerifiedPartner(deviceId);
    if (verifiedPartner) {
      this.sendToDevice(verifiedPartner.id, {
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

        const verifiedPartner = getVerifiedPartner(deviceId);
        if (verifiedPartner) {
          this.sendToDevice(verifiedPartner.id, {
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

    // Heartbeat ping-pong dapat dibalas langsung tanpa perlu otentikasi
    if (event === 'ping') {
      return ws.send(JSON.stringify({ event: 'pong', timestamp: Date.now() }));
    }

    // Otentikasi lewat pesan 'auth' pertama
    if (event === 'auth') {
      // P2-3: Cegah satu socket mengirim 'auth' berulang untuk mendaftar ke banyak perangkat
      if (ws.deviceId) {
        return ws.send(JSON.stringify({ event: 'error', message: 'Socket sudah terotentikasi dan tidak dapat diubah' }));
      }

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
      return ws.send(JSON.stringify({ event: 'error', message: 'Harap otentikasi terlebih dahulu dengan event auth' }));
    }

    const now = Date.now();

    switch (event) {
      case 'location_update': {
        // P2-3: Batasi laju pesan (location_update maksimal 1 per 2 detik per socket)
        if (now - ws.lastLocationUpdate < 2000) {
          return ws.send(JSON.stringify({ event: 'rate_limited', message: 'Terlalu cepat: maksimal 1 update lokasi per 2 detik' }));
        }
        ws.lastLocationUpdate = now;

        if (this.trackingService && data) {
          try {
            const coords = validateCoordinates(data.latitude, data.longitude);
            const res = await this.trackingService.processLocationUpdate(ws.deviceId, {
              latitude: coords.latitude,
              longitude: coords.longitude,
              accuracy: validateAccuracy(data.accuracy),
              speed: validateSpeed(data.speed),
              heading: validateHeading(data.heading),
              battery: validateBattery(data.battery)
            });

            ws.send(JSON.stringify({
              event: 'location_ack',
              data: res
            }));
          } catch (e) {
            ws.send(JSON.stringify({ event: 'error', message: e.message }));
          }
        }
        break;
      }

      case 'battery_update': {
        const cleanBattery = validateBattery(data?.battery);
        if (cleanBattery !== null) {
          updateDeviceStatus(ws.deviceId, true, cleanBattery);
          const partner = getVerifiedPartner(ws.deviceId);
          if (partner) {
            this.sendToDevice(partner.id, {
              event: 'partner_battery',
              data: {
                deviceId: ws.deviceId,
                battery: cleanBattery
              }
            });
          }
        }
        break;
      }

      case 'send_poke': {
        // P2-3: Batasi laju pesan (send_poke maksimal 1 per 5 detik per socket)
        if (now - ws.lastPoke < 5000) {
          return ws.send(JSON.stringify({ event: 'rate_limited', message: 'Harap tunggu 5 detik sebelum menyapa lagi' }));
        }
        ws.lastPoke = now;

        const partner = getVerifiedPartner(ws.deviceId);
        if (partner) {
          // P2-3: Whitelist type pada poke
          const allowedPokes = ['heart', 'wave', 'hug', 'alert'];
          const rawType = (data && data.type) ? String(data.type).toLowerCase() : 'heart';
          const pokeType = allowedPokes.includes(rawType) ? rawType : 'heart';

          const dev = getDeviceById(ws.deviceId);
          const senderName = dev ? dev.device_name : 'Pasangan Anda';

          this.sendToDevice(partner.id, {
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
