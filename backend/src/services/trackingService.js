const {
  saveLocation,
  getLatestLocation,
  getDeviceById,
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
    let alertInfo = null;

    // 3. Jika perangkat memiliki pasangan terhubung, hitung jarak & kirim update ke pasangan
    if (currentDevice && currentDevice.partner_device_id) {
      const partnerDevice = getDeviceById(currentDevice.partner_device_id);
      partnerLocation = getLatestLocation(currentDevice.partner_device_id);

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
      if (partnerDevice && partnerDevice.user_id) {
        matchedPlace = findMatchingPlace(partnerDevice.user_id, latitude, longitude);
      }
      if (!matchedPlace && currentDevice.user_id) {
        matchedPlace = findMatchingPlace(currentDevice.user_id, latitude, longitude);
      }

      // Siapkan payload broadcast untuk pasangan
      const broadcastPayload = {
        deviceId: currentDevice.id,
        deviceName: currentDevice.device_name,
        battery: currentDevice.battery_level,
        isOnline: true,
        location: savedLocation,
        distanceToPartner,
        distanceFormatted,
        matchedPlace,
        timestamp: savedLocation.created_at
      };

      // 4. Broadcast via WebSocket ke pasangan
      if (this.wsServer) {
        this.wsServer.sendToDevice(currentDevice.partner_device_id, {
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
