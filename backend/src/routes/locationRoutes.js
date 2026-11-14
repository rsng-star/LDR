const express = require('express');
const router = express.Router();
const {
  getDeviceByUserId,
  getDeviceById,
  getDeviceByToken,
  getVerifiedPartner,
  getLatestLocation,
  getLocationHistory,
  getNotifications,
  getDailyLocationSummary,
  findMatchingPlace
} = require('../db/database');
const { calculateHaversineDistance, formatDistance } = require('../utils/geo');
const trackingService = require('../services/trackingService');
const { verifyToken } = require('../utils/security');
const {
  validateCoordinates,
  validateAccuracy,
  validateSpeed,
  validateHeading,
  validateBattery,
  validateLimit,
  validateDateString
} = require('../utils/validators');
const config = require('../config');

// Cache in-memory untuk deteksi IP (TTL 1 jam)
const ipLocationCache = new Map();

// Helper untuk memeriksa apakah IP adalah private/loopback
function isPrivateIp(ip) {
  if (!ip) return true;
  const clean = ip.replace(/^::ffff:/, '');
  return (
    clean === '127.0.0.1' ||
    clean === '::1' ||
    clean === 'localhost' ||
    clean.startsWith('10.') ||
    clean.startsWith('192.168.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(clean)
  );
}

// P1-4: Deteksi Lokasi Asli Pengguna Berdasarkan IP Klien (dengan timeout, cache & trust proxy)
router.get('/detect-ip-location', async (req, res) => {
  const fallback = {
    city: 'Yogyakarta',
    region: 'Daerah Istimewa Yogyakarta',
    country: 'Indonesia',
    latitude: -7.8013885,
    longitude: 110.3647176
  };

  try {
    const rawIp = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
    const clientIp = rawIp ? rawIp.replace(/^::ffff:/, '').trim() : '';

    if (!clientIp || isPrivateIp(clientIp)) {
      return res.json(fallback);
    }

    // Cek cache
    const cached = ipLocationCache.get(clientIp);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json(cached.data);
    }

    // Fetch dengan timeout 3 detik
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`https://ipwho.is/${clientIp}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const data = await response.json();
    if (data && data.success) {
      const result = {
        city: data.city || fallback.city,
        region: data.region || fallback.region,
        country: data.country || fallback.country,
        latitude: typeof data.latitude === 'number' ? data.latitude : fallback.latitude,
        longitude: typeof data.longitude === 'number' ? data.longitude : fallback.longitude
      };
      ipLocationCache.set(clientIp, { data: result, expiresAt: Date.now() + 3600000 });
      return res.json(result);
    }

    return res.json(fallback);
  } catch (e) {
    return res.json(fallback);
  }
});

// Helper middleware: menerima token user (Bearer) ATAU token perangkat (X-Device-Token Header SAJA)
function resolveDevice(req, res, next) {
  // 1. Coba dari X-Device-Token
  const deviceToken = req.headers['x-device-token'];
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
    if (decoded && decoded.id) {
      const dev = getDeviceByUserId(decoded.id);
      if (dev) {
        req.device = dev;
        return next();
      }
    }
  }

  return res.status(401).json({ error: 'Otorisasi gagal: Sertakan Bearer Token atau Header X-Device-Token' });
}

// POST GPS Update (Setiap 10s - UC-02)
router.post('/update', resolveDevice, async (req, res) => {
  try {
    const { latitude, longitude, accuracy, speed, heading, battery } = req.body;

    // P2-1: Validasi ketat koordinat & telemetri
    const coords = validateCoordinates(latitude, longitude);
    const cleanAccuracy = validateAccuracy(accuracy);
    const cleanSpeed = validateSpeed(speed);
    const cleanHeading = validateHeading(heading);
    const cleanBattery = validateBattery(battery);

    const result = await trackingService.processLocationUpdate(req.device.id, {
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: cleanAccuracy,
      speed: cleanSpeed,
      heading: cleanHeading,
      battery: cleanBattery
    });

    res.status(200).json({
      message: 'Lokasi berhasil diperbarui',
      ...result
    });
  } catch (err) {
    console.error('Location update error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Gagal memperbarui lokasi' });
  }
});

// GET Latest Location Kedua Perangkat + Jarak (P0-4 Verifikasi Timbal Balik & P3-3 Privacy Check)
router.get('/latest', resolveDevice, (req, res) => {
  try {
    const myDevice = req.device;
    const myLoc = getLatestLocation(myDevice.id);

    // P0-4: Pastikan hubungan timbal-balik (mutual)
    const partnerDevice = getVerifiedPartner(myDevice.id);
    let partnerLoc = null;
    let distance = null;
    let distanceText = null;

    // P3-3: Cek apakah pasangan sedang menjeda berbagi lokasi
    const partnerSharingPaused = partnerDevice ? Boolean(partnerDevice.is_sharing_paused) : false;

    if (partnerDevice && !partnerSharingPaused) {
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

    const myPlace = (myLoc && myDevice.user_id)
      ? findMatchingPlace(myDevice.user_id, myLoc.latitude, myLoc.longitude)
      : null;

    let partnerPlace = null;
    if (partnerLoc && !partnerSharingPaused) {
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
        isSharingPaused: Boolean(myDevice.is_sharing_paused),
        lastSeen: myDevice.last_seen,
        location: myLoc,
        place: myPlace
      },
      partnerDevice: partnerDevice ? {
        id: partnerDevice.id,
        name: partnerDevice.device_name,
        battery: partnerDevice.battery_level,
        isOnline: Boolean(partnerDevice.is_online),
        isSharingPaused: partnerSharingPaused,
        lastSeen: partnerDevice.last_seen,
        location: partnerSharingPaused ? null : partnerLoc,
        place: partnerSharingPaused ? null : partnerPlace
      } : null,
      distance,
      distanceFormatted: distanceText
    });
  } catch (err) {
    console.error('Get latest location error:', err);
    res.status(500).json({ error: 'Gagal mengambil data lokasi terbaru' });
  }
});

// GET History Jalur Lokasi (P0-4 Reciprocal Check & P2-1 Input Clamping)
router.get('/history', resolveDevice, (req, res) => {
  try {
    const limit = validateLimit(req.query.limit, 100, 500);
    const isPartnerTarget = req.query.target === 'partner';
    let targetDeviceId = req.device.id;

    if (isPartnerTarget) {
      const verifiedPartner = getVerifiedPartner(req.device.id);
      if (!verifiedPartner) {
        return res.status(403).json({ error: 'Tidak memiliki akses riwayat: Hubungan pasangan tidak aktif atau tidak timbal-balik' });
      }
      if (verifiedPartner.is_sharing_paused) {
        return res.status(403).json({ error: 'Pasangan sedang menjeda berbagi lokasi' });
      }
      targetDeviceId = verifiedPartner.id;
    }

    const dateQuery = req.query.date === 'today'
      ? new Date(Date.now() + (config.TIMEZONE_OFFSET_HOURS || 7) * 3600 * 1000).toISOString().split('T')[0]
      : validateDateString(req.query.date);

    const history = getLocationHistory(targetDeviceId, limit, dateQuery);
    res.json({
      deviceId: targetDeviceId,
      count: history.length,
      history
    });
  } catch (err) {
    console.error('History error:', err);
    res.status(500).json({ error: 'Gagal mengambil riwayat lokasi' });
  }
});

// GET Daily Journey Summary (P1-1: Hitung Seluruh Titik Hari Itu)
router.get('/daily-summary', resolveDevice, (req, res) => {
  try {
    const isPartnerTarget = req.query.target === 'partner';
    let targetDeviceId = req.device.id;

    if (isPartnerTarget) {
      const verifiedPartner = getVerifiedPartner(req.device.id);
      if (!verifiedPartner) {
        return res.status(403).json({ error: 'Tidak memiliki akses ringkasan: Hubungan pasangan tidak aktif atau tidak timbal-balik' });
      }
      if (verifiedPartner.is_sharing_paused) {
        return res.status(403).json({ error: 'Pasangan sedang menjeda berbagi lokasi' });
      }
      targetDeviceId = verifiedPartner.id;
    }

    const dateQuery = validateDateString(req.query.date);
    const summary = getDailyLocationSummary(targetDeviceId, dateQuery);
    res.json({
      deviceId: targetDeviceId,
      date: dateQuery || new Date(Date.now() + (config.TIMEZONE_OFFSET_HOURS || 7) * 3600 * 1000).toISOString().split('T')[0],
      summary
    });
  } catch (err) {
    console.error('Daily summary error:', err);
    res.status(500).json({ error: 'Gagal mengambil ringkasan perjalanan harian' });
  }
});

// GET Daftar Notifikasi
router.get('/notifications', resolveDevice, (req, res) => {
  try {
    const limit = validateLimit(req.query.limit, 20, 100);
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
