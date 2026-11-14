const express = require('express');
const router = express.Router();
const {
  registerOrGetDevice,
  getDeviceById,
  getDeviceByToken,
  getDeviceByUserId,
  generatePairingCode,
  pairDevices,
  unpairDevice,
  db
} = require('../db/database');
const { authenticateUser } = require('../utils/security');
const notificationService = require('../services/notificationService');

// Registrasi Perangkat Mobile untuk User
router.post('/register', authenticateUser, (req, res) => {
  try {
    const { deviceToken, deviceName } = req.body;
    if (!deviceToken) {
      return res.status(400).json({ error: 'deviceToken wajib disertakan' });
    }

    const device = registerOrGetDevice(req.user.id, deviceToken, deviceName || 'Smartphone Pribadi');
    res.status(200).json({
      message: 'Perangkat berhasil terdaftar',
      device
    });
  } catch (err) {
    console.error('Device register error:', err);
    res.status(500).json({ error: 'Gagal mendaftarkan perangkat' });
  }
});

// Generate Kode Pairing 6 Digit & Payload QR Code (UC-01)
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
      message: 'Kode pairing berhasil dibuat. Gunakan kode ini atau scan QR di perangkat pasangan.'
    });
  } catch (err) {
    console.error('Generate pairing code error:', err);
    res.status(500).json({ error: 'Gagal membuat kode pairing' });
  }
});

// Memasangkan Perangkat dengan Kode / Hasil Scan QR (UC-01)
router.post('/pair', authenticateUser, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Kode pairing wajib diisi' });
    }

    // Ambil perangkat milik user yang sedang request
    const myDevice = getDeviceByUserId(req.user.id);
    if (!myDevice) {
      return res.status(404).json({ error: 'Perangkat Anda belum terdaftar' });
    }

    const cleanCode = code.trim().toUpperCase();

    // Cari perangkat target berdasarkan kode pairing
    const targetDevice = db.prepare(`
      SELECT * FROM devices 
      WHERE pairing_code = ? AND pairing_code_expires_at > CURRENT_TIMESTAMP
    `).get(cleanCode);

    if (!targetDevice) {
      return res.status(404).json({ error: 'Kode pairing tidak valid atau telah kedaluwarsa' });
    }

    if (targetDevice.id === myDevice.id) {
      return res.status(400).json({ error: 'Tidak dapat memasangkan dengan perangkat Anda sendiri' });
    }

    // Eksekusi pairing 2 perangkat
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

// Putuskan hubungan (Unpair)
router.post('/unpair', authenticateUser, (req, res) => {
  try {
    const myDevice = getDeviceByUserId(req.user.id);
    if (!myDevice) {
      return res.status(404).json({ error: 'Perangkat Anda tidak ditemukan' });
    }

    unpairDevice(myDevice.id);
    res.json({ message: 'Perangkat berhasil diputuskan' });
  } catch (err) {
    console.error('Unpair error:', err);
    res.status(500).json({ error: 'Gagal memutuskan perangkat' });
  }
});

// Ambil Status Perangkat Sendiri & Partner
router.get('/status', authenticateUser, (req, res) => {
  try {
    const myDevice = getDeviceByUserId(req.user.id);
    if (!myDevice) {
      return res.status(404).json({ error: 'Perangkat Anda tidak ditemukan' });
    }

    let partnerDevice = null;
    if (myDevice.partner_device_id) {
      partnerDevice = getDeviceById(myDevice.partner_device_id);
    }

    res.json({
      device: myDevice,
      partner: partnerDevice ? {
        id: partnerDevice.id,
        name: partnerDevice.device_name,
        isOnline: Boolean(partnerDevice.is_online),
        battery: partnerDevice.battery_level,
        lastSeen: partnerDevice.last_seen
      } : null
    });
  } catch (err) {
    console.error('Status check error:', err);
    res.status(500).json({ error: 'Gagal mengambil status perangkat' });
  }
});

module.exports = router;
