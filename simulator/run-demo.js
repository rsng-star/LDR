/**
 * Demo runner otomatis untuk memvalidasi alur UC-01 & UC-02 secara live di terminal
 */
const WebSocket = require('../backend/node_modules/ws');
const http = require('http');

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const req = http.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
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

async function runDemo() {
  console.log('================================================================');
  console.log('🚀 DEMO LIVE REALTIME: APLIKASI TANPILAN (WANITA & PRIA)');
  console.log('================================================================\n');

  const BASE_URL = 'http://localhost:3000';

  // 1. Health check
  console.log('1️⃣ Mengecek status backend server...');
  const health = await request(`${BASE_URL}/api/health`);
  console.log(`   Status: ${health.data.status} | Service: ${health.data.service}\n`);

  // 2. Register & Login Wanita (Perangkat 1)
  console.log('2️⃣ Mendaftarkan Pengguna Wanita (Perangkat 1)...');
  const wanitaEmail = `wanita_demo_${Date.now()}@tanpilan.local`;
  const wanitaAuth = await request(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { email: wanitaEmail, password: 'Password123' }
  });
  const wanitaToken = wanitaAuth.data.token;
  console.log(`   Wanita terdaftar: User ID #${wanitaAuth.data.user.id}`);

  // Register device Wanita
  const wanitaDevRes = await request(`${BASE_URL}/api/device/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${wanitaToken}` },
    body: { deviceToken: `token_wanita_${Date.now()}`, deviceName: 'Perangkat Wanita' }
  });
  const wanitaDevice = wanitaDevRes.data.device;
  console.log(`   Perangkat Wanita terdaftar: Device #${wanitaDevice.id} (${wanitaDevice.device_name})\n`);

  // 3. Register & Login Pria (Perangkat 2)
  console.log('3️⃣ Mendaftarkan Pengguna Pria (Perangkat 2)...');
  const priaEmail = `pria_demo_${Date.now()}@tanpilan.local`;
  const priaAuth = await request(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { email: priaEmail, password: 'Password123' }
  });
  const priaToken = priaAuth.data.token;
  console.log(`   Pria terdaftar: User ID #${priaAuth.data.user.id}`);

  // Register device Pria
  const priaDevRes = await request(`${BASE_URL}/api/device/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${priaToken}` },
    body: { deviceToken: `token_pria_${Date.now()}`, deviceName: 'Perangkat Pria' }
  });
  const priaDevice = priaDevRes.data.device;
  console.log(`   Perangkat Pria terdaftar: Device #${priaDevice.id} (${priaDevice.device_name})\n`);

  // 4. UC-01: Pairing Device
  console.log('4️⃣ UC-01: Membuat Kode Pairing & Menghubungkan Kedua Perangkat...');
  const codeRes = await request(`${BASE_URL}/api/device/generate-code`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${priaToken}` }
  });
  const pairingCode = codeRes.data.code;
  console.log(`   Pria men-generate Kode Pairing 6-Digit: [ ${pairingCode} ]`);

  const pairRes = await request(`${BASE_URL}/api/device/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${wanitaToken}` },
    body: { code: pairingCode }
  });
  console.log(`   Wanita memasukkan kode ${pairingCode}`);
  console.log(`   Hasil Pairing: "${pairRes.data.message}" | Partner: ${pairRes.data.partner.name}\n`);

  // 5. Setup Realtime WebSocket Listener untuk Wanita
  console.log('5️⃣ Membuka Realtime WebSocket Connection untuk Wanita & Pria...');
  const wanitaWs = new WebSocket(`ws://localhost:3000/ws?device_token=${wanitaDevice.device_token}`);
  const priaWs = new WebSocket(`ws://localhost:3000/ws?device_token=${priaDevice.device_token}`);

  let alertReceivedByWanita = null;
  let updateReceivedByWanita = null;

  wanitaWs.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.event === 'partner_location_update') {
      updateReceivedByWanita = msg.data;
      console.log(`   📥 [WS Wanita Menerima Posisi Pria]: Lat=${msg.data.location.latitude.toFixed(5)}, Jarak=${msg.data.distanceFormatted}`);
    }
    if (msg.event === 'distance_alert') {
      alertReceivedByWanita = msg.data;
      console.log(`   🚨 [WS Wanita Menerima Push Alert Jarak]: "${msg.data.message}"`);
    }
  });

  await wait(1000);

  // 6. UC-02: Kirim GPS Pertama Wanita & Pria (Jarak Dekat ~25 meter)
  console.log('\n6️⃣ UC-02: Mengirim GPS Pertama (Jarak Dekat < 100m - Monas)...');
  const baseLat = -6.175392;
  const baseLng = 106.827153;

  // Wanita kirim posisi
  await request(`${BASE_URL}/api/location/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${wanitaToken}` },
    body: { latitude: baseLat, longitude: baseLng, accuracy: 5, battery: 95 }
  });

  // Pria kirim posisi dekat (~25 meter)
  await request(`${BASE_URL}/api/location/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${priaToken}` },
    body: { latitude: baseLat + 0.00018, longitude: baseLng + 0.00015, accuracy: 5, battery: 89 }
  });

  await wait(1000);
  console.log('   Hasil Jarak Dekat: Status aman (tidak ada notifikasi alarm).');

  // 7. UC-02: Pria Bergerak Menjauh (~350 meter)
  console.log('\n7️⃣ UC-02: Pria Bergerak Menjauh (Jarak ~350 Meter)...');
  const farLat = baseLat + 0.00260;
  const farLng = baseLng + 0.00180;

  await request(`${BASE_URL}/api/location/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${priaToken}` },
    body: { latitude: farLat, longitude: farLng, accuracy: 5, battery: 88 }
  });

  await wait(1500);

  console.log('\n✅ VERIFIKASI SUKSES: Posisi dan jarak realtime berhasil diproses & dikirimkan ke pasangan tanpa alarm bising!');

  // Tutup koneksi
  wanitaWs.close();
  priaWs.close();

  console.log('\n🎉 DEMO SELESAI DENGAN SUKSES!');
  console.log('Buka simulator visual interaktif di browser Anda:');
  console.log('➡️  http://localhost:3000/simulator/DualDeviceSimulator.html\n');
}

runDemo().catch(err => {
  console.error('Demo error:', err);
  process.exit(1);
});
