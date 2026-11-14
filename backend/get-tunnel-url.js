// Helper untuk mendeteksi URL HTTPS Tunnel (Ngrok & Cloudflare) secara otomatis
async function getTunnelUrl() {
  for (let i = 0; i < 20; i++) {
    // 1. Cek Ngrok terlebih dahulu (Permanen)
    try {
      const res = await fetch('http://127.0.0.1:4040/api/tunnels');
      if (res.ok) {
        const data = await res.json();
        if (data.tunnels && data.tunnels.length > 0) {
          const publicUrl = data.tunnels[0].public_url;
          console.log('');
          console.log('=================================================================');
          console.log('  \x1b[32m✔ LINK HTTPS PERMANEN RESMI UNTUK HP (Buka di Chrome / Safari HP):\x1b[0m');
          console.log(`  \x1b[36m👉 ${publicUrl}\x1b[0m`);
          console.log('  \x1b[33m(Link ini tetap dan tidak akan pernah berubah selamanya!)\x1b[0m');
          console.log('=================================================================');
          console.log('');
          return;
        }
      }
    } catch (e) {
      // Ngrok belum siap, lanjut loop
    }

    // 2. Fallback cek Cloudflare jika ada
    try {
      const resCf = await fetch('http://127.0.0.1:20241/quicktunnel');
      if (resCf.ok) {
        const dataCf = await resCf.json();
        if (dataCf.hostname) {
          console.log('');
          console.log('=================================================================');
          console.log('  \x1b[32m✔ LINK HTTPS CLOUDFLARE UNTUK HP:\x1b[0m');
          console.log(`  \x1b[36m👉 https://${dataCf.hostname}\x1b[0m`);
          console.log('=================================================================');
          console.log('');
          return;
        }
      }
    } catch (e) { }

    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log('Tips: Cek URL di jendela terminal yang sedang berjalan.');
}

getTunnelUrl();
