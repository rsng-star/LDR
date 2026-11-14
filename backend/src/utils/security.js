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

// Middleware untuk memverifikasi device header atau device token
function authenticateDevice(req, res, next) {
  const deviceToken = req.headers['x-device-token'] || req.query.device_token || req.body.device_token;
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

module.exports = {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
  authenticateUser,
  authenticateDevice
};
