require('dotenv').config();
const path = require('path');
const crypto = require('crypto');

const isProduction = process.env.NODE_ENV === 'production';
let jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  if (isProduction) {
    throw new Error('FATAL: JWT_SECRET wajib dikonfigurasi melalui environment variable di environment production!');
  }
  // Di development, gunakan secret acak aman yang dibuat saat startup
  jwtSecret = process.env.DEV_JWT_SECRET || crypto.randomBytes(32).toString('hex');
}

module.exports = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  HOST: process.env.HOST || '0.0.0.0',
  JWT_SECRET: jwtSecret,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '30d',
  DATABASE_PATH: process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'tanpilan.db'),
  TIMEZONE_OFFSET_HOURS: parseInt(process.env.TIMEZONE_OFFSET_HOURS || '7', 10),
  GPS_INTERVAL_SECONDS: parseInt(process.env.GPS_INTERVAL_SECONDS || '10', 10),
  DISTANCE_ALERT_THRESHOLD_METERS: parseInt(process.env.DISTANCE_ALERT_THRESHOLD_METERS || '100', 10),
  MAX_HISTORY_DAYS: parseInt(process.env.MAX_HISTORY_DAYS || '30', 10),
  GPS_MAX_ACCURACY_THRESHOLD_METERS: parseInt(process.env.GPS_MAX_ACCURACY_THRESHOLD_METERS || '50', 10),
  GPS_MAX_SPEED_THRESHOLD_MPS: parseFloat(process.env.GPS_MAX_SPEED_THRESHOLD_MPS || '40')
};
