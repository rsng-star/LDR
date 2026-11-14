import { WS_BASE_URL } from './api';

class SocketService {
  constructor() {
    this.ws = null;
    this.listeners = new Map();
    this.reconnectTimer = null;
    this.deviceToken = null;
    this.isConnected = false;
  }

  connect(deviceToken) {
    this.deviceToken = deviceToken;
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
    }

    const wsUrl = `${WS_BASE_URL}?device_token=${encodeURIComponent(deviceToken)}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.isConnected = true;
      console.log('[WS Mobile] Terkoneksi ke WebSocket server');
      this.emit('connection_change', { isConnected: true });
    };

    this.ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const { event: eventName, data } = payload;
        this.emit(eventName, data);
      } catch (err) {
        console.error('[WS Mobile] Gagal parse pesan WS:', err);
      }
    };

    this.ws.onclose = () => {
      this.isConnected = false;
      this.emit('connection_change', { isConnected: false });
      console.log('[WS Mobile] Terputus. Mencoba reconnect dalam 3 detik...');
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => {
        if (this.deviceToken) {
          this.connect(this.deviceToken);
        }
      }, 3000);
    };

    this.ws.onerror = (err) => {
      console.error('[WS Mobile] WebSocket error:', err.message);
    };
  }

  sendLocationUpdate(locationData) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        event: 'location_update',
        data: locationData
      }));
      return true;
    }
    return false;
  }

  on(eventName, callback) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    this.listeners.get(eventName).add(callback);
    return () => this.off(eventName, callback);
  }

  off(eventName, callback) {
    if (this.listeners.has(eventName)) {
      this.listeners.get(eventName).delete(callback);
    }
  }

  emit(eventName, data) {
    if (this.listeners.has(eventName)) {
      for (const cb of this.listeners.get(eventName)) {
        try {
          cb(data);
        } catch (e) {
          console.error(`[WS Mobile] Error in listener for ${eventName}:`, e);
        }
      }
    }
  }

  disconnect() {
    clearTimeout(this.reconnectTimer);
    this.deviceToken = null;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export default new SocketService();
