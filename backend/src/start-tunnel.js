const localtunnel = require('localtunnel');
const config = require('./config');

async function startTunnel() {
  console.log('🌐 Membuka Public Cloud HTTPS Tunnel via localtunnel...');
  try {
    const tunnel = await localtunnel({
      port: config.PORT,
      subdomain: `tanpilan-${Math.floor(1000 + Math.random() * 9000)}`
    });

    console.log('\n=============================================================');
    console.log('🚀 APLIKASI TANPILAN SIAP DIGUNAKAN DI SELURUH DUNIA (INTERNET)');
    console.log('=============================================================');
    console.log(`🔗 Public HTTPS URL: ${tunnel.url}`);
    console.log(`📱 Buka link ini di HP Anda & HP Pasangan via browser / WhatsApp!`);
    console.log('=============================================================\n');

    tunnel.on('close', () => {
      console.log('Tunnel ditutup.');
    });

    tunnel.on('error', (err) => {
      console.error('Tunnel error:', err.message);
    });
  } catch (err) {
    console.error('Gagal membuka tunnel:', err.message);
  }
}

startTunnel();
