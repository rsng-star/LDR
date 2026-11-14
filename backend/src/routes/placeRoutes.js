const express = require('express');
const router = express.Router();
const {
  createSavedPlace,
  getSavedPlacesByUserId,
  deleteSavedPlace,
  getDeviceByToken,
  getDeviceByUserId
} = require('../db/database');
const { verifyToken } = require('../utils/security');

// Middleware untuk mengidentifikasi user dari Bearer Token atau X-Device-Token
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

  // 2. X-Device-Token
  const deviceToken = req.headers['x-device-token'] || req.query.device_token;
  if (deviceToken) {
    const dev = getDeviceByToken(deviceToken);
    if (dev && dev.user_id) {
      req.userId = dev.user_id;
      return next();
    }
  }

  return res.status(401).json({ error: 'Otorisasi gagal: Harap login atau sertakan token perangkat' });
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

// POST Tambah Tempat Baru
router.post('/', resolveUser, (req, res) => {
  try {
    const { name, latitude, longitude, radiusMeters, icon } = req.body;
    if (!name || typeof latitude !== 'number' || typeof longitude !== 'number') {
      return res.status(400).json({ error: 'Field name, latitude, dan longitude wajib diisi' });
    }

    const newPlace = createSavedPlace(
      req.userId,
      name.trim(),
      latitude,
      longitude,
      radiusMeters ? Number(radiusMeters) : 100,
      icon || 'home'
    );

    res.status(201).json({
      message: 'Tempat favorit berhasil disimpan',
      place: newPlace
    });
  } catch (err) {
    console.error('Create place error:', err);
    res.status(500).json({ error: 'Gagal menyimpan tempat favorit' });
  }
});

// DELETE Hapus Tempat
router.delete('/:id', resolveUser, (req, res) => {
  try {
    const placeId = parseInt(req.params.id, 10);
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
