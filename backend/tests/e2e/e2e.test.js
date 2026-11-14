const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright-core');
const { app, server } = require('../../src/index');

const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function runE2ETests() {
  console.log('\n🎭 ========================================================');
  console.log('🎭 MEMULAI PENGUJIAN END-TO-END (PLAYWRIGHT HEADLESS)');
  console.log('🎭 ========================================================');

  // 1. Jalankan test server pada port dinamis (ephemeral)
  const testServer = await new Promise((resolve) => {
    const s = server.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = testServer.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`📡 E2E Server siap di ${baseUrl}`);

  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });

  const context = await browser.newContext({
    viewport: { width: 360, height: 695 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });

  const page = await context.newPage();
  page.on('dialog', dialog => dialog.accept());

  const cspViolations = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (/Content[- ]Security[- ]Policy/i.test(text)) {
      cspViolations.push(text);
    }
  });

  // Pasang listener securitypolicyviolation sebelum dokumen dimuat
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__cspViolations.push({
        blockedURI: e.blockedURI,
        violatedDirective: e.violatedDirective,
        originalPolicy: e.originalPolicy
      });
    });
  });

  try {
    console.log('\n--- TEST E2E 1: Pemuatan Halaman & Audit Pelanggaran CSP ---');
    const response = await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded' });
    assert.strictEqual(response.status(), 200, 'index.html harus merespons HTTP 200');

    // Tunggu inisialisasi awal
    await page.waitForTimeout(1000);

    const violations = await page.evaluate(() => window.__cspViolations);
    assert.strictEqual(cspViolations.length, 0, `Pelanggaran CSP di konsol: ${cspViolations.join('; ')}`);
    assert.strictEqual(violations.length, 0, `Pelanggaran event securitypolicyviolation: ${JSON.stringify(violations)}`);
    console.log('✅ TEST E2E 1 Lulus: 0 Pelanggaran CSP! Header dan eksekusi skrip bersih.');

    console.log('\n--- TEST E2E 2: Verifikasi Tile Peta Termuat (K0-2) ---');
    // Tunggu tile Leaflet selesai dimuat dengan naturalWidth > 0
    await page.waitForFunction(() => {
      const tiles = Array.from(document.querySelectorAll('img.leaflet-tile'));
      return tiles.length > 0 && tiles.some(img => img.naturalWidth > 0 && img.complete);
    }, { timeout: 12000 });

    const tileInfo = await page.evaluate(() => {
      const tiles = Array.from(document.querySelectorAll('img.leaflet-tile'));
      const loaded = tiles.filter(img => img.naturalWidth > 0 && img.complete);
      return { total: tiles.length, loaded: loaded.length, sampleSrc: loaded[0] ? loaded[0].src : null };
    });
    console.log(`Peta Termuat: ${tileInfo.loaded}/${tileInfo.total} tiles (Sample: ${tileInfo.sampleSrc})`);
    assert(tileInfo.loaded > 0, 'Setidaknya ada 1 tile peta yang termuat sempurna');
    console.log('✅ TEST E2E 2 Lulus: Tile peta termuat sempurna tanpa blokir CSP img-src.');

    console.log('\n--- TEST E2E 3: Interaktivitas Semua Komponen Utama (K0-1) ---');

    // 3.0 Alur Onboarding Awal (jika pertama kali buka tanpa token di localStorage)
    const isOnboarding = await page.evaluate(() => document.getElementById('onboardingModal').classList.contains('active'));
    if (isOnboarding) {
      console.log('  ✔ Onboarding Aktif: Memilih peran Wanita & submit');
      await page.click('[data-action="chooseRole"][data-role="Wanita"]');
      await page.fill('#customNameInput', 'Pengguna Uji E2E');
      await page.click('[data-action="finishOnboarding"]');
      await page.waitForFunction(() => !document.getElementById('onboardingModal').classList.contains('active'), { timeout: 5000 });
      console.log('  ✔ Onboarding Selesai: Modal Onboarding tertutup');
    }

    // 3.1 Modal Hubungkan Pasangan (Header Pair Button)
    await page.click('.header-actions [data-action="openPairModal"]');
    await page.waitForSelector('#pairingModal.active', { timeout: 3000 });
    console.log('  ✔ Tombol Pair Header: Modal Hubungkan terbuka');
    await page.click('#pairingModal [data-action="closeModal"][data-modal="pairingModal"]');
    await page.waitForFunction(() => !document.getElementById('pairingModal').classList.contains('active'));
    console.log('  ✔ Tutup Modal Pair: Modal berhasil ditutup');

    // 3.2 Modal Pengaturan Akun
    await page.click('[data-action="openSettingsModal"]');
    await page.waitForSelector('#settingsModal.active', { timeout: 3000 });
    console.log('  ✔ Tombol Pengaturan Header: Modal Pengaturan terbuka');
    await page.click('#settingsModal [data-action="closeModal"][data-modal="settingsModal"]');
    await page.waitForFunction(() => !document.getElementById('settingsModal').classList.contains('active'));
    console.log('  ✔ Tutup Modal Pengaturan: Modal berhasil ditutup');

    // 3.3 Ganti Gaya Peta (Map Style Cycling)
    const initialStyleIdx = await page.evaluate(() => appState.mapStyleIndex);
    await page.click('#fabLayerToggle');
    await page.waitForTimeout(300);
    const newStyleIdx = await page.evaluate(() => appState.mapStyleIndex);
    assert.strictEqual(newStyleIdx, (initialStyleIdx + 1) % 3, 'Gaya peta harus berganti');
    console.log(`  ✔ Ganti Lapisan Peta: Style berpindah dari ${initialStyleIdx} ke ${newStyleIdx}`);

    // 3.4 Modal Riwayat Jejak
    await page.click('#fabHistoryToggle');
    await page.waitForSelector('#historyModal.active', { timeout: 3000 });
    console.log('  ✔ FAB Riwayat: Modal Riwayat Jejak terbuka');
    await page.click('#historyModal [data-action="closeModal"][data-modal="historyModal"]');
    await page.waitForFunction(() => !document.getElementById('historyModal').classList.contains('active'));
    console.log('  ✔ Tutup Modal Riwayat: Modal berhasil ditutup');

    // 3.5 Kontrol Kamera Peta (Fokus Pasangan, Fit Keduanya, Posisi Saya)
    await page.click('.capsule-segment.partner-segment');
    console.log('  ✔ Kontrol Kamera [Fokus Pasangan]: Berfungsi');

    // Fit Both saat belum berpasangan otomatis membuka modal pairing untuk memandu user
    await page.click('.capsule-segment.fit-segment');
    await page.waitForSelector('#pairingModal.active', { timeout: 3000 });
    console.log('  ✔ Kontrol Kamera [Fit Both]: Memandu buka Modal Hubungkan saat belum berpasangan');
    await page.click('#pairingModal [data-action="closeModal"][data-modal="pairingModal"]');
    await page.waitForFunction(() => !document.getElementById('pairingModal').classList.contains('active'));

    await page.click('.capsule-segment.me-segment');
    console.log('  ✔ Kontrol Kamera [Posisi Saya]: Berfungsi tanpa error');

    // 3.6 Toggle Bottom Sheet (Handle Bar)
    await page.click('.sheet-handle-bar');
    await page.waitForSelector('.bottom-partner-sheet.expanded', { timeout: 3000 });
    console.log('  ✔ Handle Bar Sheet: Sheet terbuka penuh (.expanded)');
    await page.click('.sheet-handle-bar');
    await page.waitForFunction(() => !document.getElementById('bottomPartnerSheet').classList.contains('expanded'));
    console.log('  ✔ Handle Bar Sheet: Sheet tertutup kembali');

    // 3.7 Tombol CTA Belum Terhubung di Bottom Sheet
    await page.click('.btn-unpaired-cta');
    await page.waitForSelector('#pairingModal.active', { timeout: 3000 });
    console.log('  ✔ Tombol CTA "Hubungkan Pasangan": Modal Pairing terbuka');
    await page.click('#pairingModal [data-action="closeModal"][data-modal="pairingModal"]');
    await page.waitForFunction(() => !document.getElementById('pairingModal').classList.contains('active'));
    await page.waitForTimeout(400);

    // 3.8 Aksesibilitas Keyboard (Enter & Space pada elemen role="button")
    await page.focus('.sheet-handle-bar');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('bottomPartnerSheet').classList.contains('expanded'), { timeout: 3000 });
    console.log('  ✔ Aksesibilitas Keyboard [Enter]: Handle Sheet terbuka via keyboard');
    await page.keyboard.press('Space');
    await page.waitForFunction(() => !document.getElementById('bottomPartnerSheet').classList.contains('expanded'), { timeout: 3000 });
    console.log('  ✔ Aksesibilitas Keyboard [Space]: Handle Sheet tertutup via keyboard');

    console.log('✅ TEST E2E 3 Lulus: Seluruh elemen interaktif dan aksesibilitas keyboard bekerja sempurna!');

    console.log('\n--- TEST E2E 4: Verifikasi CTA Bottom Sheet Tidak Terpotong (K0-3) ---');
    const viewports = [
      { width: 320, height: 568, name: 'iPhone SE (320x568)' },
      { width: 360, height: 695, name: 'Android Standar (360x695)' },
      { width: 390, height: 844, name: 'iPhone Modern (390x844)' }
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(300);

      const metrics = await page.evaluate(() => {
        const ctaBtn = document.querySelector('.btn-unpaired-cta');
        const sheet = document.getElementById('bottomPartnerSheet');
        const ctaRect = ctaBtn.getBoundingClientRect();
        const sheetRect = sheet.getBoundingClientRect();
        const winHeight = window.innerHeight;

        return {
          winHeight,
          sheetHeight: Math.round(sheetRect.height),
          sheetRatio: Number((sheetRect.height / winHeight).toFixed(2)),
          ctaBottom: Math.round(ctaRect.bottom),
          sheetBottom: Math.round(sheetRect.bottom),
          isCtaWithinViewport: ctaRect.bottom <= winHeight,
          isCtaWithinSheet: ctaRect.bottom <= sheetRect.bottom + 1
        };
      });

      console.log(`Viewport ${vp.name}: Sheet Tinggi=${metrics.sheetHeight}px (${Math.round(metrics.sheetRatio * 100)}% layar) | CTA Bottom=${metrics.ctaBottom}px (Viewport=${metrics.winHeight}px)`);
      assert(metrics.isCtaWithinViewport, `Tombol CTA terpotong di luar viewport pada ${vp.name}`);
      assert(metrics.isCtaWithinSheet, `Tombol CTA terpotong di dalam sheet pada ${vp.name}`);
      assert(metrics.sheetRatio <= 0.45, `Tinggi sheet melebihi batas 45% layar (${Math.round(metrics.sheetRatio * 100)}%) pada ${vp.name}`);
    }
    console.log('✅ TEST E2E 4 Lulus: Tombol CTA terlihat utuh 100% dan peta tidak tertutup > 45% di semua layar!');

    // Pastikan sampai akhir pengujian tidak ada CSP violation yang tertangkap
    const finalViolations = await page.evaluate(() => window.__cspViolations);
    assert.strictEqual(finalViolations.length, 0, `Pelanggaran CSP terdeteksi selama pengujian: ${JSON.stringify(finalViolations)}`);
    console.log('✅ Audit Konsol Final: Bersih! 0 Pelanggaran CSP.');

  } finally {
    await browser.close();
    await new Promise((resolve) => testServer.close(resolve));
  }

  console.log('\n🎉 ========================================================');
  console.log('🎉 SEMUA PENGUJIAN E2E PLAYWRIGHT BERHASIL (100% PASS)!');
  console.log('🎉 ========================================================\n');
}

// Jalankan jika dieksekusi langsung
if (require.main === module) {
  runE2ETests().catch((err) => {
    console.error('❌ E2E TEST GAGAL:', err);
    process.exit(1);
  });
}

module.exports = { runE2ETests };
