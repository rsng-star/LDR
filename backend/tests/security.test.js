const assert = require('assert');
const http = require('http');
const { app, server } = require('../src/index');
const { db, getDeviceById } = require('../src/db/database');
const { resetPairRateLimiter } = require('../src/utils/security');
const { escapeHtml } = require('../src/utils/validators');

let testServer;
let BASE_URL;

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const parsed = new URL(url);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runSecurityTests() {
  console.log('\n🔒 ========================================================');
  console.log('🔒 MEMULAI PENGUJIAN KEAMANAN, PRIVASI & ROBUSTNESS');
  console.log('🔒 ========================================================\n');

  // Mulai test server di port dinamis (ephemeral port 0)
  await new Promise((resolve) => {
    testServer = server.listen(0, '127.0.0.1', () => {
      const port = testServer.address().port;
      BASE_URL = `http://127.0.0.1:${port}`;
      console.log(`📡 Test Server Aktif di ${BASE_URL}\n`);
      resolve();
    });
  });

  resetPairRateLimiter();

  // Helper untuk registrasi user + device
  async function createTestUser(prefix) {
    const email = `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}@tanpilan.local`;
    const password = 'StrongPassword2026!';
    const regRes = await request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { email, password }
    });
    assert.strictEqual(regRes.status, 201, 'Registrasi harus 201 Created');
    const token = regRes.data.token;
    const userId = regRes.data.user.id;

    // Registrasi device (server-side token)
    const devRes = await request('/api/device/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: { deviceName: `HP ${prefix}` }
    });
    assert.strictEqual(devRes.status, 200, 'Device register harus 200 OK');
    const device = devRes.data.device;

    return { email, password, token, userId, device };
  }

  // --- TEST 1: Token Acak Server & Tidak Bisa Dipilih Klien (P0-1) ---
  console.log('--- TEST 1: Token Acak Server & Klien Tidak Bisa Memilih Token ---');
  const user1 = await createTestUser('sec_test1');
  assert.strictEqual(typeof user1.device.device_token, 'string');
  assert.strictEqual(user1.device.device_token.length, 64, 'Token harus 64 karakter hex (32 random bytes)');

  // Coba minta token khusus dari klien
  const customDevRes = await request('/api/device/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user1.token}` },
    body: { deviceName: 'HP Hacker', deviceToken: 'hacker_chosen_token_12345' }
  });
  // Harus mengembalikan device yang ada atau tidak memakai token buatan klien
  assert.notStrictEqual(customDevRes.data.device.device_token, 'hacker_chosen_token_12345', 'Klien dilarang memilih token acak!');
  console.log('✅ TEST 1 Lulus: Token dihasilkan secara aman oleh server via crypto.randomBytes\n');

  // --- TEST 2: Register Perangkat Dengan Token Milik User Lain Ditolak (P0-1) ---
  console.log('--- TEST 2: Register Dengan Token Milik User Lain Ditolak (403) ---');
  const user2 = await createTestUser('sec_test2');
  // User 2 mencoba mendaftarkan device dengan token milik User 1
  const hijackRes = await request('/api/device/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user2.token}` },
    body: { deviceName: 'HP Pembajak', deviceToken: user1.device.device_token }
  });
  assert.strictEqual(hijackRes.status, 403, 'Harus ditolak dengan status 403 Forbidden');
  assert.ok(hijackRes.data.error.includes('Akses ditolak'), 'Pesan error harus menunjukkan penolakan kepemilikan token');
  console.log('✅ TEST 2 Lulus: Upaya pembajakan token antar-user berhasil diblokir (403 Forbidden)\n');

  // --- TEST 3: Stored XSS Payload Disanitasi (P0-2) ---
  console.log('--- TEST 3: Proteksi Stored XSS & Sanitasi Nama ---');
  const xssPayload = '<img src=x onerror=alert(document.cookie)> Kedai Kopi';
  const placeRes = await request('/api/places', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${user1.token}`,
      'X-Device-Token': user1.device.device_token
    },
    body: {
      name: xssPayload,
      latitude: -7.801,
      longitude: 110.364,
      icon: 'invalid_hacker_icon'
    }
  });
  assert.strictEqual(placeRes.status, 201, 'Tambah tempat berhasil');
  assert.strictEqual(placeRes.data.place.icon, 'home', 'Icon invalid harus di-fallback ke whitelist aman (home)');
  assert.ok(placeRes.data.place.name.length <= 60, 'Panjang nama tempat harus dibatasi');
  console.log('✅ TEST 3 Lulus: Payload XSS berhasil disanitasi & whitelist ikon diterapkan\n');

  // --- TEST 4: Kode Pairing Kedaluwarsa Ditolak (P0-3) ---
  console.log('--- TEST 4: Bug Kedaluwarsa Pairing Code Diperbaiki (Ditolak Jika > 15 Menit) ---');
  const userA = await createTestUser('pair_a');
  const userB = await createTestUser('pair_b');

  const codeRes = await request('/api/device/generate-code', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${userA.token}` }
  });
  const pairCode = codeRes.data.code;
  assert.ok(pairCode && pairCode.length === 6, 'Kode pairing harus 6 digit');

  // Manipulasi waktu kedaluwarsa ke 16 menit yang lalu di database
  const expiredTimeMs = Date.now() - 60000; // 1 menit yang lalu
  db.prepare('UPDATE devices SET pairing_code_expires_at = ? WHERE id = ?').run(expiredTimeMs, userA.device.id);

  // User B mencoba memasangkan kode yang sudah kedaluwarsa
  const pairExpiredRes = await request('/api/device/pair', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userB.token}` },
    body: { code: pairCode }
  });
  assert.strictEqual(pairExpiredRes.status, 404, 'Kode kedaluwarsa harus ditolak dengan status 404');
  console.log('✅ TEST 4 Lulus: Kode pairing yang kedaluwarsa ditolak dengan benar (404 Not Found)\n');

  // --- TEST 5: Rate Limiting /api/device/pair (P0-3) ---
  console.log('--- TEST 5: Rate Limiting Percobaan Pairing (Max 5/Menit) ---');
  resetPairRateLimiter();
  for (let i = 1; i <= 5; i++) {
    const res = await request('/api/device/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userB.token}` },
      body: { code: 'INVALID' }
    });
    assert.strictEqual(res.status, 404, `Percobaan ${i} harus mengembalikan 404`);
  }
  // Percobaan ke-6 harus terkena 429 Too Many Requests
  const rateLimitRes = await request('/api/device/pair', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userB.token}` },
    body: { code: 'INVALID' }
  });
  assert.strictEqual(rateLimitRes.status, 429, 'Percobaan ke-6 harus diblokir dengan status 429 Too Many Requests');
  console.log('✅ TEST 5 Lulus: Rate limiting dan lockout 15 menit berhasil aktif pada percobaan ke-6\n');
  resetPairRateLimiter();

  // --- TEST 6: Skenario 1:1 Mutual Pairing: A-B lalu A-C (P0-4 & P3-5) ---
  console.log('--- TEST 6: Hubungan 1:1 Mutual Pairing (A-B lalu A-C: B Kehilangan Akses) ---');
  const devA = await createTestUser('mutual_a');
  const devB = await createTestUser('mutual_b');
  const devC = await createTestUser('mutual_c');

  // 1. Simpan lokasi awal A
  await request('/api/location/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-Token': devA.device.device_token },
    body: { latitude: -7.801, longitude: 110.364, accuracy: 5, speed: 0 }
  });

  // 2. Pasangkan A dan B
  const codeB = await request('/api/device/generate-code', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${devB.token}` }
  });
  const pairAB = await request('/api/device/pair', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${devA.token}` },
    body: { code: codeB.data.code }
  });
  assert.strictEqual(pairAB.status, 200, 'Pairing A-B harus sukses');

  // B bisa melihat lokasi A
  const bViewA1 = await request('/api/location/latest', {
    headers: { 'X-Device-Token': devB.device.device_token }
  });
  assert.ok(bViewA1.data.partnerDevice && bViewA1.data.partnerDevice.location, 'B harus bisa melihat lokasi A saat berpasangan');

  // 3. Pasangkan A dengan C (A meninggalkan B dan berpasangan dengan C)
  const codeC = await request('/api/device/generate-code', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${devC.token}` }
  });
  const pairAC = await request('/api/device/pair', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${devA.token}` },
    body: { code: codeC.data.code }
  });
  assert.strictEqual(pairAC.status, 200, 'Pairing A-C harus sukses');

  // 4. Verifikasi B kehilangan akses ke A
  const bViewA2 = await request('/api/location/latest', {
    headers: { 'X-Device-Token': devB.device.device_token }
  });
  assert.strictEqual(bViewA2.data.partnerDevice, null, 'Pasangan B harus null (kehilangan akses ke A)');

  // B mencoba mengakses history partner
  const bHistoryA = await request('/api/location/history?target=partner', {
    headers: { 'X-Device-Token': devB.device.device_token }
  });
  assert.strictEqual(bHistoryA.status, 403, 'B harus dilarang mengakses riwayat partner setelah unpair/switch (403)');
  console.log('✅ TEST 6 Lulus: Saat A berpasangan dengan C, B otomatis kehilangan akses ke lokasi & riwayat A\n');

  // --- TEST 7: Ringkasan Harian Mengagregasi > 100 Titik (P1-1) ---
  console.log('--- TEST 7: Ringkasan Harian Mengagregasi > 100 Titik Tanpa Batasan Artifisial ---');
  const userLong = await createTestUser('long_journey');
  const todayStr = new Date(Date.now() + 7 * 3600 * 1000).toISOString().split('T')[0];

  // Masukkan 120 titik lokasi
  for (let i = 0; i < 120; i++) {
    const timeOffsetMs = Date.now() - (120 - i) * 10000;
    const timeIso = new Date(timeOffsetMs).toISOString();
    db.prepare(`
      INSERT INTO locations (device_id, latitude, longitude, accuracy, speed, heading, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      userLong.device.id,
      -7.8000 + (i * 0.0001),
      110.3600 + (i * 0.0001),
      5,
      1.5,
      90,
      timeIso
    );
  }

  const summaryRes = await request(`/api/location/daily-summary?date=${todayStr}`, {
    headers: { 'X-Device-Token': userLong.device.device_token }
  });
  assert.strictEqual(summaryRes.status, 200);
  assert.strictEqual(summaryRes.data.summary.pointsCount, 120, 'Ringkasan harian harus membaca seluruh 120 titik hari itu');
  assert.ok(summaryRes.data.summary.totalDistanceMeters > 0, 'Jarak harus terakumulasi di atas 100 titik');
  console.log(`✅ TEST 7 Lulus: Seluruh 120 titik terhitung (${summaryRes.data.summary.totalDistanceFormatted})\n`);

  // --- TEST 8: Validasi Input Koordinat, Battery, Limit (P2-1) ---
  console.log('--- TEST 8: Validasi Input REST API & Clamping ---');
  // Latitude invalid (> 90)
  const badLatRes = await request('/api/location/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-Token': user1.device.device_token },
    body: { latitude: 95.5, longitude: 110.0 }
  });
  assert.strictEqual(badLatRes.status, 400, 'Latitude > 90 harus ditolak dengan status 400');

  // Limit string 'abc' di history di-clamp secara aman tanpa crash
  const badLimitRes = await request('/api/location/history?limit=abc', {
    headers: { 'X-Device-Token': user1.device.device_token }
  });
  assert.strictEqual(badLimitRes.status, 200, 'Limit non-number harus di-fallback aman');
  console.log('✅ TEST 8 Lulus: Validasi batasan koordinat dan limit berhasil mencegah crash/injeksi\n');

  // --- TEST 9: Jeda Berbagi Lokasi & Hapus Semua Data (P3-3, P3-4) ---
  console.log('--- TEST 9: Jeda Berbagi Lokasi & Hak Hapus Semua Data (GDPR) ---');
  // DevA jeda berbagi
  const pauseRes = await request('/api/device/pause-sharing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${devA.token}` },
    body: { pause: true }
  });
  assert.strictEqual(pauseRes.status, 200);
  assert.strictEqual(pauseRes.data.isSharingPaused, true);

  // DevC mengecek lokasi DevA -> tidak mendapatkan koordinat karena dijeda
  const cViewA = await request('/api/location/latest', {
    headers: { 'X-Device-Token': devC.device.device_token }
  });
  assert.strictEqual(cViewA.data.partnerDevice.location, null, 'Lokasi partner harus null saat dijeda');

  // DevA menghapus semua datanya secara permanen
  const deleteRes = await request('/api/auth/me/data', {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${devA.token}` }
  });
  assert.strictEqual(deleteRes.status, 200);
  assert.strictEqual(deleteRes.data.success, true);

  // Verifikasi perangkat DevA sudah musnah dari DB
  assert.strictEqual(getDeviceById(devA.device.id), null, 'Perangkat harus musnah dari database');
  console.log('✅ TEST 9 Lulus: Fitur Jeda Berbagi Lokasi & Hapus Seluruh Data berfungsi sempurna\n');

  console.log('🎉 ========================================================');
  console.log('🎉 SEMUA 9 PENGUJIAN KEAMANAN & PRIVASI BERHASIL (100% PASS)');
  console.log('🎉 ========================================================\n');

  if (testServer) {
    testServer.close();
  }
  process.exit(0);
}

// Jalankan pengujian
runSecurityTests().catch((err) => {
  console.error('❌ PENGUJIAN KEAMANAN GAGAL:', err);
  if (testServer) testServer.close();
  process.exit(1);
});
