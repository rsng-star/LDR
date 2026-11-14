const {
  saveLocation,
  getLatestLocation,
  getDeviceById,
  getVerifiedPartner,
  updateDeviceStatus,
  findMatchingPlace
} = require('../db/database');
const { calculateHaversineDistance, formatDistance } = require('../utils/geo');
const notificationService = require('./notificationService');

/**
 * Service untuk memproses koordinat GPS secara realtime
 */
class TrackingService {
  constructor() {
    this.wsServer = null;
  }

  setWebSocketServer(wsServer) {
    this.wsServer = wsServer;
    notificationService.setWebSocketServer(wsServer);
  }

  /**
   * Menerima pembaruan GPS dari perangkat
   */
  async processLocationUpdate(deviceId, { latitude, longitude, accuracy = 0, speed = 0, heading = 0, battery = null }) {
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      throw new Error('Koordinat latitude dan longitude harus berupa angka valid');
    }

    // 1. Simpan lokasi baru ke database
    const savedLocation = saveLocation(deviceId, latitude, longitude, accuracy, speed, heading);
    const nowIso = new Date().toISOString();

    // 2. Perbarui status baterai dan online status
    if (battery !== null) {
      updateDeviceStatus(deviceId, true, battery);
    } else {
      updateDeviceStatus(deviceId, true);
    }

    const currentDevice = getDeviceById(deviceId);
    let distanceToPartner = null;
    let distanceFormatted = null;
    let partnerLocation = null;

    // 3. P0-4: Verifikasi hubungan timbal-balik (mutual) sebelum membagikan lokasi
    const partnerDevice = getVerifiedPartner(deviceId);
    const isPaused = currentDevice ? Boolean(currentDevice.is_sharing_paused) : false;

    if (partnerDevice && !isPaused) {
      partnerLocation = getLatestLocation(partnerDevice.id);

      if (partnerLocation) {
        distanceToPartner = calculateHaversineDistance(
          latitude,
          longitude,
          partnerLocation.latitude,
          partnerLocation.longitude
        );
        distanceFormatted = formatDistance(distanceToPartner);
      }

      let matchedPlace = null;
      if (partnerDevice.user_id) {
        matchedPlace = findMatchingPlace(partnerDevice.user_id, latitude, longitude);
      }
      if (!matchedPlace && currentDevice.user_id) {
        matchedPlace = findMatchingPlace(currentDevice.user_id, latitude, longitude);
      }

      // P1-6: Pastikan timestamp & lastSeen menggunakan waktu penerimaan terbaru (bukan titik lama jika jitter filter aktif)
      const broadcastPayload = {
        deviceId: currentDevice.id,
        deviceName: currentDevice.device_name,
        battery: currentDevice.battery_level,
        isOnline: true,
        isSharingPaused: false,
        location: savedLocation,
        distanceToPartner,
        distanceFormatted,
        matchedPlace,
        lastSeen: nowIso,
        timestamp: nowIso
      };

      // 4. Broadcast via WebSocket ke pasangan
      if (this.wsServer) {
        this.wsServer.sendToDevice(partnerDevice.id, {
          event: 'partner_location_update',
          data: broadcastPayload
        });
      }
    }

    return {
      success: true,
      location: savedLocation,
      distanceToPartner,
      distanceFormatted
    };
  }
}

module.exports = new TrackingService();
