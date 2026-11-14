const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'simulator', 'DualDeviceSimulator.html');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add CSS for simulator floating heart
const simHeartCss = `
    .sim-floating-heart {
      position: absolute;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 32px;
      pointer-events: none;
      animation: simHeartUp 2s ease-out forwards;
      z-index: 999;
      filter: drop-shadow(0 2px 8px rgba(244,63,94,0.6));
    }
    @keyframes simHeartUp {
      0% { transform: translateX(-50%) translateY(0) scale(0.6); opacity: 0; }
      20% { opacity: 1; transform: translateX(-50%) translateY(-30px) scale(1.3); }
      100% { transform: translateX(-50%) translateY(-190px) scale(0.9); opacity: 0; }
    }
  </style>`;

content = content.replace('  </style>', simHeartCss);

// 2. Update Header Mode text
content = content.replace(
  'Mode: Manual Refresh (Kuasa Anda)',
  'Mode: Pembaruan Otomatis (10 Detik)'
);

// 3. Update buttons in Lili and Rudi cards
content = content.replace(
  '<button class="m-btn" style="background:#0284C7; color:#fff;" onclick="manualRefreshSimulator(\'lili\')"><app-icon name="refresh" size="12" style="margin-right:4px;"></app-icon> Refresh</button>',
  '<button class="m-btn" style="background:rgba(236,72,153,0.2); color:#EC4899; border:1px solid rgba(236,72,153,0.5);" onclick="simulatorSendPoke(\'lili\')"><app-icon name="heart" size="12" style="margin-right:4px;"></app-icon> Ping Sayang ❤️</button>'
);

content = content.replace(
  '<button class="m-btn" style="background:#EC4899; color:#fff;" onclick="manualRefreshSimulator(\'rudi\')"><app-icon name="refresh" size="12" style="margin-right:4px;"></app-icon> Refresh</button>',
  '<button class="m-btn" style="background:rgba(56,189,248,0.2); color:#38BDF8; border:1px solid rgba(56,189,248,0.5);" onclick="simulatorSendPoke(\'rudi\')"><app-icon name="heart" size="12" style="margin-right:4px;"></app-icon> Ping Sayang ❤️</button>'
);

// 4. Update WS message listeners for poke
content = content.replace(
  "if (msg.event === 'partner_location_update') {\n            log(`[Wanita Menerima Posisi Pria]: Lat=${msg.data.location.latitude.toFixed(4)}, Jarak=${msg.data.distanceFormatted}`);\n          }",
  `if (msg.event === 'partner_location_update') {
            log(\`[Wanita Menerima Posisi Pria]: Lat=\${msg.data.location.latitude.toFixed(4)}, Jarak=\${msg.data.distanceFormatted}\`);
          } else if (msg.event === 'partner_poke_received') {
            log(\`❤️ [Wanita Menerima Sentuhan]: \${msg.data.senderName} mengirim getaran cinta!\`, 'highlight');
            showSimulatorHeart('lili');
          }`
);

content = content.replace(
  "if (msg.event === 'partner_location_update') {\n            log(`[Pria Menerima Posisi Wanita]: Lat=${msg.data.location.latitude.toFixed(4)}, Jarak=${msg.data.distanceFormatted}`);\n          }",
  `if (msg.event === 'partner_location_update') {
            log(\`[Pria Menerima Posisi Wanita]: Lat=\${msg.data.location.latitude.toFixed(4)}, Jarak=\${msg.data.distanceFormatted}\`);
          } else if (msg.event === 'partner_poke_received') {
            log(\`❤️ [Pria Menerima Sentuhan]: \${msg.data.senderName} mengirim getaran cinta!\`, 'highlight');
            showSimulatorHeart('rudi');
          }`
);

// 5. Add simulatorSendPoke and showSimulatorHeart before </script>
const simPokeFuncs = `
    function simulatorSendPoke(fromWho) {
      const dev = state[fromWho];
      if (dev && dev.ws && dev.ws.readyState === WebSocket.OPEN) {
        dev.ws.send(JSON.stringify({ event: 'send_poke', data: { type: 'heart' } }));
        log(\`❤️ [\${fromWho === 'lili' ? 'Wanita' : 'Pria'}] Mengirim getaran cinta ke pasangan.\`);
        showSimulatorHeart(fromWho);
      } else {
        log('WebSocket belum terhubung. Harap klik Pasangkan Perangkat terlebih dahulu.', 'highlight');
      }
    }

    function showSimulatorHeart(who) {
      const container = who === 'lili' ? document.getElementById('mapLili') : document.getElementById('mapRudi');
      if (!container) return;
      const heart = document.createElement('div');
      heart.className = 'sim-floating-heart';
      heart.textContent = '❤️';
      container.appendChild(heart);
      setTimeout(() => heart.remove(), 2100);
    }
`;

content = content.replace('  </script>', simPokeFuncs + '\n  </script>');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated DualDeviceSimulator.html');
