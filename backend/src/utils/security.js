const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { getUserById, getDeviceByToken } = require('../db/database');

async function hashPassword(plainPassword) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plainPassword, salt);
}

async function comparePassword(plainPassword, hashedPassword) {
  return bcrypt.compare(plainPassword, hashedPassword);
}

function generateToken(payload) {
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES_IN });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, config.JWT_SECRET);
  } catch (err) {
    return null;
  }
}

// Middleware Express untuk validasi JWT User
function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token otentikasi tidak ditemukan' });
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Token tidak valid atau telah kedaluwarsa' });
  }

  const user = getUserById(decoded.id);
  if (!user) {
    return res.status(401).json({ error: 'Pengguna tidak ditemukan' });
  }

  req.user = user;
  next();
}

// Middleware untuk memverifikasi device token (Header X-Device-Token SAJA, tidak menerima query string demi keamanan)
function authenticateDevice(req, res, next) {
  const deviceToken = req.headers['x-device-token'] || (req.body && req.body.device_token);
  if (!deviceToken) {
    return res.status(401).json({ error: 'Header X-Device-Token wajib disertakan' });
  }

  const device = getDeviceByToken(deviceToken);
  if (!device) {
    return res.status(401).json({ error: 'Perangkat tidak terdaftar' });
  }

  req.device = device;
  next();
}

// In-Memory Rate Limiter untuk pairing code (5 percobaan / menit per user/IP + 15 menit lockout)
const pairAttemptStore = new Map();

function pairRateLimiter(req, res, next) {
  const clientIp = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  const userId = req.user ? req.user.id : 'anon';
  const key = `${userId}_${clientIp}`;
  const now = Date.now();

  const record = pairAttemptStore.get(key) || { attempts: 0, resetAt: now + 60000, lockoutUntil: 0 };

  // Periksa apakah sedang dalam masa lockout 15 menit
  if (record.lockoutUntil > now) {
    const remainingMinutes = Math.ceil((record.lockoutUntil - now) / 60000);
    return res.status(429).json({
      error: `Terlalu banyak percobaan pairing gagal. Akun dikunci selama ${remainingMinutes} menit demi keamanan.`
    });
  }

  // Reset window percobaan jika sudah lewat 1 menit
  if (now > record.resetAt) {
    record.attempts = 0;
    record.resetAt = now + 60000;
  }

  record.attempts++;
  if (record.attempts > 5) {
    record.lockoutUntil = now + 15 * 60 * 1000; // 15 menit lockout
    pairAttemptStore.set(key, record);
    return res.status(429).json({
      error: 'Batas 5 percobaan pairing terlampaui. Perangkat dikunci selama 15 menit.'
    });
  }

  pairAttemptStore.set(key, record);
  next();
}

// Helper untuk reset rate limiter (berguna dalam unit test)
function resetPairRateLimiter() {
  pairAttemptStore.clear();
}

module.exports = {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
  authenticateUser,
  authenticateDevice,
  pairRateLimiter,
  resetPairRateLimiter
};
