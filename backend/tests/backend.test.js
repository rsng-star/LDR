const assert = require('assert');
const { calculateHaversineDistance, formatDistance } = require('../src/utils/geo');
const {
  createUser,
  getUserByEmail,
  registerOrGetDevice,
  getDeviceById,
  generatePairingCode,
  pairDevices,
  saveLocation,
  getLatestLocation,
  getNotifications
} = require('../src/db/database');
const { hashPassword, comparePassword, generateToken, verifyToken } = require('../src/utils/security');
const trackingService = require('../src/services/trackingService');

async function runTests() {
  console.log('🧪 Memulai Pengujian Backend Aplikasi Tanpilan...\n');

  // TEST 1: Haversine Geo Calculation
  console.log('--- TEST 1: Haversine Distance Formula ---');
  // Monas Jakarta (-6.175392, 106.827153) ke Balai Kota Jakarta (-6.180556, 106.828333) approx 580m
  const dist = calculateHaversineDistance(-6.175392, 106.827153, -6.180556, 106.828333);
  console.log(`Jarak Monas ke Balai Kota: ${dist} meter (${formatDistance(dist)})`);
  assert(dist > 500 && dist < 650, 'Jarak harus di sekitar 580 meter');

  // Titik dekat (~45 meter)
  const distNear = calculateHaversineDistance(-6.175392, 106.827153, -6.175600, 106.827400);
  console.log(`Jarak Dekat: ${distNear} meter (${formatDistance(distNear)})`);
  assert(distNear < 100, 'Jarak dekat harus < 100 meter');
  console.log('✅ TEST 1 Lulus!\n');

  // TEST 2: Security & Auth (Hash & JWT)
  console.log('--- TEST 2: Keamanan Password & Token JWT ---');
  const password = 'PasswordRahasia123';
  const hashed = await hashPassword(password);
  const isMatch = await comparePassword(password, hashed);
  assert.strictEqual(isMatch, true, 'Password match harus bernilai true');

  const token = generateToken({ id: 99, email: 'wanita@tanpilan.local' });
  const decoded = verifyToken(token);
  assert.strictEqual(decoded.email, 'wanita@tanpilan.local');
  console.log('✅ TEST 2 Lulus!\n');

  // TEST 3: User & Device Registration (Wanita & Pria)
  console.log('--- TEST 3: Registrasi Pengguna & Device (Wanita & Pria) ---');
  const emailWanita = `wanita_${Date.now()}@tanpilan.local`;
  const emailPria = `pria_${Date.now()}@tanpilan.local`;

  const userWanita = createUser(emailWanita, hashed);
  const userPria = createUser(emailPria, hashed);
  assert(userWanita.id > 0 && userPria.id > 0, 'User ID harus valid');

  const deviceWanitaToken = `token_device_wanita_${Date.now()}`;
  const devicePriaToken = `token_device_pria_${Date.now()}`;

  const deviceWanita = registerOrGetDevice(userWanita.id, deviceWanitaToken, 'HP Wanita');
  const devicePria = registerOrGetDevice(userPria.id, devicePriaToken, 'HP Pria');

  // Test re-registrasi user yang sudah ada (memperbarui perangkat yang sudah ada)
  const deviceWanitaReget = registerOrGetDevice(userWanita.id, 'HP Wanita Update');
  assert.strictEqual(deviceWanitaReget.id, deviceWanita.id, 'ID perangkat harus sama saat user sudah terdaftar');
  assert.strictEqual(deviceWanitaReget.device_name, 'HP Wanita Update', 'Nama perangkat harus terupdate');

  assert.strictEqual(devicePria.device_name, 'HP Pria');
  console.log(`Perangkat Wanita #${deviceWanita.id} dan Pria #${devicePria.id} berhasil terdaftar & diupdate.`);
  console.log('✅ TEST 3 Lulus!\n');

  // TEST 4: UC-01 Pairing Device Pasangan
  console.log('--- TEST 4: UC-01 Pairing Kode Antar Device ---');
  const { code } = generatePairingCode(devicePria.id);
  console.log(`Pria membuat kode pairing: ${code}`);
  assert(code.length === 6, 'Kode pairing harus 6 karakter');

  const paired = pairDevices(deviceWanita.id, devicePria.id);
  assert.strictEqual(paired.device1.partner_device_id, devicePria.id);
  assert.strictEqual(paired.device2.partner_device_id, deviceWanita.id);
  console.log(`Wanita (#${deviceWanita.id}) berhasil dipasangkan dengan Pria (#${devicePria.id})!`);
  console.log('✅ TEST 4 Lulus!\n');

  // TEST 5: UC-02 GPS Tracking & Realtime Distance Calculation
  console.log('--- TEST 5: UC-02 Pengiriman GPS & Perhitungan Jarak Realtime ---');
  // Wanita di titik A
  const wanitaLat = -6.175392;
  const wanitaLng = 106.827153;
  await trackingService.processLocationUpdate(deviceWanita.id, {
    latitude: wanitaLat,
    longitude: wanitaLng,
    accuracy: 5,
    speed: 1.2,
    heading: 90,
    battery: 92
  });

  // Kasus A: Pria berada dekat Wanita (jarak ~30m)
  const priaNearLat = -6.175550;
  const priaNearLng = 106.827300;
  const nearRes = await trackingService.processLocationUpdate(devicePria.id, {
    latitude: priaNearLat,
    longitude: priaNearLng,
    battery: 85
  });

  console.log(`Posisi Pria Dekat: Jarak = ${nearRes.distanceFormatted}`);
  assert(nearRes.distanceToPartner !== null, 'Jarak harus terhitung');
  assert(nearRes.distanceToPartner < 50, 'Jarak dekat harus < 50m');

  // Kasus B: Pria bergerak menjauh (jarak ~350m)
  const priaFarLat = -6.178000;
  const priaFarLng = 106.829000;
  const farRes = await trackingService.processLocationUpdate(devicePria.id, {
    latitude: priaFarLat,
    longitude: priaFarLng,
    battery: 84
  });

  console.log(`Posisi Pria Menjauh: Jarak = ${farRes.distanceFormatted}`);
  assert(farRes.distanceToPartner > 300, 'Jarak menjauh harus > 300m');
  assert.strictEqual(typeof farRes.distanceFormatted, 'string');
  console.log('✅ TEST 5 Lulus!\n');

  console.log('🎉 SEMUA PENGUJIAN BACKEND BERHASIL (100% PASS)!');
}

runTests().catch((err) => {
  console.error('❌ PENGUJIAN GAGAL:', err);
  process.exit(1);
});
