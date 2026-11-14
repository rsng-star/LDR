const express = require('express');
const router = express.Router();
const {
  createSavedPlace,
  getSavedPlacesByUserId,
  deleteSavedPlace,
  getDeviceByToken
} = require('../db/database');
const { verifyToken } = require('../utils/security');
const {
  validatePlaceName,
  validatePlaceIcon,
  validateCoordinates,
  validateRadius
} = require('../utils/validators');

// Middleware untuk mengidentifikasi user dari Bearer Token atau X-Device-Token (Header SAJA)
function resolveUser(req, res, next) {
  // 1. Bearer Token
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (decoded && decoded.id) {
      req.userId = decoded.id;
      return next();
    }
  }

  // 2. X-Device-Token (P2-4: Tidak menerima via query string demi keamanan)
  const deviceToken = req.headers['x-device-token'];
  if (deviceToken) {
    const dev = getDeviceByToken(deviceToken);
    if (dev && dev.user_id) {
      req.userId = dev.user_id;
      return next();
    }
  }

  return res.status(401).json({ error: 'Otorisasi gagal: Harap login atau sertakan header X-Device-Token' });
}

// GET Daftar Tempat Tersimpan
router.get('/', resolveUser, (req, res) => {
  try {
    const places = getSavedPlacesByUserId(req.userId);
    res.json({ places });
  } catch (err) {
    console.error('Get places error:', err);
    res.status(500).json({ error: 'Gagal mengambil daftar tempat favorit' });
  }
});

// POST Tambah Tempat Baru (P0-2 & P2-1: Validasi Input & Sanitasi)
router.post('/', resolveUser, (req, res) => {
  try {
    const { name, latitude, longitude, radiusMeters, icon } = req.body;
    if (!name || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Field name, latitude, dan longitude wajib diisi' });
    }

    const cleanName = validatePlaceName(name);
    const coords = validateCoordinates(latitude, longitude);
    const cleanRadius = validateRadius(radiusMeters, 100);
    const cleanIcon = validatePlaceIcon(icon);

    const newPlace = createSavedPlace(
      req.userId,
      cleanName,
      coords.latitude,
      coords.longitude,
      cleanRadius,
      cleanIcon
    );

    res.status(201).json({
      message: 'Tempat favorit berhasil disimpan',
      place: newPlace
    });
  } catch (err) {
    console.error('Create place error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Gagal menyimpan tempat favorit' });
  }
});

// DELETE Hapus Tempat
router.delete('/:id', resolveUser, (req, res) => {
  try {
    const placeId = parseInt(req.params.id, 10);
    if (isNaN(placeId)) {
      return res.status(400).json({ error: 'ID tempat tidak valid' });
    }
    const success = deleteSavedPlace(placeId, req.userId);
    if (!success) {
      return res.status(404).json({ error: 'Tempat tidak ditemukan atau bukan milik Anda' });
    }
    res.json({ message: 'Tempat berhasil dihapus' });
  } catch (err) {
    console.error('Delete place error:', err);
    res.status(500).json({ error: 'Gagal menghapus tempat' });
  }
});

module.exports = router;
