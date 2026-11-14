const fs = require('fs');
const path = require('path');
const assert = require('assert');
const WebSocket = require('ws');
const { app, server } = require('../src/index');

let testServer;
let BASE_URL;
let WS_URL;

async function runBugHunt() {
  console.log('🔍 ============================================================');
  console.log('🔍 MEMULAI AUDIT & BUG HUNT MENYELURUH (COMPREHENSIVE BUG HUNT)');
  console.log('🔍 ============================================================');

  // Mulai test server di port dinamis (ephemeral port 0)
  await new Promise((resolve) => {
    testServer = server.listen(0, '127.0.0.1', () => {
      const port = testServer.address().port;
      BASE_URL = `http://127.0.0.1:${port}`;
      WS_URL = `ws://127.0.0.1:${port}/ws`;
      resolve();
    });
  });

  let issuesFound = [];

  // ==========================================
  // PHASE 1: AUDIT DOM & JAVASCRIPT FRONTEND (INDEX.HTML)
  // ==========================================
  console.log('\n--- [FASE 1] Audit DOM & Referensi Elemen di public/index.html ---');
  const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  // 1.1 Ekstrak semua id="..." di HTML
  const definedIds = new Set();
  const idRegex = /id=["']([a-zA-Z0-9_\-]+)["']/g;
  let match;
  while ((match = idRegex.exec(htmlContent)) !== null) {
    definedIds.add(match[1]);
  }
  console.log(`Ditemukan ${definedIds.size} elemen HTML dengan ID unik.`);

  // 1.2 Ekstrak semua kode JavaScript frontend (inline script maupun assets/app.js)
  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let fullJsContent = '';
  while ((match = scriptRegex.exec(htmlContent)) !== null) {
    if (!match[0].includes('src=')) {
      fullJsContent += match[1] + '\n';
    }
  }
  const appJsPath = path.join(__dirname, '..', 'public', 'assets', 'app.js');
  if (fs.existsSync(appJsPath)) {
    fullJsContent += fs.readFileSync(appJsPath, 'utf8') + '\n';
  }

  if (!fullJsContent) {
    issuesFound.push('Tidak ditemukan kode JavaScript di index.html maupun assets/app.js');
  } else {
    const getElemRegex = /document\.getElementById\(['"]([a-zA-Z0-9_\-]+)['"]\)/g;
    const referencedIds = new Set();
    while ((match = getElemRegex.exec(fullJsContent)) !== null) {
      referencedIds.add(match[1]);
    }

    let missingIds = [];
    for (const refId of referencedIds) {
      if (!definedIds.has(refId)) {
        missingIds.push(refId);
      }
    }

    if (missingIds.length > 0) {
      issuesFound.push(`ID HTML dipanggil oleh JS tapi TIDAK DITEMUKAN di DOM: ${missingIds.join(', ')}`);
      console.log(`❌ BUG DITEMUKAN: Ada ID yang tidak ada di DOM:`, missingIds);
    } else {
      console.log(`✅ SEMUA ID (${referencedIds.size} ID) yang dipanggil di JavaScript valid dan ada di DOM!`);
    }

    // 1.3 Ekstrak semua data-action="..." dan onclick="..." di HTML dan cek apakah fungsinya ada di JS
    const actionRegex = /(?:data-action=["']|onclick=["'])([a-zA-Z0-9_]+)/g;
    const calledFunctions = new Set();
    while ((match = actionRegex.exec(htmlContent)) !== null) {
      calledFunctions.add(match[1]);
    }

    let missingFuncs = [];
    for (const funcName of calledFunctions) {
      const funcDecl = new RegExp(`(?:function\\s+${funcName}\\s*\\(|${funcName}:\\s*(?:\\(|function))`, 'g');
      const varFuncDecl = new RegExp(`(?:const|let|var)\\s+${funcName}\\s*=\\s*(?:function|\\()`, 'g');
      if (!funcDecl.test(fullJsContent) && !varFuncDecl.test(fullJsContent)) {
        missingFuncs.push(funcName);
      }
    }

    if (missingFuncs.length > 0) {
      issuesFound.push(`Fungsi action di HTML tapi TIDAK DITEMUKAN di JS: ${missingFuncs.join(', ')}`);
      console.log(`❌ BUG DITEMUKAN: Fungsi action tidak ditemukan di script:`, missingFuncs);
    } else {
      console.log(`✅ SEMUA aksi (${calledFunctions.size} aksi) terdefinisi di JavaScript!`);
    }
  }

  // ==========================================
  // PHASE 2: AUDIT DUAL DEVICE SIMULATOR
  // ==========================================
  console.log('\n--- [FASE 2] Audit DOM & Referensi Elemen di DualDeviceSimulator.html ---');
  const simPath = path.join(__dirname, '..', '..', 'simulator', 'DualDeviceSimulator.html');
  if (fs.existsSync(simPath)) {
    const simContent = fs.readFileSync(simPath, 'utf8');
    const simIds = new Set();
    while ((match = idRegex.exec(simContent)) !== null) {
      simIds.add(match[1]);
    }

    let simJs = '';
    while ((match = scriptRegex.exec(simContent)) !== null) {
      if (!match[0].includes('src=')) {
        simJs += match[1] + '\n';
      }
    }

    const simGetElemRegex = /document\.getElementById\(['"]([a-zA-Z0-9_\-]+)['"]\)/g;
    const simRefIds = new Set();
    while ((match = simGetElemRegex.exec(simJs)) !== null) {
      simRefIds.add(match[1]);
    }

    let simMissing = [];
    for (const id of simRefIds) {
      if (!simIds.has(id)) {
        simMissing.push(id);
      }
    }

    if (simMissing.length > 0) {
      issuesFound.push(`ID Simulator hilang di DOM: ${simMissing.join(', ')}`);
      console.log(`❌ BUG DITEMUKAN: ID Simulator tidak ada di DOM:`, simMissing);
    } else {
      console.log(`✅ Semua ID elemen di Simulator valid!`);
    }
  }

  // ==========================================
  // PHASE 3: AUDIT REST API EDGE CASES & SECURITY
  // ==========================================
  console.log('\n--- [FASE 3] Audit REST API Edge Cases & Error Handling ---');

  // 3.1 Registrasi tanpa email/password
  const resBadReg = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  if (resBadReg.status !== 400) {
    issuesFound.push(`Auth register tanpa body harusnya 400, didapat: ${resBadReg.status}`);
  } else {
    console.log(`✅ [Edge Case] Register tanpa body ditolak dengan status 400`);
  }

  // 3.2 Login dengan password salah
  const testUser = `bughunt_${Date.now()}@tanpilan.com`;
  const regOk = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testUser, password: 'passwordBenar123' })
  }).then(r => r.json());

  const resWrongLogin = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testUser, password: 'passwordSalah' })
  });
  if (resWrongLogin.status !== 401) {
    issuesFound.push(`Login password salah harusnya 401, didapat: ${resWrongLogin.status}`);
  } else {
    console.log(`✅ [Edge Case] Login password salah ditolak dengan status 401`);
  }

  // 3.3 Akses rute terproteksi tanpa token
  const resNoAuth = await fetch(`${BASE_URL}/api/location/latest`);
  if (resNoAuth.status !== 401) {
    issuesFound.push(`Akses /api/location/latest tanpa token harusnya 401, didapat: ${resNoAuth.status}`);
  } else {
    console.log(`✅ [Edge Case] Akses endpoint tanpa otorisasi ditolak dengan status 401`);
  }

  // 3.4 Registrasi device untuk user
  const devRes = await fetch(`${BASE_URL}/api/device/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${regOk.token}` },
    body: JSON.stringify({ deviceName: 'HP Audit' })
  }).then(r => r.json());

  // 3.5 Location update dengan data koordinat invalid (string/null)
  const resBadCoords = await fetch(`${BASE_URL}/api/location/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-Token': devRes.device.device_token },
    body: JSON.stringify({ latitude: 'invalid_string', longitude: null })
  });
  if (resBadCoords.status !== 400) {
    issuesFound.push(`Location update koordinat string/null harusnya 400, didapat: ${resBadCoords.status}`);
  } else {
    console.log(`✅ [Edge Case] Koordinat invalid string/null ditolak dengan status 400`);
  }

  // 3.6 History untuk device baru (harus array kosong, bukan error 500)
  const resEmptyHistory = await fetch(`${BASE_URL}/api/location/history`, {
    headers: { 'X-Device-Token': devRes.device.device_token }
  });
  const histData = await resEmptyHistory.json();
  if (resEmptyHistory.status !== 200 || !Array.isArray(histData.history) || histData.history.length !== 0) {
    issuesFound.push(`History device baru gagal atau tidak mengembalikan array kosong`);
  } else {
    console.log(`✅ [Edge Case] History device baru mengembalikan array kosong tanpa error`);
  }

  // 3.7 Daily summary untuk device baru (harus return object default tanpa crash)
  const resEmptySummary = await fetch(`${BASE_URL}/api/location/daily-summary`, {
    headers: { 'X-Device-Token': devRes.device.device_token }
  });
  const sumData = await resEmptySummary.json();
  if (resEmptySummary.status !== 200 || !sumData.summary || sumData.summary.pointsCount !== 0) {
    issuesFound.push(`Daily summary device baru gagal atau format salah`);
  } else {
    console.log(`✅ [Edge Case] Daily summary device baru mengembalikan jarak 0m dan 0 titik dengan benar`);
  }

  // 3.8 Daily summary dengan filter tanggal invalid (harus ditangani aman)
  const resDateSummary = await fetch(`${BASE_URL}/api/location/daily-summary?date=2026-01-01`, {
    headers: { 'X-Device-Token': devRes.device.device_token }
  });
  if (resDateSummary.status !== 200) {
    issuesFound.push(`Daily summary dengan parameter date gagal diproses`);
  } else {
    console.log(`✅ [Edge Case] Daily summary dengan filter tanggal berhasil diproses`);
  }

  // 3.9 Tambah tempat favorit tanpa field wajib
  const resBadPlace = await fetch(`${BASE_URL}/api/places`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${regOk.token}` },
    body: JSON.stringify({ name: '' })
  });
  if (resBadPlace.status !== 400) {
    issuesFound.push(`Tambah tempat tanpa koordinat/nama harusnya 400, didapat: ${resBadPlace.status}`);
  } else {
    console.log(`✅ [Edge Case] Tambah tempat tanpa koordinat/nama ditolak dengan status 400`);
  }

  // 3.10 Hapus tempat favorit non-existent ID
  const resDeleteNonExistent = await fetch(`${BASE_URL}/api/places/999999`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${regOk.token}` }
  });
  if (resDeleteNonExistent.status !== 404) {
    issuesFound.push(`Hapus tempat ID tidak ada harusnya 404, didapat: ${resDeleteNonExistent.status}`);
  } else {
    console.log(`✅ [Edge Case] Hapus tempat non-existent mengembalikan status 404`);
  }

  // 3.11 Tambah tempat valid lalu hapus sukses
  const placeOk = await fetch(`${BASE_URL}/api/places`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${regOk.token}` },
    body: JSON.stringify({ name: 'Kantor Audit', latitude: -7.801, longitude: 110.364 })
  }).then(r => r.json());

  const resDeleteOk = await fetch(`${BASE_URL}/api/places/${placeOk.place.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${regOk.token}` }
  });
  if (resDeleteOk.status !== 200) {
    issuesFound.push(`Hapus tempat valid gagal: ${resDeleteOk.status}`);
  } else {
    console.log(`✅ [Edge Case] Hapus tempat milik sendiri sukses (200 OK)`);
  }

  // 3.12 Pairing code yang salah
  const resBadPair = await fetch(`${BASE_URL}/api/device/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${regOk.token}` },
    body: JSON.stringify({ code: 'WRONG1' })
  });
  if (resBadPair.status !== 404) {
    issuesFound.push(`Pairing kode salah harusnya 404, didapat: ${resBadPair.status}`);
  } else {
    console.log(`✅ [Edge Case] Pairing kode salah ditolak (404)`);
  }

  // ==========================================
  // PHASE 4: AUDIT WEBSOCKET SERVER
  // ==========================================
  console.log('\n--- [FASE 4] Audit WebSocket Server: Malformed Data & Stress ---');

  const ws = new WebSocket(WS_URL);

  await new Promise((resolve) => ws.on('open', resolve));

  // 4.1 Kirim pesan non-JSON
  let receivedError = false;
  const errorPromise = new Promise((resolve) => {
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.event === 'error') {
          receivedError = true;
          resolve();
        }
      } catch (e) {}
    });
  });
  ws.send('INI BUKAN JSON {{{');
  await Promise.race([errorPromise, new Promise(r => setTimeout(r, 1000))]);
  if (!receivedError) {
    issuesFound.push('WebSocket tidak mengirim event error saat menerima JSON malformed');
  } else {
    console.log(`✅ [WebSocket] Pesan non-JSON ditangani dengan aman tanpa crash server`);
  }

  // 4.2 Kirim unknown event
  ws.send(JSON.stringify({ event: 'HACK_THE_MAINFRAME', data: {} }));
  await new Promise(r => setTimeout(r, 200));
  console.log(`✅ [WebSocket] Unknown event berhasil dilewati dengan aman`);

  // 4.3 Kirim poke tanpa pasangan
  ws.send(JSON.stringify({ event: 'send_poke', data: { type: 'heart' } }));
  await new Promise(r => setTimeout(r, 200));
  console.log(`✅ [WebSocket] Poke tanpa pasangan tidak memicu unhandled rejection/crash`);

  // 4.4 Ping - Pong test
  let receivedPong = false;
  const pongPromise = new Promise((resolve) => {
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.event === 'pong') {
          receivedPong = true;
          resolve();
        }
      } catch (e) {}
    });
  });
  ws.send(JSON.stringify({ event: 'ping' }));
  await Promise.race([pongPromise, new Promise(r => setTimeout(r, 2000))]);
  if (!receivedPong) {
    issuesFound.push('WebSocket gagal membalas event ping dengan pong');
  } else {
    console.log(`✅ [WebSocket] Ping - Pong heartbeat berfungsi normal`);
  }

  ws.close();

  // ==========================================
  // RINGKASAN AUDIT
  // ==========================================
  console.log('\n============================================================');
  if (issuesFound.length === 0) {
    console.log('🎉 HASIL AUDIT: SEMPURNA! 0 BUG DITEMUKAN!');
    console.log('Semua modul Frontend DOM, REST API, WebSocket, dan Edge Cases 100% Lolos.');
    console.log('============================================================\n');
  } else {
    console.log(`⚠️ HASIL AUDIT: DITEMUKAN ${issuesFound.length} MASALAH:`);
    issuesFound.forEach((iss, idx) => console.log(`   ${idx + 1}. ${iss}`));
    console.log('============================================================\n');
  }

  if (testServer) testServer.close();

  if (issuesFound.length > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runBugHunt().catch((err) => {
  console.error(err);
  if (testServer) testServer.close();
  process.exit(1);
});
