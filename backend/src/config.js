require('dotenv').config();
const path = require('path');

module.exports = {
  PORT: process.env.PORT || 3000,
  HOST: process.env.HOST || '0.0.0.0',
  JWT_SECRET: process.env.JWT_SECRET || 'tanpilan_super_secret_jwt_key_2026',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '30d',
  DATABASE_PATH: process.env.DATABASE_PATH || path.join(__dirname, '..', 'tanpilan.db'),
  GPS_INTERVAL_SECONDS: parseInt(process.env.GPS_INTERVAL_SECONDS || '10', 10),
  DISTANCE_ALERT_THRESHOLD_METERS: parseInt(process.env.DISTANCE_ALERT_THRESHOLD_METERS || '100', 10),
  MAX_HISTORY_DAYS: parseInt(process.env.MAX_HISTORY_DAYS || '30', 10),
  GPS_MAX_ACCURACY_THRESHOLD_METERS: parseInt(process.env.GPS_MAX_ACCURACY_THRESHOLD_METERS || '50', 10),
  GPS_MAX_SPEED_THRESHOLD_MPS: parseFloat(process.env.GPS_MAX_SPEED_THRESHOLD_MPS || '40')
};
