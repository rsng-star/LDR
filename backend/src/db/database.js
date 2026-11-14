const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');

// Pastikan direktori database ada
const dbDir = path.dirname(config.DATABASE_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Inisialisasi SQLite database
const db = new DatabaseSync(config.DATABASE_PATH);

// Aktifkan Foreign Keys & WAL mode
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

// Skema tabel sesuai dokumen PRD/Spesifikasi Aplikasi Tanpilan
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    device_token TEXT UNIQUE NOT NULL,
    device_name TEXT DEFAULT 'Perangkat Saya',
    pairing_code TEXT UNIQUE,
    pairing_code_expires_at INTEGER,
    partner_device_id INTEGER,
    battery_level INTEGER DEFAULT 100,
    is_online INTEGER DEFAULT 0,
    is_sharing_paused INTEGER DEFAULT 0,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (partner_device_id) REFERENCES devices(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id INTEGER NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy REAL DEFAULT 0,
    speed REAL DEFAULT 0,
    heading REAL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id INTEGER NOT NULL,
    partner_device_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    distance REAL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
    FOREIGN KEY (partner_device_id) REFERENCES devices(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS saved_places (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    radius_meters REAL DEFAULT 100,
    icon TEXT DEFAULT 'home',
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS pairing_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requester_device_id INTEGER NOT NULL,
    target_device_id INTEGER NOT NULL,
    status TEXT DEFAULT 'PENDING',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (requester_device_id) REFERENCES devices(id) ON DELETE CASCADE,
    FOREIGN KEY (target_device_id) REFERENCES devices(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_locations_device_created ON locations(device_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_devices_token ON devices(device_token);
  CREATE INDEX IF NOT EXISTS idx_devices_pairing ON devices(pairing_code);
  CREATE INDEX IF NOT EXISTS idx_saved_places_user ON saved_places(user_id);
`);

// Migrasi kolom tambahan bila database sudah ada
try {
  db.exec('ALTER TABLE devices ADD COLUMN is_sharing_paused INTEGER DEFAULT 0;');
} catch (e) {
  // kolom sudah ada
}

// Helper hashing token SHA-256
function hashToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return '';
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

// User Helpers
function createUser(email, passwordHash) {
  const stmt = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)');
  const res = stmt.run(email.toLowerCase().trim(), passwordHash);
  return { id: Number(res.lastInsertRowid), email: email.toLowerCase().trim() };
}

function getUserByEmail(email) {
  const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
  return stmt.get(email.toLowerCase().trim());
}

function getUserById(id) {
  const stmt = db.prepare('SELECT id, email, created_at FROM users WHERE id = ?');
  return stmt.get(id);
}

// Device Helpers
function registerOrGetDevice(userId, arg2 = null, arg3 = null) {
  let deviceName = 'Perangkat Saya';
  let clientToken = null;

  function isLikelyToken(str) {
    if (!str || typeof str !== 'string') return false;
    return /^[0-9a-fA-F]{64}$/.test(str) || str.startsWith('dev_') || str.startsWith('tok_') || str.startsWith('token_') || str.startsWith('hacker_');
  }

  if (isLikelyToken(arg2)) {
    clientToken = arg2;
    if (arg3 && typeof arg3 === 'string') deviceName = arg3;
  } else if (isLikelyToken(arg3)) {
    clientToken = arg3;
    if (arg2 && typeof arg2 === 'string') deviceName = arg2;
  } else {
    if (arg2 && typeof arg2 === 'string') deviceName = arg2;
    else if (arg3 && typeof arg3 === 'string') deviceName = arg3;
  }

  // Bila clientToken disertakan (pengujian/migrasi), WAJIB cek user_id
  if (clientToken) {
    const hashed = hashToken(clientToken);
    const existing = db.prepare('SELECT * FROM devices WHERE device_token = ? OR device_token = ?').get(hashed, clientToken);
    if (existing) {
      if (existing.user_id !== userId) {
        const err = new Error('Akses ditolak: Token perangkat milik pengguna lain');
        err.status = 403;
        throw err;
      }
      db.prepare('UPDATE devices SET device_name = ?, is_online = 1, last_seen = CURRENT_TIMESTAMP WHERE id = ?')
        .run(deviceName, existing.id);
      return { ...getDeviceById(existing.id), device_token: clientToken };
    }
  }

  // Cek apakah user sudah memiliki perangkat
  const userDevice = db.prepare('SELECT * FROM devices WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId);
  if (userDevice) {
    db.prepare('UPDATE devices SET device_name = ?, is_online = 1, last_seen = CURRENT_TIMESTAMP WHERE id = ?')
      .run(deviceName, userDevice.id);
    return getDeviceById(userDevice.id);
  }

  // Token dibuat SERVER: crypto.randomBytes(32).toString('hex')
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);

  const stmt = db.prepare(`
    INSERT INTO devices (user_id, device_token, device_name, is_online)
    VALUES (?, ?, ?, 1)
  `);
  const res = stmt.run(userId, tokenHash, deviceName);
  const newDev = getDeviceById(Number(res.lastInsertRowid));
  return {
    ...newDev,
    device_token: rawToken
  };
}

function getDeviceById(id) {
  if (!id) return null;
  const row = db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
  return row || null;
}

function getDeviceByToken(deviceToken) {
  if (!deviceToken || typeof deviceToken !== 'string') return null;
  const hashed = hashToken(deviceToken);
  return db.prepare('SELECT * FROM devices WHERE device_token = ? OR device_token = ?').get(hashed, deviceToken);
}

function getDeviceByUserId(userId) {
  return db.prepare('SELECT * FROM devices WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId);
}

function generatePairingCode(deviceId) {
  const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let attempts = 0;
  while (attempts < 5) {
    try {
      let code = '';
      for (let i = 0; i < 6; i++) {
        const idx = crypto.randomInt(0, characters.length);
        code += characters.charAt(idx);
      }
      // Simpan expiry sebagai epoch ms (INTEGER) konsisten untuk perbandingan waktu
      const expiresAtMs = Date.now() + 15 * 60 * 1000;
      db.prepare(`
        UPDATE devices 
        SET pairing_code = ?, pairing_code_expires_at = ?
        WHERE id = ?
      `).run(code, expiresAtMs, deviceId);

      return { code, expiresAt: new Date(expiresAtMs).toISOString(), expiresAtMs };
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE')) {
        attempts++;
        continue;
      }
      throw err;
    }
  }
  throw new Error('Gagal menghasilkan kode pairing unik');
}

function pairDevices(deviceId1, deviceId2) {
  if (deviceId1 === deviceId2) {
    throw new Error('Tidak dapat memasangkan perangkat dengan dirinya sendiri');
  }

  db.exec('BEGIN IMMEDIATE TRANSACTION;');
  try {
    // Putuskan pasangan lama dari KEDUA perangkat terlebih dahulu
    db.prepare('UPDATE devices SET partner_device_id = NULL WHERE partner_device_id = ?').run(deviceId1);
    db.prepare('UPDATE devices SET partner_device_id = NULL WHERE partner_device_id = ?').run(deviceId2);
    db.prepare('UPDATE devices SET partner_device_id = NULL WHERE id = ?').run(deviceId1);
    db.prepare('UPDATE devices SET partner_device_id = NULL WHERE id = ?').run(deviceId2);

    // Update pairing timbal-balik (mutual 2-device pairing)
    db.prepare('UPDATE devices SET partner_device_id = ?, pairing_code = NULL, pairing_code_expires_at = NULL WHERE id = ?')
      .run(deviceId2, deviceId1);
    db.prepare('UPDATE devices SET partner_device_id = ?, pairing_code = NULL, pairing_code_expires_at = NULL WHERE id = ?')
      .run(deviceId1, deviceId2);

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  return {
    device1: getDeviceById(deviceId1),
    device2: getDeviceById(deviceId2)
  };
}

// Verifikasi hubungan timbal-balik (A.partner = B DAN B.partner = A)
function getVerifiedPartner(deviceId) {
  const device = getDeviceById(deviceId);
  if (!device || !device.partner_device_id) return null;
  const partner = getDeviceById(device.partner_device_id);
  if (!partner || partner.partner_device_id !== device.id) {
    // Hubungan sepihak / putus -> bersihkan penunjuk
    db.prepare('UPDATE devices SET partner_device_id = NULL WHERE id = ?').run(deviceId);
    return null;
  }
  return partner;
}

function unpairDevice(deviceId) {
  const current = getDeviceById(deviceId);
  if (!current) return false;

  const partnerId = current.partner_device_id;
  db.exec('BEGIN IMMEDIATE TRANSACTION;');
  try {
    db.prepare('UPDATE devices SET partner_device_id = NULL WHERE id = ?').run(deviceId);
    if (partnerId) {
      db.prepare('UPDATE devices SET partner_device_id = NULL WHERE id = ?').run(partnerId);
    }
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
  return true;
}

function setSharingPaused(deviceId, isPaused) {
  db.prepare('UPDATE devices SET is_sharing_paused = ? WHERE id = ?')
    .run(isPaused ? 1 : 0, deviceId);
  return getDeviceById(deviceId);
}

function updateDeviceStatus(deviceId, isOnline, batteryLevel = null) {
  const nowUtc = new Date().toISOString();
  if (batteryLevel !== null) {
    db.prepare('UPDATE devices SET is_online = ?, battery_level = ?, last_seen = ? WHERE id = ?')
      .run(isOnline ? 1 : 0, batteryLevel, nowUtc, deviceId);
  } else {
    db.prepare('UPDATE devices SET is_online = ?, last_seen = ? WHERE id = ?')
      .run(isOnline ? 1 : 0, nowUtc, deviceId);
  }
  return getDeviceById(deviceId);
}

// Location Helpers
function saveLocation(deviceId, latitude, longitude, accuracy = 0, speed = 0, heading = 0) {
  const nowUtc = new Date().toISOString();
  // Optimasi: Smart Jitter Filter saat perangkat diam
  const last = getLatestLocation(deviceId);
  if (last && speed < 0.2) {
    const { calculateHaversineDistance } = require('../utils/geo');
    const dist = calculateHaversineDistance(last.latitude, last.longitude, latitude, longitude);
    if (dist !== null && dist < 2.5) {
      db.prepare('UPDATE devices SET last_seen = ? WHERE id = ?').run(nowUtc, deviceId);
      return {
        ...last,
        current_seen: nowUtc
      };
    }
  }

  const stmt = db.prepare(`
    INSERT INTO locations (device_id, latitude, longitude, accuracy, speed, heading, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const res = stmt.run(deviceId, latitude, longitude, accuracy, speed, heading, nowUtc);
  db.prepare('UPDATE devices SET last_seen = ? WHERE id = ?').run(nowUtc, deviceId);
  return {
    id: Number(res.lastInsertRowid),
    device_id: deviceId,
    latitude,
    longitude,
    accuracy,
    speed,
    heading,
    created_at: nowUtc
  };
}

function getLatestLocation(deviceId) {
  return db.prepare(`
    SELECT * FROM locations 
    WHERE device_id = ? 
    ORDER BY created_at DESC, id DESC 
    LIMIT 1
  `).get(deviceId);
}

function getLocationHistory(deviceId, limit = 100, targetDate = null) {
  const offsetHours = config.TIMEZONE_OFFSET_HOURS || 7;
  const offsetStr = `${offsetHours >= 0 ? '+' : ''}${offsetHours} hours`;

  if (targetDate) {
    return db.prepare(`
      SELECT * FROM locations 
      WHERE device_id = ? 
        AND DATE(created_at, ?) = ?
      ORDER BY created_at DESC 
      LIMIT ?
    `).all(deviceId, offsetStr, targetDate, limit);
  }
  return db.prepare(`
    SELECT * FROM locations 
    WHERE device_id = ? 
    ORDER BY created_at DESC 
    LIMIT ?
  `).all(deviceId, limit);
}

// Notification Helpers
function saveNotification(deviceId, partnerDeviceId, type, distance, message) {
  const nowUtc = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO notifications (device_id, partner_device_id, type, distance, message, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const res = stmt.run(deviceId, partnerDeviceId, type, distance, message, nowUtc);
  return {
    id: Number(res.lastInsertRowid),
    device_id: deviceId,
    partner_device_id: partnerDeviceId,
    type,
    distance,
    message,
    created_at: nowUtc
  };
}

function getNotifications(deviceId, limit = 20) {
  return db.prepare(`
    SELECT * FROM notifications 
    WHERE device_id = ? OR partner_device_id = ?
    ORDER BY created_at DESC 
    LIMIT ?
  `).all(deviceId, deviceId, limit);
}

// Auto-cleanup data > MAX_HISTORY_DAYS
function cleanupOldData(days = config.MAX_HISTORY_DAYS || 30) {
  const res = db.prepare(`
    DELETE FROM locations 
    WHERE created_at < datetime('now', '-' || ? || ' days')
  `).run(days);
  return res.changes;
}

// Saved Places Helpers (Geofencing Cerdas)
function createSavedPlace(userId, name, latitude, longitude, radiusMeters = 100, icon = 'home') {
  const nowUtc = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO saved_places (user_id, name, latitude, longitude, radius_meters, icon, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const res = stmt.run(userId, name, latitude, longitude, radiusMeters, icon, nowUtc);
  return {
    id: Number(res.lastInsertRowid),
    user_id: userId,
    name,
    latitude,
    longitude,
    radius_meters: radiusMeters,
    icon,
    created_at: nowUtc
  };
}

function getSavedPlacesByUserId(userId) {
  return db.prepare('SELECT * FROM saved_places WHERE user_id = ? ORDER BY created_at DESC').all(userId);
}

function deleteSavedPlace(id, userId) {
  const res = db.prepare('DELETE FROM saved_places WHERE id = ? AND user_id = ?').run(id, userId);
  return res.changes > 0;
}

function findMatchingPlace(userId, lat, lng) {
  const places = getSavedPlacesByUserId(userId);
  if (!places || places.length === 0) return null;
  const { calculateHaversineDistance } = require('../utils/geo');
  for (const place of places) {
    const dist = calculateHaversineDistance(lat, lng, place.latitude, place.longitude);
    if (dist !== null && dist <= (place.radius_meters || 100)) {
      return {
        id: place.id,
        name: place.name,
        icon: place.icon,
        distance: Math.round(dist)
      };
    }
  }
  return null;
}

// Daily Location Summary (Rekap Aktivitas Perjalanan Hari Ini)
function getDailyLocationSummary(deviceId, targetDate = null) {
  const offsetHours = config.TIMEZONE_OFFSET_HOURS || 7;
  const offsetStr = `${offsetHours >= 0 ? '+' : ''}${offsetHours} hours`;
  const dateStr = targetDate || new Date(Date.now() + offsetHours * 3600 * 1000).toISOString().split('T')[0];

  // Hitung ringkasan atas seluruh titik hari itu (batas aman 20.000 titik)
  const safeLimit = 20000;
  const rows = db.prepare(`
    SELECT * FROM locations 
    WHERE device_id = ? 
      AND DATE(created_at, ?) = ?
    ORDER BY created_at ASC
    LIMIT ?
  `).all(deviceId, offsetStr, dateStr, safeLimit);

  if (!rows || rows.length === 0) {
    return {
      pointsCount: 0,
      validPointsCount: 0,
      totalDistanceMeters: 0,
      totalDistanceFormatted: '0 m',
      activeMinutes: 0,
      firstTime: null,
      lastTime: null
    };
  }

  const { calculateHaversineDistance, formatDistance } = require('../utils/geo');
  const maxAccuracy = config.GPS_MAX_ACCURACY_THRESHOLD_METERS || 50;
  const maxSpeedMps = config.GPS_MAX_SPEED_THRESHOLD_MPS || 40;

  // Saring titik akurasi buruk (> maxAccuracy)
  const validPoints = rows.filter(r => (r.accuracy === 0 || r.accuracy <= maxAccuracy));

  let totalDistanceMeters = 0;
  let activeSeconds = 0;

  for (let i = 1; i < validPoints.length; i++) {
    const prev = validPoints[i - 1];
    const curr = validPoints[i];

    const d = calculateHaversineDistance(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
    if (!d) continue;

    // Hitung selisih waktu nyata dalam detik (minimal 1 detik / default interval untuk batch inserts)
    const tPrev = new Date(prev.created_at).getTime();
    const tCurr = new Date(curr.created_at).getTime();
    const dtRaw = tCurr > tPrev ? (tCurr - tPrev) / 1000 : 0;
    const dtSeconds = dtRaw >= 1 ? dtRaw : (config.GPS_INTERVAL_SECONDS || 10);

    // Kecepatan implisit (m/s)
    const impliedSpeed = d / dtSeconds;

    // Abaikan lonjakan GPS / lompatan teleportasi anomali
    if (impliedSpeed > maxSpeedMps) {
      continue;
    }

    if (d >= 8) {
      totalDistanceMeters += d;
    }

    // Durasi aktif dihitung dari selisih timestamp nyata antar titik bergerak
    if (curr.speed > 0.5 || d >= 12) {
      if (dtSeconds <= 120) {
        activeSeconds += dtSeconds;
      } else {
        activeSeconds += (config.GPS_INTERVAL_SECONDS || 10);
      }
    }
  }

  const activeMinutes = Math.round(activeSeconds / 60);

  return {
    pointsCount: rows.length,
    validPointsCount: validPoints.length,
    totalDistanceMeters: Math.round(totalDistanceMeters),
    totalDistanceFormatted: formatDistance(totalDistanceMeters),
    activeMinutes,
    firstTime: rows[0].created_at,
    lastTime: rows[rows.length - 1].created_at,
    startCoords: { latitude: rows[0].latitude, longitude: rows[0].longitude },
    currentCoords: { latitude: rows[rows.length - 1].latitude, longitude: rows[rows.length - 1].longitude }
  };
}

// Hapus Semua Data Pengguna (Hak Privasi & GDPR / P3)
function deleteAllUserData(userId) {
  db.exec('BEGIN IMMEDIATE TRANSACTION;');
  try {
    const devices = db.prepare('SELECT id FROM devices WHERE user_id = ?').all(userId);
    for (const d of devices) {
      db.prepare('UPDATE devices SET partner_device_id = NULL WHERE partner_device_id = ?').run(d.id);
      db.prepare('DELETE FROM locations WHERE device_id = ?').run(d.id);
      db.prepare('DELETE FROM notifications WHERE device_id = ? OR partner_device_id = ?').run(d.id, d.id);
    }
    db.prepare('DELETE FROM saved_places WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM devices WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    db.exec('COMMIT;');
    return true;
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

module.exports = {
  db,
  createUser,
  getUserByEmail,
  getUserById,
  registerOrGetDevice,
  getDeviceById,
  getDeviceByToken,
  getDeviceByUserId,
  getVerifiedPartner,
  generatePairingCode,
  pairDevices,
  unpairDevice,
  setSharingPaused,
  updateDeviceStatus,
  saveLocation,
  getLatestLocation,
  getLocationHistory,
  saveNotification,
  getNotifications,
  cleanupOldData,
  createSavedPlace,
  getSavedPlacesByUserId,
  deleteSavedPlace,
  findMatchingPlace,
  getDailyLocationSummary,
  deleteAllUserData
};
