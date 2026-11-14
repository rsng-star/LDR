const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'backend', 'public', 'index.html');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Update appState with new tracking properties
if (!content.includes('selectedPlaceSource')) {
  content = content.replace(
    'gpsIntervalId: null\n    };',
    `gpsIntervalId: null,
      selectedPlaceSource: 'partner',
      currentGpsInterval: 10000,
      gpsSamples: [],
      stationarySince: null,
      partnerMatchedPlace: null
    };`
  );
}

// 2. Call evaluateAdaptiveGps inside handleGpsSuccess
if (!content.includes('evaluateAdaptiveGps(pos);')) {
  content = content.replace(
    'transmitLocation();',
    'transmitLocation();\n      evaluateAdaptiveGps(pos);'
  );
}

// 3. Add partner_poke_received to WebSocket onmessage
if (!content.includes('partner_poke_received')) {
  content = content.replace(
    "if (msg.event === 'partner_location_update') {\n            onPartnerLocationUpdate(msg.data);",
    "if (msg.event === 'partner_location_update') {\n            onPartnerLocationUpdate(msg.data);\n          } else if (msg.event === 'partner_poke_received') {\n            onPartnerPokeReceived(msg.data);"
  );
}

// 4. Update onPartnerLocationUpdate to handle matchedPlace and quality badge
const placeHandling = `
      // Fitur 5: Update Matched Place Badge (Geofencing)
      const placeBadge = document.getElementById('partnerPlaceBadge');
      const cardPlaceVal = document.getElementById('cardPlaceVal');
      if (data.matchedPlace) {
        appState.partnerMatchedPlace = data.matchedPlace;
        if (placeBadge) {
          placeBadge.style.display = 'inline-flex';
          placeBadge.innerHTML = \`\${AppIcons.get('home', { size: 12, color: '#10B981' })} \${data.matchedPlace.name}\`;
        }
        if (cardPlaceVal) cardPlaceVal.textContent = data.matchedPlace.name;
      } else {
        appState.partnerMatchedPlace = null;
        if (placeBadge) {
          if (speedKmH > 5) {
            placeBadge.style.display = 'inline-flex';
            placeBadge.innerHTML = \`\${AppIcons.get('car', { size: 12, color: '#38BDF8' })} Di Perjalanan\`;
            placeBadge.style.borderColor = 'rgba(56, 189, 248, 0.4)';
            placeBadge.style.color = '#38BDF8';
            placeBadge.style.background = 'rgba(56, 189, 248, 0.15)';
          } else {
            placeBadge.style.display = 'none';
          }
        }
        if (cardPlaceVal) cardPlaceVal.textContent = '+ Tandai Tempat';
      }

      // Fitur 2: Update Signal Quality Telemetry
      const accVal = Math.round(data.location.accuracy || 5);
      const accCard = document.getElementById('cardAccuracyVal');
      if (accCard) {
        if (accVal <= 10) {
          accCard.innerHTML = \`<span style="color:#10B981;">🛰️ Presisi (±\${accVal}m)</span>\`;
        } else if (accVal <= 35) {
          accCard.innerHTML = \`<span style="color:#38BDF8;">📡 Sinyal Baik (±\${accVal}m)</span>\`;
        } else {
          accCard.innerHTML = \`<span style="color:#F59E0B;">📶 Seluler (±\${accVal}m)</span>\`;
        }
      }
`;

if (!content.includes('Fitur 5: Update Matched Place Badge')) {
  content = content.replace(
    "resolvePartnerAddress(data.location.latitude, data.location.longitude);",
    "resolvePartnerAddress(data.location.latitude, data.location.longitude);\n" + placeHandling
  );
}

