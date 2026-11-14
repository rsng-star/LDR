const { DatabaseSync } = require('node:sqlite');
const config = require('../config');

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
    pairing_code_expires_at DATETIME,
    partner_device_id INTEGER,
    battery_level INTEGER DEFAULT 100,
    is_online INTEGER DEFAULT 0,
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id INTEGER NOT NULL,
    partner_device_id INTEGER NOT NULL,
    type TEXT NOT NULL, -- 'DISTANCE_ALERT', 'PAIRING_SUCCESS', dll
    distance REAL,
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
    FOREIGN KEY (partner_device_id) REFERENCES devices(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_locations_device_created ON locations(device_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_devices_token ON devices(device_token);
  CREATE INDEX IF NOT EXISTS idx_devices_pairing ON devices(pairing_code);
  CREATE TABLE IF NOT EXISTS saved_places (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    radius_meters REAL DEFAULT 100,
    icon TEXT DEFAULT 'home',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_saved_places_user ON saved_places(user_id);

`);

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
function registerOrGetDevice(userId, deviceToken, deviceName = 'Perangkat Saya') {
  const existing = db.prepare('SELECT * FROM devices WHERE device_token = ?').get(deviceToken);
  if (existing) {
    db.prepare('UPDATE devices SET is_online = 1, last_seen = CURRENT_TIMESTAMP WHERE id = ?').run(existing.id);
    return getDeviceById(existing.id);
  }

  const stmt = db.prepare(`
    INSERT INTO devices (user_id, device_token, device_name, is_online)
    VALUES (?, ?, ?, 1)
  `);
  const res = stmt.run(userId, deviceToken, deviceName);
  return getDeviceById(Number(res.lastInsertRowid));
}

function getDeviceById(id) {
  if (!id) return null;
  return db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
}

function getDeviceByToken(deviceToken) {
  return db.prepare('SELECT * FROM devices WHERE device_token = ?').get(deviceToken);
}

function getDeviceByUserId(userId) {
  return db.prepare('SELECT * FROM devices WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId);
}

function generatePairingCode(deviceId) {
  // Buat kode 6 digit alfanumerik huruf besar
  const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  
  // Berlaku 15 menit
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  db.prepare(`
    UPDATE devices 
    SET pairing_code = ?, pairing_code_expires_at = ?
    WHERE id = ?
  `).run(code, expiresAt, deviceId);

  return { code, expiresAt };
}

function pairDevices(deviceId1, deviceId2) {
  if (deviceId1 === deviceId2) {
    throw new Error('Tidak dapat memasangkan perangkat dengan dirinya sendiri');
  }

  // Update pairing timbal-balik (mutual 2-device pairing)
  db.prepare('UPDATE devices SET partner_device_id = ?, pairing_code = NULL, pairing_code_expires_at = NULL WHERE id = ?')
    .run(deviceId2, deviceId1);
  db.prepare('UPDATE devices SET partner_device_id = ?, pairing_code = NULL, pairing_code_expires_at = NULL WHERE id = ?')
    .run(deviceId1, deviceId2);

  return {
    device1: getDeviceById(deviceId1),
    device2: getDeviceById(deviceId2)
  };
}

function unpairDevice(deviceId) {
  const current = getDeviceById(deviceId);
  if (!current) return false;

  const partnerId = current.partner_device_id;
  db.prepare('UPDATE devices SET partner_device_id = NULL WHERE id = ?').run(deviceId);
  if (partnerId) {
    db.prepare('UPDATE devices SET partner_device_id = NULL WHERE id = ?').run(partnerId);
  }
  return true;
}

function updateDeviceStatus(deviceId, isOnline, batteryLevel = null) {
  if (batteryLevel !== null) {
    db.prepare('UPDATE devices SET is_online = ?, battery_level = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?')
      .run(isOnline ? 1 : 0, batteryLevel, deviceId);
  } else {
    db.prepare('UPDATE devices SET is_online = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?')
      .run(isOnline ? 1 : 0, deviceId);
  }
  return getDeviceById(deviceId);
}

// Location Helpers
function saveLocation(deviceId, latitude, longitude, accuracy = 0, speed = 0, heading = 0) {
  // Optimasi: Smart Jitter Filter saat perangkat diam
  // Jika kecepatan 0 dan pergeseran < 2.5m dari titik terakhir, perbarui last_seen tanpa duplicate spam
  const last = getLatestLocation(deviceId);
  if (last && speed < 0.2) {
    const { calculateHaversineDistance } = require('../utils/geo');
    const dist = calculateHaversineDistance(last.latitude, last.longitude, latitude, longitude);
    if (dist !== null && dist < 2.5) {
      db.prepare('UPDATE devices SET last_seen = CURRENT_TIMESTAMP WHERE id = ?').run(deviceId);
      return last;
    }
  }

  const stmt = db.prepare(`
    INSERT INTO locations (device_id, latitude, longitude, accuracy, speed, heading)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const res = stmt.run(deviceId, latitude, longitude, accuracy, speed, heading);
  db.prepare('UPDATE devices SET last_seen = CURRENT_TIMESTAMP WHERE id = ?').run(deviceId);
  return {
    id: Number(res.lastInsertRowid),
    device_id: deviceId,
    latitude,
    longitude,
    accuracy,
    speed,
    heading,
    created_at: new Date().toISOString()
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
  if (targetDate) {
    return db.prepare(`
      SELECT * FROM locations 
      WHERE device_id = ? 
        AND DATE(created_at, '+7 hours') = ?
      ORDER BY created_at DESC 
      LIMIT ?
    `).all(deviceId, targetDate, limit);
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
  const stmt = db.prepare(`
    INSERT INTO notifications (device_id, partner_device_id, type, distance, message)
    VALUES (?, ?, ?, ?, ?)
  `);
  const res = stmt.run(deviceId, partnerDeviceId, type, distance, message);
  return {
    id: Number(res.lastInsertRowid),
    device_id: deviceId,
    partner_device_id: partnerDeviceId,
    type,
    distance,
    message,
    created_at: new Date().toISOString()
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

// Auto-cleanup data > 30 hari sesuai batasan desain
function cleanupOldData(days = 30) {
  db.prepare(`
    DELETE FROM locations 
    WHERE created_at < datetime('now', '-' || ? || ' days')
  `).run(days);
}


// Saved Places Helpers (Geofencing Cerdas)
function createSavedPlace(userId, name, latitude, longitude, radiusMeters = 100, icon = 'home') {
  const stmt = db.prepare(`
    INSERT INTO saved_places (user_id, name, latitude, longitude, radius_meters, icon)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const res = stmt.run(userId, name, latitude, longitude, radiusMeters, icon);
  return {
    id: Number(res.lastInsertRowid),
    user_id: userId,
    name,
    latitude,
    longitude,
    radius_meters: radiusMeters,
    icon,
    created_at: new Date().toISOString()
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
function getDailyLocationSummary(deviceId, targetDate = null, limit = 100) {
  const dateStr = targetDate || new Date(Date.now() + 7 * 3600 * 1000).toISOString().split('T')[0];

  const rows = db.prepare(`
    SELECT * FROM locations 
    WHERE device_id = ? 
      AND DATE(created_at, '+7 hours') = ?
    ORDER BY created_at ASC
    LIMIT ?
  `).all(deviceId, dateStr, limit);

  if (!rows || rows.length === 0) {
    return {
      pointsCount: 0,
      totalDistanceMeters: 0,
      totalDistanceFormatted: '0 m',
      activeMinutes: 0,
      firstTime: null,
      lastTime: null
    };
  }

  const config = require('../config');
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

    // Hitung selisih waktu nyata dalam detik
    const tPrev = new Date(prev.created_at).getTime();
    const tCurr = new Date(curr.created_at).getTime();
    const dtSeconds = tCurr > tPrev
      ? (tCurr - tPrev) / 1000
      : (config.GPS_INTERVAL_SECONDS || 10);

    // Kecepatan implisit (m/s)
    const impliedSpeed = d / dtSeconds;

    // Abaikan lonjakan GPS / lompatan teleportasi yang tidak masuk akal
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

module.exports = {
  db,
  createUser,
  getUserByEmail,
  getUserById,
  registerOrGetDevice,
  getDeviceById,
  getDeviceByToken,
  getDeviceByUserId,
  generatePairingCode,
  pairDevices,
  unpairDevice,
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
  getDailyLocationSummary
};
