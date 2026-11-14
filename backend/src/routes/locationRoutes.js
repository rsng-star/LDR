const express = require('express');
const router = express.Router();
const {
  getDeviceByUserId,
  getDeviceById,
  getDeviceByToken,
  getLatestLocation,
  getLocationHistory,
  getNotifications,
  getDailyLocationSummary,
  findMatchingPlace
} = require('../db/database');
const { calculateHaversineDistance, formatDistance } = require('../utils/geo');
const trackingService = require('../services/trackingService');
const { verifyToken, getUserById } = require('../utils/security');

// Deteksi Lokasi Asli Pengguna Berdasarkan Jaringan / IP (Berfungsi di HTTP maupun HTTPS)
router.get('/detect-ip-location', async (req, res) => {
  try {
    const response = await fetch('https://ipwho.is/');
    const data = await response.json();
    if (data && data.success) {
      return res.json({
        city: data.city,
        region: data.region,
        country: data.country,
        latitude: data.latitude,
        longitude: data.longitude
      });
    }
    res.json({
      city: 'Yogyakarta',
      region: 'Daerah Istimewa Yogyakarta',
      latitude: -7.8013885,
      longitude: 110.3647176
    });
  } catch (e) {
    res.json({
      city: 'Yogyakarta',
      latitude: -7.8013885,
      longitude: 110.3647176
    });
  }
});

// Helper middleware fleksibel: menerima token user (Bearer) ATAU token perangkat (X-Device-Token)
function resolveDevice(req, res, next) {
  // 1. Coba dari token device langsung (misalnya background native GPS service)
  const deviceToken = req.headers['x-device-token'] || req.body.device_token;
  if (deviceToken) {
    const dev = getDeviceByToken(deviceToken);
    if (dev) {
      req.device = dev;
      return next();
    }
  }

  // 2. Coba dari Authorization Bearer user JWT
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (decoded) {
      const dev = getDeviceByUserId(decoded.id);
      if (dev) {
        req.device = dev;
        return next();
      }
    }
  }

  return res.status(401).json({ error: 'Otorisasi gagal: Sertakan Bearer Token atau X-Device-Token' });
}

// POST GPS Update (Setiap 10s - UC-02)
router.post('/update', resolveDevice, async (req, res) => {
  try {
    const { latitude, longitude, accuracy, speed, heading, battery } = req.body;

    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return res.status(400).json({ error: 'Field latitude dan longitude (number) wajib diisi' });
    }

    const result = await trackingService.processLocationUpdate(req.device.id, {
      latitude,
      longitude,
      accuracy: accuracy || 0,
      speed: speed || 0,
      heading: heading || 0,
      battery: typeof battery === 'number' ? battery : null
    });

    res.status(200).json({
      message: 'Lokasi berhasil diperbarui',
      ...result
    });
  } catch (err) {
    console.error('Location update error:', err);
    res.status(500).json({ error: 'Gagal memperbarui lokasi' });
  }
});

// GET Latest Location Kedua Perangkat + Jarak
router.get('/latest', resolveDevice, (req, res) => {
  try {
    const myDevice = req.device;
    const myLoc = getLatestLocation(myDevice.id);

    let partnerDevice = null;
    let partnerLoc = null;
    let distance = null;
    let distanceText = null;

    if (myDevice.partner_device_id) {
      partnerDevice = getDeviceById(myDevice.partner_device_id);
      if (partnerDevice) {
        partnerLoc = getLatestLocation(partnerDevice.id);
        if (myLoc && partnerLoc) {
          distance = calculateHaversineDistance(
            myLoc.latitude,
            myLoc.longitude,
            partnerLoc.latitude,
            partnerLoc.longitude
          );
          distanceText = formatDistance(distance);
        }
      }
    }

    const myPlace = (myLoc && myDevice.user_id)
      ? findMatchingPlace(myDevice.user_id, myLoc.latitude, myLoc.longitude)
      : null;

    let partnerPlace = null;
    if (partnerLoc) {
      if (myDevice.user_id) partnerPlace = findMatchingPlace(myDevice.user_id, partnerLoc.latitude, partnerLoc.longitude);
      if (!partnerPlace && partnerDevice && partnerDevice.user_id) {
        partnerPlace = findMatchingPlace(partnerDevice.user_id, partnerLoc.latitude, partnerLoc.longitude);
      }
    }

    res.json({
      myDevice: {
        id: myDevice.id,
        name: myDevice.device_name,
        battery: myDevice.battery_level,
        isOnline: Boolean(myDevice.is_online),
        lastSeen: myDevice.last_seen,
        location: myLoc,
        place: myPlace
      },
      partnerDevice: partnerDevice ? {
        id: partnerDevice.id,
        name: partnerDevice.device_name,
        battery: partnerDevice.battery_level,
        isOnline: Boolean(partnerDevice.is_online),
        lastSeen: partnerDevice.last_seen,
        location: partnerLoc,
        place: partnerPlace
      } : null,
      distance,
      distanceFormatted: distanceText
    });
  } catch (err) {
    console.error('Get latest location error:', err);
    res.status(500).json({ error: 'Gagal mengambil data lokasi terbaru' });
  }
});

// GET History Jalur Lokasi
router.get('/history', resolveDevice, (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '100', 10);
    const target = req.query.target === 'partner' && req.device.partner_device_id
      ? req.device.partner_device_id
      : req.device.id;
    const date = req.query.date === 'today'
      ? new Date(Date.now() + 7 * 3600 * 1000).toISOString().split('T')[0]
      : (req.query.date || null);

    const history = getLocationHistory(target, limit, date);
    res.json({
      deviceId: target,
      count: history.length,
      history
    });
  } catch (err) {
    console.error('History error:', err);
    res.status(500).json({ error: 'Gagal mengambil riwayat lokasi' });
  }
});

// GET Daily Journey Summary (Fitur 6: Ringkasan Perjalanan Hari Ini)
router.get('/daily-summary', resolveDevice, (req, res) => {
  try {
    const target = req.query.target === 'partner' && req.device.partner_device_id
      ? req.device.partner_device_id
      : req.device.id;
    const date = req.query.date || null;
    const limit = parseInt(req.query.limit || '100', 10);
    const summary = getDailyLocationSummary(target, date, limit);
    res.json({
      deviceId: target,
      date: date || new Date(Date.now() + 7 * 3600 * 1000).toISOString().split('T')[0],
      summary
    });
  } catch (err) {
    console.error('Daily summary error:', err);
    res.status(500).json({ error: 'Gagal mengambil ringkasan perjalanan harian' });
  }
});

// GET Daftar Notifikasi & Peringatan Jarak
router.get('/notifications', resolveDevice, (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '20', 10);
    const notifications = getNotifications(req.device.id, limit);
    res.json({
      notifications
    });
  } catch (err) {
    console.error('Notifications fetch error:', err);
    res.status(500).json({ error: 'Gagal mengambil daftar notifikasi' });
  }
});

module.exports = router;
