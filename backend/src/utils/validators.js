/**
 * Modul Validasi dan Sanitasi Input Terpusat untuk Aplikasi Tanpilan
 */

function sanitizeString(str, maxLen = 100) {
  if (typeof str !== 'string') return '';
  // Buang karakter kontrol ASCII (0-31 dan 127)
  const cleaned = str.replace(/[\x00-\x1F\x7F]/g, '').trim();
  return cleaned.slice(0, maxLen);
}

function validateDeviceName(name) {
  const sanitized = sanitizeString(name, 40);
  return sanitized || 'Perangkat Saya';
}

function validatePlaceName(name) {
  const sanitized = sanitizeString(name, 60);
  if (!sanitized) {
    const err = new Error('Nama tempat tidak boleh kosong');
    err.status = 400;
    throw err;
  }
  return sanitized;
}

const ALLOWED_ICONS = new Set([
  'home', 'heart', 'pin', 'star', 'work', 'coffee',
  'school', 'car', 'bike', 'walk', 'plane', 'train'
]);

function validatePlaceIcon(icon) {
  if (typeof icon === 'string' && ALLOWED_ICONS.has(icon.toLowerCase().trim())) {
    return icon.toLowerCase().trim();
  }
  return 'home';
}

function validateCoordinates(latitude, longitude) {
  if (typeof latitude !== 'number' || isNaN(latitude) || latitude < -90 || latitude > 90) {
    const err = new Error('Nilai latitude harus berupa angka antara -90 dan 90');
    err.status = 400;
    throw err;
  }
  if (typeof longitude !== 'number' || isNaN(longitude) || longitude < -180 || longitude > 180) {
    const err = new Error('Nilai longitude harus berupa angka antara -180 dan 180');
    err.status = 400;
    throw err;
  }
  return { latitude, longitude };
}

function validateAccuracy(acc) {
  if (typeof acc !== 'number' || isNaN(acc) || acc < 0) return 0;
  return Math.min(acc, 10000);
}

function validateSpeed(speed) {
  if (typeof speed !== 'number' || isNaN(speed) || speed < 0) return 0;
  return Math.min(speed, 200);
}

function validateHeading(heading) {
  if (typeof heading !== 'number' || isNaN(heading)) return 0;
  return ((heading % 360) + 360) % 360;
}

function validateBattery(battery) {
  if (battery === null || battery === undefined) return null;
  const num = parseInt(battery, 10);
  if (isNaN(num)) return null;
  return Math.max(0, Math.min(100, num));
}

function validateLimit(limit, defaultVal = 100, maxVal = 500) {
  const parsed = parseInt(limit, 10);
  if (isNaN(parsed) || parsed < 1) return defaultVal;
  return Math.min(parsed, maxVal);
}

function validateDateString(dateStr) {
  if (!dateStr) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  return null;
}

function validateRadius(radius, defaultVal = 100) {
  const parsed = parseFloat(radius);
  if (isNaN(parsed) || parsed < 20) return 20;
  return Math.min(parsed, 5000);
}

function validateEmail(email) {
  if (typeof email !== 'string') return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim());
}

function validatePassword(password) {
  if (typeof password !== 'string') return false;
  // Minimal 8 karakter, maksimal 72 byte (batas pemotongan bcrypt)
  const len = Buffer.byteLength(password, 'utf8');
  return password.length >= 8 && len <= 72;
}

module.exports = {
  sanitizeString,
  validateDeviceName,
  validatePlaceName,
  validatePlaceIcon,
  validateCoordinates,
  validateAccuracy,
  validateSpeed,
  validateHeading,
  validateBattery,
  validateLimit,
  validateDateString,
  validateRadius,
  validateEmail,
  validatePassword
};
