const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'backend', 'src', 'db', 'database.js');
let content = fs.readFileSync(dbPath, 'utf8');

const tableSql = `
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
`;

if (!content.includes('saved_places')) {
  content = content.replace(
    'CREATE INDEX IF NOT EXISTS idx_devices_pairing ON devices(pairing_code);',
    'CREATE INDEX IF NOT EXISTS idx_devices_pairing ON devices(pairing_code);' + tableSql
  );
}

const newFunctions = `
// Saved Places Helpers (Geofencing Cerdas)
function createSavedPlace(userId, name, latitude, longitude, radiusMeters = 100, icon = 'home') {
  const stmt = db.prepare(\`
    INSERT INTO saved_places (user_id, name, latitude, longitude, radius_meters, icon)
    VALUES (?, ?, ?, ?, ?, ?)
  \`);
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
function getDailyLocationSummary(deviceId, targetDate = null) {
  const rows = targetDate
    ? db.prepare("SELECT * FROM locations WHERE device_id = ? AND DATE(created_at, 'localtime') = ? ORDER BY created_at ASC").all(deviceId, targetDate)
    : db.prepare("SELECT * FROM locations WHERE device_id = ? AND DATE(created_at, 'localtime') = DATE('now', 'localtime') ORDER BY created_at ASC").all(deviceId);

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

  const { calculateHaversineDistance, formatDistance } = require('../utils/geo');
  let totalDistanceMeters = 0;
  let activePointsCount = 0;

  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const curr = rows[i];
    const d = calculateHaversineDistance(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
    if (d && d >= 8) {
      totalDistanceMeters += d;
    }
    if (curr.speed > 0.5 || (d && d >= 12)) {
      activePointsCount++;
    }
  }

  const activeMinutes = Math.round((activePointsCount * 10) / 60);

  return {
    pointsCount: rows.length,
    totalDistanceMeters: Math.round(totalDistanceMeters),
    totalDistanceFormatted: formatDistance(totalDistanceMeters),
    activeMinutes,
    firstTime: rows[0].created_at,
    lastTime: rows[rows.length - 1].created_at,
    startCoords: { latitude: rows[0].latitude, longitude: rows[0].longitude },
    currentCoords: { latitude: rows[rows.length - 1].latitude, longitude: rows[rows.length - 1].longitude }
  };
}
`;

if (!content.includes('createSavedPlace')) {
  content = content.replace('module.exports = {', newFunctions + '\nmodule.exports = {');
  content = content.replace(
    'cleanupOldData\n};',
    'cleanupOldData,\n  createSavedPlace,\n  getSavedPlacesByUserId,\n  deleteSavedPlace,\n  findMatchingPlace,\n  getDailyLocationSummary\n};'
  );
  fs.writeFileSync(dbPath, content, 'utf8');
  console.log('Successfully patched database.js');
} else {
  console.log('database.js already patched');
}
