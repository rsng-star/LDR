const assert = require('assert');
const {
  createUser,
  registerOrGetDevice,
  pairDevices,
  saveLocation,
  createSavedPlace,
  getSavedPlacesByUserId,
  findMatchingPlace,
  deleteSavedPlace,
  getDailyLocationSummary,
  getLocationHistory
} = require('../src/db/database');
const trackingService = require('../src/services/trackingService');

console.log('🧪 Memulai Pengujian Fitur Penyempurnaan (Saved Places, Daily Summary)...');

// 1. Setup user & device
const u1 = createUser(`test_places_${Date.now()}@tanpilan.com`, 'hash123');
const d1 = registerOrGetDevice(u1.id, `tok_places_${Date.now()}`, 'Device Places');

// 2. Test Saved Places (Geofencing)
console.log('\n--- TEST 1: Saved Places & Geofencing ---');
const place1 = createSavedPlace(u1.id, 'Rumah Sayang', -7.801388, 110.364717, 100, 'home');
assert.strictEqual(place1.name, 'Rumah Sayang');
assert.strictEqual(place1.radius_meters, 100);

const placesList = getSavedPlacesByUserId(u1.id);
assert.strictEqual(placesList.length, 1);
assert.strictEqual(placesList[0].name, 'Rumah Sayang');

// Test matching place when within 50m
const matchInside = findMatchingPlace(u1.id, -7.801500, 110.364800);
assert.ok(matchInside !== null, 'Harus mendeteksi berada di dalam tempat favorit');
assert.strictEqual(matchInside.name, 'Rumah Sayang');

// Test matching place when far away (> 500m)
const matchFar = findMatchingPlace(u1.id, -7.809000, 110.364800);
assert.strictEqual(matchFar, null, 'Tidak boleh mendeteksi jika di luar radius');
console.log('✅ TEST 1 (Saved Places Geofencing) Lulus!');

// 3. Test Daily Summary
console.log('\n--- TEST 2: Daily Location Summary ---');
// Simpan titik pergerakan
saveLocation(d1.id, -7.801000, 110.364000, 5, 2.5, 0);
saveLocation(d1.id, -7.802000, 110.365000, 5, 3.0, 0);
saveLocation(d1.id, -7.803000, 110.366000, 5, 4.0, 0);

const summary = getDailyLocationSummary(d1.id);
assert.ok(summary.pointsCount >= 3, 'Harus mencatat minimal 3 titik hari ini');
assert.ok(summary.totalDistanceMeters > 100, 'Jarak tempuh harus terhitung akumulatif');
console.log(`Total Jarak Hari Ini: ${summary.totalDistanceFormatted} | Waktu Aktif: ${summary.activeMinutes} mnt`);
console.log('✅ TEST 2 (Daily Summary) Lulus!');

// 4. Test Cleanup Tempat
console.log('\n--- TEST 3: Delete Saved Place ---');
const deleted = deleteSavedPlace(place1.id, u1.id);
assert.strictEqual(deleted, true);
const remaining = getSavedPlacesByUserId(u1.id);
assert.strictEqual(remaining.length, 0);
console.log('✅ TEST 3 (Delete Place) Lulus!');

// 5. Test Filter Lonjakan GPS & Akurasi Buruk
console.log('\n--- TEST 4: Filter Lonjakan GPS & Akurasi Buruk ---');
const u2 = createUser(`test_gps_${Date.now()}@tanpilan.com`, 'hash123');
const d2 = registerOrGetDevice(u2.id, `tok_gps_${Date.now()}`, 'Device GPS Test');

// Titik A: Awal (-7.801000, 110.364000)
saveLocation(d2.id, -7.801000, 110.364000, 5, 1.5, 0);
// Titik B: Normal berjalan 50m (-7.801450, 110.364000)
saveLocation(d2.id, -7.801450, 110.364000, 5, 1.5, 0);
// Titik C: Lonjakan GPS ekstrim / Teleportasi ke Jakarta 400km jauhnya dalam 1 detik!
saveLocation(d2.id, -6.175110, 106.827153, 5, 0, 0);
// Titik D: Akurasi buruk (> 50m, misalnya 85m)
saveLocation(d2.id, -7.801600, 110.364000, 85, 1.5, 0);
// Titik E: Normal berjalan kembali dekat titik B (-7.801800, 110.364000)
saveLocation(d2.id, -7.801800, 110.364000, 5, 1.5, 0);

const gpsSummary = getDailyLocationSummary(d2.id);
// Jarak normal antara A ke B (~50m) dan ke E (~39m) tidak boleh meledak ke 400+ km karena teleportasi!
assert.ok(gpsSummary.totalDistanceMeters < 500, `Total jarak (${gpsSummary.totalDistanceMeters}m) tidak boleh meledak akibat lonjakan GPS`);
console.log(`✅ TEST 4 (Lonjakan GPS & Akurasi Buruk Diabaikan) Lulus: Terhitung ${gpsSummary.totalDistanceFormatted}`);

// 6. Test Konsistensi Jumlah Titik Antara Ringkasan & Riwayat Hari yang Sama
console.log('\n--- TEST 5: Konsistensi Jumlah Titik Ringkasan & Riwayat Hari yang Sama ---');
const todayDate = new Date(Date.now() + 7 * 3600 * 1000).toISOString().split('T')[0];
const historyListSameDay = getLocationHistory(d2.id, 100, todayDate);
assert.strictEqual(gpsSummary.pointsCount, historyListSameDay.length, 'Jumlah titik di ringkasan dan daftar riwayat hari yang sama harus identik');
console.log(`✅ TEST 5 (Konsistensi Titik: ${gpsSummary.pointsCount} == ${historyListSameDay.length}) Lulus!`);

// 7. Test Data Kosong
console.log('\n--- TEST 6: Data Kosong (Device Baru / Tanpa Titik) ---');
const u3 = createUser(`test_empty_${Date.now()}@tanpilan.com`, 'hash123');
const d3 = registerOrGetDevice(u3.id, `tok_empty_${Date.now()}`, 'Device Empty');
const emptySummary = getDailyLocationSummary(d3.id);
assert.strictEqual(emptySummary.pointsCount, 0);
assert.strictEqual(emptySummary.totalDistanceMeters, 0);
assert.strictEqual(emptySummary.activeMinutes, 0);
assert.strictEqual(emptySummary.firstTime, null);
const emptyHistory = getLocationHistory(d3.id, 100, todayDate);
assert.strictEqual(emptyHistory.length, 0);
console.log('✅ TEST 6 (Data Kosong Mengembalikan Nilai Default 0) Lulus!');

console.log('\n🎉 SEMUA PENGUJIAN FITUR BARU 100% SUKSES!');
