// IP Wi-Fi lokal laptop/PC Anda agar bisa diakses langsung dari HP fisik di jaringan yang sama
const SERVER_HOST = (typeof window !== 'undefined' && window.location && window.location.hostname && window.location.hostname !== 'localhost')
  ? window.location.hostname
  : '172.22.200.164';

export const API_BASE_URL = `http://${SERVER_HOST}:3000/api`;
export const WS_BASE_URL = `ws://${SERVER_HOST}:3000/ws`;

class ApiService {
  constructor() {
    this.token = null;
    this.deviceToken = null;
  }

  setToken(token) {
    this.token = token;
  }

  setDeviceToken(deviceToken) {
    this.deviceToken = deviceToken;
  }

  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': '69420',
      ...(options.headers || {})
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    if (this.deviceToken) {
      headers['X-Device-Token'] = this.deviceToken;
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Terjadi kesalahan pada request API');
    }
    return data;
  }

  // Auth
  async register(email, password) {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
  }

  async login(email, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    this.token = data.token;
    return data;
  }

  // Device & Pairing (UC-01)
  async registerDevice(deviceToken, deviceName) {
    this.deviceToken = deviceToken;
    return this.request('/device/register', {
      method: 'POST',
      body: JSON.stringify({ deviceToken, deviceName })
    });
  }

  async generatePairingCode() {
    return this.request('/device/generate-code', {
      method: 'POST'
    });
  }

  async pairDevice(code) {
    return this.request('/device/pair', {
      method: 'POST',
      body: JSON.stringify({ code })
    });
  }

  async unpairDevice() {
    return this.request('/device/unpair', {
      method: 'POST'
    });
  }

  async getDeviceStatus() {
    return this.request('/device/status', {
      method: 'GET'
    });
  }

  // Location (UC-02)
  async sendLocationUpdate(coords) {
    return this.request('/location/update', {
      method: 'POST',
      body: JSON.stringify(coords)
    });
  }

  async getLatestLocations() {
    return this.request('/location/latest', {
      method: 'GET'
    });
  }

  async getLocationHistory(target = 'self', limit = 30) {
    return this.request(`/location/history?target=${target}&limit=${limit}`, {
      method: 'GET'
    });
  }

  async getNotifications() {
    return this.request('/location/notifications', {
      method: 'GET'
    });
  }
}

export default new ApiService();