// 5. Update startTickerInterval for rich relative time
const richTicker = `
    function startTickerInterval() {
      setInterval(() => {
        if (appState.lastPartnerUpdate) {
          const diffSec = Math.round((new Date() - appState.lastPartnerUpdate) / 1000);
          const tickerEl = document.getElementById('partnerLastSeenTicker');
          if (tickerEl) {
            if (diffSec < 12) {
              tickerEl.innerHTML = '<span style="color:#10B981; font-weight:800;">● Baru saja (Aktif)</span>';
            } else if (diffSec < 60) {
              tickerEl.innerHTML = \`<span style="color:#38BDF8;">● \${diffSec}d lalu</span>\`;
            } else if (diffSec < 3600) {
              tickerEl.innerHTML = \`<span style="color:#F59E0B;">● \${Math.round(diffSec / 60)}m lalu</span>\`;
            } else {
              tickerEl.innerHTML = \`<span style="color:#94A3B8;">● \${Math.round(diffSec / 3600)}j lalu</span>\`;
            }
          }
        }
      }, 1000);
    }
`;

content = content.replace(
  /function startTickerInterval\(\) \{[\s\S]*?\}, 1000\);\s*\}/,
  richTicker.trim()
);

// 6. Update triggerHaptic to support 'heart'
content = content.replace(
  "else if (type === 'success') navigator.vibrate([30, 50, 30]);",
  "else if (type === 'success') navigator.vibrate([30, 50, 30]);\n        else if (type === 'heart') navigator.vibrate([120, 60, 120, 60, 180]);"
);

// 7. Update openHistoryModal and selectHistoryTarget to load Daily Summary
content = content.replace(
  "document.getElementById('historyModal').classList.add('active');\n      loadHistoryPoints();",
  "document.getElementById('historyModal').classList.add('active');\n      loadHistoryPoints();\n      loadDailySummary(activeHistoryTarget);"
);

content = content.replace(
  "loadHistoryPoints();\n    }",
  "loadHistoryPoints();\n      loadDailySummary(activeHistoryTarget);\n    }"
);

