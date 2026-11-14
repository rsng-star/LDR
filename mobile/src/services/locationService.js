import * as Location from 'expo-location';
import apiService from './api';
import socketService from './socket';

class LocationService {
  constructor() {
    this.intervalId = null;
    this.locationSubscription = null;
    this.isTracking = false;
    this.lastLocation = null;
    this.updateIntervalSeconds = 10; // Sesuai PRD UC-02: interval 10s
    this.listeners = new Set();
    this.isSimulationMode = false;
  }

  setSimulationMode(enabled) {
    this.isSimulationMode = enabled;
  }

  async startTracking(deviceToken) {
    if (this.isTracking) return;
    this.isTracking = true;

    // 1. Minta izin lokasi GPS perangkat (Foreground & Background)
    try {
      if (Location && Location.requestForegroundPermissionsAsync) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          console.log('[LocationService] Izin lokasi foreground diberikan.');
          try {
            await Location.requestBackgroundPermissionsAsync();
          } catch (e) {
            // Background permission opsional di beberapa Android
          }
        } else {
          console.warn('[LocationService] Izin lokasi ditolak pengguna.');
        }
      }
    } catch (e) {
      console.warn('[LocationService] Permission check fallback:', e.message);
    }

    // 2. Kirim update pertama langsung
    await this.captureAndSendLocation();

    // 3. Jalankan loop interval setiap 10 detik
    this.intervalId = setInterval(async () => {
      await this.captureAndSendLocation();
    }, this.updateIntervalSeconds * 1000);

    console.log(`[LocationService] Pelacakan aktif. Interval pembaruan: ${this.updateIntervalSeconds}s.`);
  }

  stopTracking() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.locationSubscription) {
      try {
        this.locationSubscription.remove();
      } catch (e) {}
      this.locationSubscription = null;
    }
    this.isTracking = false;
    console.log('[LocationService] Pelacakan dihentikan.');
  }

  async captureAndSendLocation() {
    try {
      let coords = null;

      if (this.isSimulationMode && this.lastLocation) {
        // Simulasi pergerakan dinamis
        coords = {
          latitude: this.lastLocation.latitude + (Math.random() - 0.5) * 0.0003,
          longitude: this.lastLocation.longitude + (Math.random() - 0.5) * 0.0003,
          accuracy: 5,
          speed: 1.4,
          heading: Math.floor(Math.random() * 360),
          battery: 90
        };
      } else {
        // Menggunakan sensor GPS perangkat via expo-location
        try {
          if (Location && Location.getCurrentPositionAsync) {
            const loc = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
              timeout: 6000
            });
            if (loc && loc.coords) {
              coords = {
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
                accuracy: loc.coords.accuracy || 8,
                speed: loc.coords.speed || 0,
                heading: loc.coords.heading || 0,
                battery: 90
              };
            }
          }
        } catch (locErr) {
          // Fallback navigator jika di Expo Web
          if (typeof navigator !== 'undefined' && navigator.geolocation) {
            coords = await new Promise((resolve) => {
              navigator.geolocation.getCurrentPosition(
                (pos) => resolve({
                  latitude: pos.coords.latitude,
                  longitude: pos.coords.longitude,
                  accuracy: pos.coords.accuracy || 10,
                  speed: pos.coords.speed || 0,
                  heading: pos.coords.heading || 0,
                  battery: 90
                }),
                () => resolve(null),
                { enableHighAccuracy: true, timeout: 5000 }
              );
            });
          }
        }
      }

      if (!coords) {
        coords = this.lastLocation || this.getDefaultFallbackCoords();
      }

      this.lastLocation = coords;

      // 1. Coba kirim via WebSocket (latensi < 50ms)
      const sentViaWs = socketService.sendLocationUpdate(coords);

      // 2. Jika WS terputus, fallback via REST HTTPS
      if (!sentViaWs) {
        await apiService.sendLocationUpdate(coords);
      }

      this.notifyListeners(coords);
    } catch (err) {
      console.warn('[LocationService] Gagal memperbarui lokasi:', err.message);
    }
  }

  getDefaultFallbackCoords() {
    return {
      latitude: -7.8013885,
      longitude: 110.3647176,
      accuracy: 8,
      speed: 0,
      heading: 0,
      battery: 95
    };
  }

  onLocation(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notifyListeners(coords) {
    for (const cb of this.listeners) {
      try { cb(coords); } catch (e) {}
    }
  }
}

export default new LocationService();
