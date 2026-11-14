const config = require('../config');
const { saveNotification } = require('../db/database');
const { formatDistance } = require('../utils/geo');

/**
 * Service untuk menangani pengiriman push notification & alert jarak
 */
class NotificationService {
  constructor() {
    this.wsServer = null; // Di-set saat WebSocket Server aktif
  }

  setWebSocketServer(wsServer) {
    this.wsServer = wsServer;
  }

  /**
   * Peringatan jarak dinonaktifkan sesuai spesifikasi proyek:
   * Proyek bertujuan untuk mengetahui jarak dan lokasi tanpa logika peringatan jarak.
   */
  async checkDistanceAlert(device, partnerDevice, distanceMeters) {
    return null;
  }

  /**
   * Notifikasi saat pairing berhasil
   */
  async notifyPairingSuccess(device1, device2) {
    const timestamp = new Date().toISOString();
    const payload1 = {
      type: 'PAIRING_SUCCESS',
      title: 'Berhasil Terhubung!',
      message: `Perangkat Anda berhasil terhubung dengan ${device2.device_name || 'Pasangan'}.`,
      timestamp,
      partnerId: device2.id,
      partnerName: device2.device_name
    };

    const payload2 = {
      type: 'PAIRING_SUCCESS',
      title: 'Berhasil Terhubung!',
      message: `Perangkat Anda berhasil terhubung dengan ${device1.device_name || 'Pasangan'}.`,
      timestamp,
      partnerId: device1.id,
      partnerName: device1.device_name
    };

    saveNotification(device1.id, device2.id, 'PAIRING_SUCCESS', 0, payload1.message);
    saveNotification(device2.id, device1.id, 'PAIRING_SUCCESS', 0, payload2.message);

    if (this.wsServer) {
      this.wsServer.sendToDevice(device1.id, { event: 'pairing_success', data: payload1 });
      this.wsServer.sendToDevice(device2.id, { event: 'pairing_success', data: payload2 });
    }

    return { payload1, payload2 };
  }

  /**
   * Dispatcher notifikasi eksternal (FCM / Webhook / APNs Ready)
   */
  async dispatchExternalPush(targetDevice, payload) {
    const fcmServerKey = process.env.FCM_SERVER_KEY;
    const webhookUrl = process.env.ALERT_WEBHOOK_URL;

    // Jika FCM key dikonfigurasi di Environment
    if (fcmServerKey && targetDevice.fcm_token) {
      try {
        await fetch('https://fcm.googleapis.com/fcm/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `key=${fcmServerKey}`
          },
          body: JSON.stringify({
            to: targetDevice.fcm_token,
            notification: {
              title: payload.title,
              body: payload.message,
              sound: 'default'
            },
            data: payload
          })
        });
        console.log(`[FCM PUSH] Berhasil terkirim ke FCM Token Device #${targetDevice.id}`);
      } catch (err) {
        console.warn(`[FCM PUSH] Gagal mengirim: ${err.message}`);
      }
    }

    // Jika Webhook Eksternal dikonfigurasi
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        console.log(`[WEBHOOK PUSH] Berhasil terkirim ke ${webhookUrl}`);
      } catch (err) {
        console.warn(`[WEBHOOK PUSH] Gagal: ${err.message}`);
      }
    }

    // Default System Dispatch Log
    console.log(`[PUSH NOTIFICATION] Terkirim ke Device #${targetDevice.id}: ${payload.message}`);
  }
}

module.exports = new NotificationService();