// 8. Add all new feature handlers before </script>
const newFunctionsBlock = `
    // ===== FITUR 1: NAVIGASI CEPAT (GOOGLE MAPS & WAZE) =====
    function openNavigationModal() {
      triggerHaptic('light');
      if (!appState.partnerCoords) {
        alert('Lokasi pasangan belum tersedia. Tunggu pasangan mengirimkan koordinat.');
        return;
      }
      document.getElementById('navigationModal').classList.add('active');
    }

    function openDirectGoogleMaps() {
      triggerHaptic('light');
      if (appState.partnerCoords) {
        const url = \`https://www.google.com/maps/dir/?api=1&destination=\${appState.partnerCoords.latitude},\${appState.partnerCoords.longitude}\`;
        window.open(url, '_blank');
        closeModal('navigationModal');
      }
    }

    function openDirectWaze() {
      triggerHaptic('light');
      if (appState.partnerCoords) {
        const url = \`https://waze.com/ul?ll=\${appState.partnerCoords.latitude},\${appState.partnerCoords.longitude}&navigate=yes\`;
        window.open(url, '_blank');
        closeModal('navigationModal');
      }
    }

    function copyPartnerCoordsModal() {
      copyPartnerCoords();
      closeModal('navigationModal');
    }

    // ===== FITUR 3: PING CINTA / HAPTIC POKE (GETAR LEMBUT & REAKSI CEPAT) =====
    function sendLovePoke(type = 'heart') {
      triggerHaptic('light');
      spawnFloatingHearts(4);
      if (appState.ws && appState.ws.readyState === WebSocket.OPEN) {
        appState.ws.send(JSON.stringify({
          event: 'send_poke',
          data: { type }
        }));
      }
      showToast('❤️ Getar cinta terkirim ke pasangan!');
    }

    function onPartnerPokeReceived(data) {
      triggerHaptic('heart');
      spawnFloatingHearts(8);
      const name = data.senderName || 'Pasangan Anda';
      showToast(\`❤️ \${name} mengirimkan getaran cinta!\`);
    }

    function spawnFloatingHearts(count = 5) {
      const emojis = ['❤️', '💖', '💕', '🥰', '✨'];
      for (let i = 0; i < count; i++) {
        const heart = document.createElement('div');
        heart.className = 'floating-heart';
        heart.textContent = emojis[Math.floor(Math.random() * emojis.length)];
        heart.style.left = \`\${Math.random() * 80 + 10}vw\`;
        heart.style.animationDelay = \`\${i * 0.15}s\`;
        document.body.appendChild(heart);
        setTimeout(() => heart.remove(), 2900);
      }
    }

    function showToast(msg) {
      let toast = document.getElementById('appToast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'appToast';
        toast.className = 'app-toast';
        document.body.appendChild(toast);
      }
      toast.textContent = msg;
      toast.classList.add('active');
      clearTimeout(toast._timeout);
      toast._timeout = setTimeout(() => toast.classList.remove('active'), 3200);
    }

    // ===== FITUR 4: ADAPTIVE GPS (SMART POWER SAVER) =====
    function evaluateAdaptiveGps(pos) {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const speedKmH = (pos.coords.speed || 0) * 3.6;
      const now = Date.now();

      if (!appState.gpsSamples) appState.gpsSamples = [];
      appState.gpsSamples.push({ lat, lng, speed: speedKmH, time: now });
      if (appState.gpsSamples.length > 5) appState.gpsSamples.shift();

      if (appState.gpsSamples.length >= 3) {
        const first = appState.gpsSamples[0];
        const distMoved = calculateSimpleDistance(first.lat, first.lng, lat, lng);
        const maxSpeed = Math.max(...appState.gpsSamples.map(s => s.speed));

        // Jika diam (kecepatan < 1.2 km/h dan pergeseran < 15m)
        if (maxSpeed < 1.2 && distMoved < 15) {
          if (!appState.stationarySince) appState.stationarySince = now;
          const stationarySeconds = (now - appState.stationarySince) / 1000;

          // Diam lebih dari 90 detik -> Masuki Mode Hemat Daya 45 detik
          if (stationarySeconds >= 90 && appState.currentGpsInterval !== 45000) {
            updateGpsLoopInterval(45000);
            updateGpsModePill('hemat');
          }
        } else {
          // Bergerak! Segera kembalikan ke mode responsif 10 detik
          appState.stationarySince = null;
          if (appState.currentGpsInterval !== 10000) {
            updateGpsLoopInterval(10000);
            updateGpsModePill('aktif');
          }
        }
      }
    }

    function calculateSimpleDistance(lat1, lon1, lat2, lon2) {
      const dLat = (lat2 - lat1) * 111320;
      const dLon = (lon2 - lon1) * 111320 * Math.cos(lat1 * Math.PI / 180);
      return Math.sqrt(dLat * dLat + dLon * dLon);
    }

    function updateGpsLoopInterval(ms) {
      appState.currentGpsInterval = ms;
      if (appState.gpsIntervalId) clearInterval(appState.gpsIntervalId);
      appState.gpsIntervalId = setInterval(transmitLocation, ms);
    }

    function updateGpsModePill(mode) {
      const pill = document.getElementById('pillGpsMode');
      if (!pill) return;
      if (mode === 'hemat') {
        pill.innerHTML = \`<app-icon name="lightning" size="14" color="#10B981"></app-icon><span style="color:#10B981;">🍃 Siaga (45s)</span>\`;
        pill.title = 'Mode Hemat Daya Aktif (Perangkat sedang diam)';
      } else {
        pill.innerHTML = \`<app-icon name="lightning" size="14" color="#38BDF8"></app-icon><span style="color:#38BDF8;">⚡ 10s Aktif</span>\`;
        pill.title = 'Mode Pelacakan Realtime 10 Detik';
      }
    }

    // ===== FITUR 5: TEMPAT FAVORIT & GEOFENCING =====
    function openPlacesModal() {
      triggerHaptic('light');
      document.getElementById('placesModal').classList.add('active');
      loadSavedPlaces();
    }

    function setPlaceSource(source) {
      triggerHaptic('light');
      appState.selectedPlaceSource = source;
      document.getElementById('btnPlaceSourcePartner').classList.toggle('is-active', source === 'partner');
      document.getElementById('btnPlaceSourceMe').classList.toggle('is-active', source === 'me');
    }

    async function loadSavedPlaces() {
      const listEl = document.getElementById('savedPlacesList');
      const countEl = document.getElementById('savedPlacesCount');
      listEl.innerHTML = '<div style="text-align:center; padding:12px; color:var(--text-muted); font-size:12px;">Memuat data tempat...</div>';

      if (!appState.device) return;

      try {
        const res = await fetch('/api/places', {
          headers: { 'X-Device-Token': appState.device.device_token }
        }).then(r => r.json());

        const places = res.places || [];
        countEl.textContent = \`\${places.length} Tempat\`;

        if (places.length === 0) {
          listEl.innerHTML = '<div style="text-align:center; padding:16px; color:var(--text-muted); font-size:12px;">Belum ada tempat favorit tersimpan.</div>';
          return;
        }

        listEl.innerHTML = places.map(p => \`
          <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 10px; border-bottom:1px solid rgba(255,255,255,0.06); font-size:12px;">
            <div>
              <div style="font-weight:700; color:#fff; display:flex; align-items:center; gap:6px;">
                \${AppIcons.get('home', { size: 14, color: '#10B981' })} \${p.name}
              </div>
              <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">
                Radius \${p.radius_meters}m • (\${p.latitude.toFixed(4)}, \${p.longitude.toFixed(4)})
              </div>
            </div>
            <button onclick="deletePlace(\${p.id})" style="background:transparent; border:none; color:#EF4444; padding:6px; cursor:pointer;" title="Hapus tempat">
              \${AppIcons.get('trash', { size: 14 })}
            </button>
          </div>
        \`).join('');
      } catch (err) {
        listEl.innerHTML = \`<div style="text-align:center; padding:12px; color:#EF4444; font-size:12px;">Gagal: \${err.message}</div>\`;
      }
    }

    async function saveNewPlace() {
      const nameInput = document.getElementById('newPlaceNameInput');
      const name = nameInput.value.trim();
      if (!name) {
        alert('Harap masukkan nama tempat.');
        return;
      }

      let targetCoords = appState.selectedPlaceSource === 'partner' ? appState.partnerCoords : appState.myCoords;
      if (!targetCoords) {
        alert('Koordinat belum tersedia. Pastikan sinyal GPS aktif.');
        return;
      }

      try {
        const res = await fetch('/api/places', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Device-Token': appState.device.device_token
          },
          body: JSON.stringify({
            name,
            latitude: targetCoords.latitude,
            longitude: targetCoords.longitude,
            radiusMeters: 100,
            icon: 'home'
          })
        }).then(r => r.json());

        if (res.place) {
          triggerHaptic('success');
          showToast(\`🏠 Tempat "\${name}" berhasil disimpan!\`);
          nameInput.value = '';
          loadSavedPlaces();
        } else {
          alert(res.error || 'Gagal menyimpan tempat');
        }
      } catch (err) {
        alert('Terjadi kesalahan: ' + err.message);
      }
    }

    async function deletePlace(id) {
      if (!confirm('Hapus tempat favorit ini?')) return;
      try {
        await fetch(\`/api/places/\${id}\`, {
          method: 'DELETE',
          headers: { 'X-Device-Token': appState.device.device_token }
        });
        triggerHaptic('light');
        loadSavedPlaces();
        showToast('Tempat berhasil dihapus');
      } catch (err) {
        alert('Gagal menghapus: ' + err.message);
      }
    }

    // ===== FITUR 6: RINGKASAN PERJALANAN HARI INI =====
    async function loadDailySummary(target = 'partner') {
      const distEl = document.getElementById('summaryDailyDist');
      const timeEl = document.getElementById('summaryDailyTime');
      const ptsEl = document.getElementById('summaryDailyPoints');

      if (!appState.device) return;

      try {
        const res = await fetch(\`/api/location/daily-summary?target=\${target}\`, {
          headers: { 'X-Device-Token': appState.device.device_token }
        }).then(r => r.json());

        if (res && res.summary) {
          distEl.textContent = res.summary.totalDistanceFormatted || '0 m';
          timeEl.textContent = \`\${res.summary.activeMinutes} mnt\`;
          ptsEl.textContent = \`\${res.summary.pointsCount} titik\`;
        }
      } catch (e) {
        distEl.textContent = '-';
        timeEl.textContent = '-';
        ptsEl.textContent = '-';
      }
    }
`;

if (!content.includes('FITUR 1: NAVIGASI CEPAT')) {
  content = content.replace('  </script>', newFunctionsBlock + '\n  </script>');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully patched index.html with all 6 features!');
