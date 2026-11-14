const express = require('express');
const router = express.Router();
const {
  registerOrGetDevice,
  getDeviceById,
  getDeviceByUserId,
  getVerifiedPartner,
  generatePairingCode,
  pairDevices,
  unpairDevice,
  setSharingPaused,
  db
} = require('../db/database');
const { authenticateUser, pairRateLimiter } = require('../utils/security');
const { validateDeviceName } = require('../utils/validators');
const notificationService = require('../services/notificationService');

// Registrasi Perangkat Mobile untuk User
// P0-1: Token dibuat SERVER crypto.randomBytes, klien tidak lagi memilih token
router.post('/register', authenticateUser, (req, res) => {
  try {
    const { deviceName, deviceToken } = req.body;
    const sanitizedName = validateDeviceName(deviceName);

    // Bila client mengirimkan deviceToken milik pengguna lain, registerOrGetDevice akan menolaknya (403)
    const device = registerOrGetDevice(req.user.id, sanitizedName, deviceToken || null);
    res.status(200).json({
      message: 'Perangkat berhasil terdaftar',
      device
    });
  } catch (err) {
    console.error('Device register error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Gagal mendaftarkan perangkat' });
  }
});

// Generate Kode Pairing 6 Digit & Payload QR Code (UC-01)
// P0-3: Kode aman crypto.randomInt dan kedaluwarsa 15 menit
router.post('/generate-code', authenticateUser, (req, res) => {
  try {
    const device = getDeviceByUserId(req.user.id);
    if (!device) {
      return res.status(404).json({ error: 'Perangkat Anda belum terdaftar. Silakan registrasi terlebih dahulu.' });
    }

    const { code, expiresAt } = generatePairingCode(device.id);

    // Payload QR code format terstandarisasi JSON
    const qrPayload = JSON.stringify({
      type: 'TANPILAN_PAIR',
      code,
      deviceId: device.id,
      deviceName: device.device_name,
      expiresAt
    });

    res.json({
      code,
      qrPayload,
      expiresAt,
      message: 'Kode pairing berhasil dibuat. Berlaku selama 15 menit.'
    });
  } catch (err) {
    console.error('Generate pairing code error:', err);
    res.status(500).json({ error: 'Gagal membuat kode pairing' });
  }
});

// Memasangkan Perangkat dengan Kode / Hasil Scan QR (UC-01)
// P0-3: Dilindungi rate limiter & pengecekan kedaluwarsa waktu nyata
router.post('/pair', authenticateUser, pairRateLimiter, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Kode pairing wajib diisi' });
    }

    const myDevice = getDeviceByUserId(req.user.id);
    if (!myDevice) {
      return res.status(404).json({ error: 'Perangkat Anda belum terdaftar' });
    }

    const cleanCode = code.trim().toUpperCase();
    const nowMs = Date.now();

    // P0-3: Bug kedaluwarsa diperbaiki - bandingkan waktu epoch INTEGER atau ISO konsisten
    const targetDevice = db.prepare(`
      SELECT * FROM devices 
      WHERE pairing_code = ? 
        AND (
          (typeof(pairing_code_expires_at) = 'integer' AND pairing_code_expires_at > ?)
          OR (typeof(pairing_code_expires_at) = 'text' AND pairing_code_expires_at > datetime('now'))
        )
    `).get(cleanCode, nowMs);

    if (!targetDevice) {
      return res.status(404).json({ error: 'Kode pairing tidak valid atau telah kedaluwarsa' });
    }

    if (targetDevice.id === myDevice.id) {
      return res.status(400).json({ error: 'Tidak dapat memasangkan dengan perangkat Anda sendiri' });
    }

    // P0-4: Eksekusi pairing 1:1 dalam transaksi aman, putuskan pasangan lama dari kedua belah pihak
    const pairResult = pairDevices(myDevice.id, targetDevice.id);

    // Notifikasi kedua perangkat
    await notificationService.notifyPairingSuccess(pairResult.device1, pairResult.device2);

    res.json({
      success: true,
      message: 'Device berhasil terdaftar dan terhubung!',
      partner: {
        id: targetDevice.id,
        name: targetDevice.device_name,
        isOnline: Boolean(targetDevice.is_online),
        battery: targetDevice.battery_level
      }
    });
  } catch (err) {
    console.error('Pairing error:', err);
    res.status(500).json({ error: err.message || 'Gagal memasangkan perangkat' });
  }
});

// P3-3: Jeda / Lanjutkan Berbagi Lokasi
router.post('/pause-sharing', authenticateUser, (req, res) => {
  try {
    const myDevice = getDeviceByUserId(req.user.id);
    if (!myDevice) {
      return res.status(404).json({ error: 'Perangkat Anda tidak ditemukan' });
    }

    const { pause } = req.body;
    const shouldPause = typeof pause === 'boolean' ? pause : (myDevice.is_sharing_paused ? false : true);
    const updated = setSharingPaused(myDevice.id, shouldPause);

    res.json({
      message: shouldPause ? 'Berbagi lokasi dijeda' : 'Berbagi lokasi diaktifkan kembali',
      isSharingPaused: Boolean(updated.is_sharing_paused)
    });
  } catch (err) {
    console.error('Pause sharing error:', err);
    res.status(500).json({ error: 'Gagal mengubah status jeda berbagi lokasi' });
  }
});

// Putuskan hubungan (Unpair) - P3-3 & P0-4
router.post('/unpair', authenticateUser, (req, res) => {
  try {
    const myDevice = getDeviceByUserId(req.user.id);
    if (!myDevice) {
      return res.status(404).json({ error: 'Perangkat Anda tidak ditemukan' });
    }

    unpairDevice(myDevice.id);
    res.json({ message: 'Perangkat berhasil diputuskan secara timbal-balik' });
  } catch (err) {
    console.error('Unpair error:', err);
    res.status(500).json({ error: 'Gagal memutuskan perangkat' });
  }
});

// Ambil Status Perangkat Sendiri & Partner (P0-4 Verifikasi Timbal Balik)
router.get('/status', authenticateUser, (req, res) => {
  try {
    const myDevice = getDeviceByUserId(req.user.id);
    if (!myDevice) {
      return res.status(404).json({ error: 'Perangkat Anda tidak ditemukan' });
    }

    // P0-4: Hubungan pasangan wajib diverifikasi timbal balik
    const partnerDevice = getVerifiedPartner(myDevice.id);

    res.json({
      device: myDevice,
      partner: partnerDevice ? {
        id: partnerDevice.id,
        name: partnerDevice.device_name,
        isOnline: Boolean(partnerDevice.is_online),
        battery: partnerDevice.battery_level,
        isSharingPaused: Boolean(partnerDevice.is_sharing_paused),
        lastSeen: partnerDevice.last_seen
      } : null
    });
  } catch (err) {
    console.error('Status check error:', err);
    res.status(500).json({ error: 'Gagal mengambil status perangkat' });
  }
});

module.exports = router;
