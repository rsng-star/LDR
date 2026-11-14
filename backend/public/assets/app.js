// Helper Sanitasi Stored XSS (P0-2)
    function escapeHtml(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    // Aksesibilitas: Keyboard Focus Trap & Escape Handler
    window.addEventListener('keydown', (e) => {
      const activeModal = document.querySelector('.modal-overlay.active');
      if (!activeModal) return;

      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        if (activeModal.id) closeModal(activeModal.id);
        return;
      }

      if (e.key === 'Tab') {
        const focusables = Array.from(activeModal.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )).filter(el => !el.disabled && el.offsetParent !== null);

        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });

    // Enter & Space keyhandler untuk role="button"
    document.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.getAttribute('role') === 'button') {
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          e.target.click();
        }
      }
    });

    // Bypass ngrok free warning interstitial for all background AJAX/API requests
    const _origFetch = window.fetch;
    window.fetch = function(url, options = {}) {
      options.headers = options.headers || {};
      if (typeof options.headers.set === 'function') {
        options.headers.set('ngrok-skip-browser-warning', '69420');
      } else if (Array.isArray(options.headers)) {
        options.headers.push(['ngrok-skip-browser-warning', '69420']);
      } else {
        options.headers['ngrok-skip-browser-warning'] = '69420';
      }
      return _origFetch(url, options);
    };

    // State Aplikasi
    const appState = {
      user: null,
      device: null,
      partner: null,
      myCoords: { latitude: -7.8013885, longitude: 110.3647176, accuracy: 5, speed: 0 },
      myBattery: 90,
      myCharging: false,
      partnerCoords: null,
      partnerAddress: 'Belum terhubung',
      distanceMeters: null,
      ws: null,
      selectedRole: 'Wanita',
      mapStyleIndex: 0,
      lastPartnerUpdate: null,
      qrInstance: null,
      gpsIntervalId: null,
      selectedPlaceSource: 'partner',
      currentGpsInterval: 10000,
      gpsSamples: [],
      stationarySince: null,
      partnerMatchedPlace: null
    };

    let map, markerMe, markerPartner, polyline, accCircle;
    let baseTileLayer;
    let historyLayerGroup = null;
    let activeHistoryTarget = 'partner';
    let currentHistoryData = [];

    // K0-2: Pilihan Tampilan Peta diambil dari window.MAP_STYLES (Single Source of Truth)
    const MAP_STYLES = window.MAP_STYLES || [
      {
        name: 'Dark Mode',
        iconName: 'moon',
        url: 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png',
        subdomains: 'abcd',
        maxZoom: 19,
        className: '',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>'
      },
      {
        name: 'Satelit Nyata',
        iconName: 'satellite',
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        subdomains: 'abc',
        maxZoom: 19,
        className: '',
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
      },
      {
        name: 'Peta Terang',
        iconName: 'sun',
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        subdomains: 'abc',
        maxZoom: 19,
        className: '',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
      }
    ];

    window.onload = () => {
      initBatteryMonitoring();
      initMap();
      checkAuthSession();
      startTickerInterval();
      checkAutoPairParam();
      checkPwaDisplay();
      initWakeLock();

      const rail = document.getElementById('mapToolsRail');
      if (rail) {
        rail.classList.add('initial-hint');
        setTimeout(() => rail.classList.remove('initial-hint'), 3500);
      }
    };

    function initBatteryMonitoring() {
      if (navigator.getBattery) {
        navigator.getBattery().then(bat => {
          const update = () => {
            appState.myBattery = Math.round(bat.level * 100);
            appState.myCharging = bat.charging;
            const batEl = document.getElementById('setMyBattery');
            if (batEl) {
              const icon = AppIcons.get(bat.charging ? 'battery-charging' : 'battery', { size: 14 });
              batEl.innerHTML = `${icon} ${appState.myBattery}% ${bat.charging ? '(Mengisi Daya)' : ''}`;
            }
          };
          update();
          bat.addEventListener('levelchange', update);
          bat.addEventListener('chargingchange', update);
        }).catch(() => { });
      }
    }

    function initMap() {
      if (typeof L === 'undefined') {
        console.warn('Leaflet JS belum termuat. Cek koneksi internet untuk memuat peta.');
        return;
      }

      map = L.map('map', {
        zoomControl: false,
        attributionControl: true,
        preferCanvas: true
      }).setView([appState.myCoords.latitude, appState.myCoords.longitude], 16);
      baseTileLayer = L.tileLayer(MAP_STYLES[0].url, {
        maxZoom: MAP_STYLES[0].maxZoom,
        subdomains: MAP_STYLES[0].subdomains || 'abcd',
        attribution: MAP_STYLES[0].attribution,
        className: MAP_STYLES[0].className || ''
      }).addTo(map);

      // Icon Me (Titik Ink-Primary dengan Ring Putih 3px - U1-2)
      const iconMe = L.divIcon({
        className: 'radar-beacon',
        html: '<div class="beacon-ripple-me"></div><div class="beacon-core-me"></div>',
        iconSize: [52, 52],
        iconAnchor: [26, 26]
      });

      markerMe = L.marker([appState.myCoords.latitude, appState.myCoords.longitude], { icon: iconMe, draggable: false })
        .addTo(map).bindTooltip('Posisi Saya', { permanent: false, direction: 'top' });

      // Accuracy halo (Token ink-secondary, fill ink-muted - U1-1)
      accCircle = L.circle([appState.myCoords.latitude, appState.myCoords.longitude], {
        radius: 12,
        color: '#6E675F',
        weight: 1,
        dashArray: '3, 4',
        fillColor: '#857F74',
        fillOpacity: 0.08,
        className: 'acc-circle'
      }).addTo(map);

      // Connecting Polyline
      const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-terracotta').trim() || '#BF5129';
      polyline = L.polyline([], {
        color: accentColor,
        weight: 3.5,
        dashArray: '8, 12',
        opacity: 0.85
      }).addTo(map);

      // Layer Group untuk Riwayat Jejak (Breadcrumbs Trail)
      historyLayerGroup = L.layerGroup().addTo(map);

      // Pastikan Leaflet menghitung ulang ukuran kontainer pada layar HP
      setTimeout(() => { if (map) map.invalidateSize(); }, 300);
      setTimeout(() => { if (map) map.invalidateSize(); }, 1200);
      window.addEventListener('resize', () => { if (map) map.invalidateSize(); });
    }

    function cycleMapStyle() {
      triggerHaptic('light');
      appState.mapStyleIndex = (appState.mapStyleIndex + 1) % MAP_STYLES.length;
      const current = MAP_STYLES[appState.mapStyleIndex];

      map.removeLayer(baseTileLayer);
      baseTileLayer = L.tileLayer(current.url, {
        maxZoom: current.maxZoom,
        subdomains: current.subdomains || 'abcd',
        attribution: current.attribution,
        className: current.className || ''
      }).addTo(map);

      const fab = document.getElementById('fabLayerToggle');
      if (fab) fab.innerHTML = AppIcons.get(current.iconName, { size: 20 });
    }

    function toggleSheetExpand() {
      triggerHaptic('light');
      const sheet = document.getElementById('bottomPartnerSheet');
      const isExpanded = sheet.classList.toggle('expanded');
      const handle = document.querySelector('.sheet-handle-bar');
      if (handle) {
        handle.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
      }
      const rail = document.getElementById('mapToolsRail');
      if (rail) {
        if (isExpanded) {
          rail.classList.add('sheet-expanded');
        } else {
          rail.classList.remove('sheet-expanded');
        }
      }
    }

    function checkAuthSession() {
      const savedUser = localStorage.getItem('tanpilan_user');
      const savedDev = localStorage.getItem('tanpilan_device');

      if (savedUser && savedDev) {
        appState.user = JSON.parse(savedUser);
        appState.device = JSON.parse(savedDev);
        onSessionReady();
      } else {
        document.getElementById('onboardingModal').classList.add('active');
      }
    }

    function chooseRole(role) {
      triggerHaptic('light');
      appState.selectedRole = role;
      document.getElementById('roleSelectWanita').classList.toggle('active', role === 'Wanita');
      document.getElementById('roleSelectPria').classList.toggle('active', role === 'Pria');
    }

    async function finishOnboarding() {
      const custom = document.getElementById('customNameInput').value.trim();
      const chosen = custom || appState.selectedRole;
      const randBytes = new Uint8Array(12);
      crypto.getRandomValues(randBytes);
      const randSuffix = Array.from(randBytes, b => b.toString(16).padStart(2, '0')).join('');
      const email = `${chosen.toLowerCase().replace(/[^a-z0-9]/g, '')}_${randSuffix.slice(0, 8)}@tanpilan.local`;
      const pwdBytes = new Uint8Array(24);
      crypto.getRandomValues(pwdBytes);
      const randomPassword = Array.from(pwdBytes, b => b.toString(16).padStart(2, '0')).join('');

      try {
        const authRes = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: randomPassword })
        }).then(r => r.json());

        if (!authRes.token) throw new Error(authRes.error || 'Gagal registrasi akun');

        // P0-1: Token dibuat SERVER crypto.randomBytes, klien tidak lagi memilih token
        const devRes = await fetch('/api/device/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authRes.token}` },
          body: JSON.stringify({ deviceName: `HP ${chosen}` })
        }).then(r => r.json());

        if (!devRes.device) throw new Error(devRes.error || 'Gagal mendaftarkan perangkat');

        appState.user = authRes.user;
        appState.user.token = authRes.token;
        appState.device = devRes.device;

        localStorage.setItem('tanpilan_user', JSON.stringify(appState.user));
        localStorage.setItem('tanpilan_device', JSON.stringify(appState.device));

        document.getElementById('onboardingModal').classList.remove('active');
        onSessionReady();
      } catch (err) {
        alert('Gagal registrasi: ' + err.message);
      }
    }

    function onSessionReady() {
      document.getElementById('hudDeviceName').textContent = appState.device.device_name;
      document.getElementById('setDevName').textContent = appState.device.device_name;
      document.getElementById('setDevId').textContent = `#${appState.device.id}`;

      setTimeout(() => {
        if (map) map.invalidateSize();
      }, 200);

      initWebSocket();
      startGpsTracking();
      loadPartnerTelemetry();
      generatePairingCode();
    }

    function startGpsTracking() {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(handleGpsSuccess, handleGpsError, { enableHighAccuracy: true });

        navigator.geolocation.watchPosition(
          handleGpsSuccess,
          handleGpsError,
          { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
        );
      }

      // Loop Transmisi GPS Otomatis Setiap 10 Detik (Sesuai Kebutuhan Sistem)
      if (appState.gpsIntervalId) clearInterval(appState.gpsIntervalId);
      appState.gpsIntervalId = setInterval(transmitLocation, 10000);
    }

    let isFirstCentered = false;

    function handleGpsSuccess(pos) {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const acc = Math.round(pos.coords.accuracy || 0);
      const speed = pos.coords.speed || 0;

      appState.myCoords = { latitude: lat, longitude: lng, accuracy: acc, speed };

      markerMe.setLatLng([lat, lng]);
      accCircle.setLatLng([lat, lng]);

      // U0-6: Lingkaran akurasi disembunyikan/dibatasi jika akurasi kasar > 100m
      if (acc > 100) {
        accCircle.setStyle({ opacity: 0, fillOpacity: 0 });
      } else {
        accCircle.setStyle({ opacity: 0.6, fillOpacity: 0.08 });
        accCircle.setRadius(acc || 12);
      }

      if (!isFirstCentered) {
        map.setView([lat, lng], 17);
        isFirstCentered = true;
      }

      updatePolyline();
      transmitLocation();
      evaluateAdaptiveGps(pos);

      // U0-6: Tingkat akurasi GPS realistis tanpa jargon satelit
      const subStatus = document.getElementById('hudSubStatus');
      if (subStatus) {
        if (acc <= 20) {
          subStatus.innerHTML = `<span class="substatus-pill status-live">${AppIcons.get('lock', { size: 12 })} GPS presisi (±${acc}m)</span>`;
        } else if (acc <= 100) {
          subStatus.innerHTML = `<span class="substatus-pill status-standby">${AppIcons.get('satellite', { size: 12 })} Perkiraan lokasi (±${acc}m)</span>`;
        } else {
          subStatus.innerHTML = `<span class="substatus-pill status-offline">${AppIcons.get('alert', { size: 12 })} Lokasi kasar (±${acc}m)</span>`;
        }
      }
    }

    function handleGpsError(err) {
      console.warn('GPS Info:', err.message);
      const subStatus = document.getElementById('hudSubStatus');
      if (subStatus) {
        subStatus.innerHTML = `<span class="substatus-pill status-standby">${AppIcons.get('alert', { size: 12 })} Menunggu Izin GPS...</span>`;
      }
    }

    async function transmitLocation() {
      if (!appState.device) return;

      const payload = {
        latitude: appState.myCoords.latitude,
        longitude: appState.myCoords.longitude,
        accuracy: appState.myCoords.accuracy || 5,
        speed: appState.myCoords.speed || 0,
        battery: appState.myBattery || 90
      };

      if (appState.ws && appState.ws.readyState === WebSocket.OPEN) {
        appState.ws.send(JSON.stringify({ event: 'location_update', data: payload }));
      } else {
        fetch('/api/location/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Device-Token': appState.device.device_token },
          body: JSON.stringify(payload)
        }).catch(() => { });
      }
    }

    // U0-2: State reconnect & banner debounce
    let disconnectBannerTimer = null;
    let reconnectTimer = null;
    let reconnectAttempts = 0;

    function initWebSocket() {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (appState.ws && (appState.ws.readyState === WebSocket.OPEN || appState.ws.readyState === WebSocket.CONNECTING)) {
        return;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      try {
        appState.ws = new WebSocket(wsUrl);
      } catch (e) {
        scheduleWsReconnect();
        return;
      }

      appState.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.event === 'authenticated') {
            // U0-2: Banner hilang saat event 'authenticated' diterima
            if (disconnectBannerTimer) {
              clearTimeout(disconnectBannerTimer);
              disconnectBannerTimer = null;
            }
            reconnectAttempts = 0;
            const banner = document.getElementById('connectionBanner');
            if (banner) banner.classList.remove('is-active');
            document.body.classList.remove('is-reconnecting');
            const dot = document.querySelector('.brand-dot');
            if (dot) dot.className = 'brand-dot status-live';
            updateConnectionStateHUD();
          } else if (msg.event === 'partner_location_update') {
            onPartnerLocationUpdate(msg.data);
          } else if (msg.event === 'partner_poke_received') {
            onPartnerPokeReceived(msg.data);
          } else if (msg.event === 'partner_status') {
            if (appState.partner) {
              appState.partner.isOnline = Boolean(msg.data.isOnline);
              appState.partner.lastSeen = msg.data.lastSeen;
            }
            updateConnectionStateHUD();
          } else if (msg.event === 'pairing_success') {
            triggerHaptic('success');
            showToast(msg.data.message || 'Perangkat berhasil terhubung!', 'heart');
            loadPartnerTelemetry();
          }
        } catch (e) { }
      };

      appState.ws.onopen = () => {
        if (appState.device && appState.device.device_token) {
          appState.ws.send(JSON.stringify({
            event: 'auth',
            data: { deviceToken: appState.device.device_token }
          }));
        }
        updateConnectionStateHUD();
        updateSharingConsentUI();
      };

      appState.ws.onclose = () => {
        // U0-2: Debounce 4 detik sebelum banner tampil agar tidak berkedip
        if (!disconnectBannerTimer) {
          disconnectBannerTimer = setTimeout(() => {
            const banner = document.getElementById('connectionBanner');
            if (banner) banner.classList.add('is-active');
            document.body.classList.add('is-reconnecting');
            const dot = document.querySelector('.brand-dot');
            if (dot) dot.className = 'brand-dot status-standby';
            updateConnectionStateHUD();
          }, 4000);
        }
        scheduleWsReconnect();
      };

      appState.ws.onerror = () => {
        // Penanganan dilakukan via onclose
      };
    }

    function scheduleWsReconnect() {
      if (reconnectTimer) return;
      const delay = Math.min(30000, (Math.pow(2, reconnectAttempts) * 1000) + Math.round(Math.random() * 800));
      reconnectAttempts++;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        initWebSocket();
      }, delay);
    }

    function onPartnerLocationUpdate(data) {
      appState.lastPartnerUpdate = new Date();
      appState.partnerCoords = { latitude: data.location.latitude, longitude: data.location.longitude };
      appState.distanceMeters = data.distanceToPartner;

      // Update Icon Partner with clean vector asset
      if (!markerPartner) {
        const iconPartner = L.divIcon({
          className: 'radar-beacon',
          html: '<div class="beacon-ripple-partner"></div><div class="beacon-core-partner">' + AppIcons.get('heart', { size: 14, color: '#FFFFFF' }) + '</div>',
          iconSize: [58, 58],
          iconAnchor: [29, 29]
        });
        markerPartner = L.marker([data.location.latitude, data.location.longitude], { icon: iconPartner, draggable: false })
          .addTo(map).bindTooltip(data.deviceName || 'Pasangan', { permanent: false, direction: 'top' });
      } else {
        markerPartner.setLatLng([data.location.latitude, data.location.longitude]);
      }

      updatePolyline();

      // UI Distance HUD
      updateConnectionStateHUD();

      // Compass & Direction Calculation
      const bearing = calculateBearing(
        appState.myCoords.latitude, appState.myCoords.longitude,
        data.location.latitude, data.location.longitude
      );
      const compassText = getCompassDirection(bearing);
      const compassEl = document.getElementById('floatingCompassBearing');
      if (compassEl) {
        compassEl.innerHTML = `${AppIcons.get('compass', { size: 13, style: 'margin-right:4px;' })} Menuju ${compassText} (${bearing}°)`;
      }
      document.getElementById('cardCompassVal').textContent = `${compassText} (${bearing}°)`;

      // Partner Status Pill: Battery & Activity
      const speedKmH = Math.round((data.location.speed || 0) * 3.6);
      let activityIcon = 'stop';
      let activityLabel = 'Diam';
      if (speedKmH > 25) {
        activityIcon = 'car';
        activityLabel = `Mobil/Motor ${speedKmH} km/h`;
      } else if (speedKmH > 7) {
        activityIcon = 'bike';
        activityLabel = `Bergerak ${speedKmH} km/h`;
      } else if (speedKmH > 2) {
        activityIcon = 'walk';
        activityLabel = `Jalan Kaki ${speedKmH} km/h`;
      }

      const batPercent = data.battery || 90;
      document.getElementById('pillBattery').innerHTML = `${AppIcons.get('battery', { size: 14 })} <span>${batPercent}%</span>`;
      document.getElementById('pillActivity').innerHTML = `${AppIcons.get(activityIcon, { size: 14 })} <span>${activityLabel}</span>`;
      document.getElementById('sheetPartnerTitle').textContent = data.deviceName || 'Pasangan';

      // Partner Connection Status Badge
      const proxBadge = document.getElementById('partnerProximityBadge');
      if (proxBadge && data.distanceToPartner !== null) {
        proxBadge.innerHTML = '<span class="status-indicator-dot online"></span> Terhubung Realtime';
        proxBadge.className = 'proximity-badge status-live';
      }

      // Telemetry Cards: Real data only, no fake default (U0-5, U0-6)
      const rawAcc = data.location.accuracy;
      const accVal = rawAcc ? Math.round(rawAcc) : null;
      document.getElementById('cardCoordsVal').textContent = `${data.location.latitude.toFixed(5)}, ${data.location.longitude.toFixed(5)}`;

      // Reverse geocode address
      resolvePartnerAddress(data.location.latitude, data.location.longitude);

      // Fitur 5: Update Matched Place Badge (Geofencing)
      const placeBadge = document.getElementById('partnerPlaceBadge');
      const cardPlaceVal = document.getElementById('cardPlaceVal');
      if (data.matchedPlace) {
        appState.partnerMatchedPlace = data.matchedPlace;
        if (placeBadge) {
          placeBadge.style.display = 'inline-flex';
          placeBadge.className = 'place-badge is-live';
          placeBadge.innerHTML = `${AppIcons.get('home', { size: 12 })} <span>${escapeHtml(data.matchedPlace.name)}</span>`;
        }
        if (cardPlaceVal) cardPlaceVal.textContent = data.matchedPlace.name;
      } else {
        appState.partnerMatchedPlace = null;
        if (placeBadge) {
          if (speedKmH > 5) {
            placeBadge.style.display = 'inline-flex';
            placeBadge.className = 'place-badge is-transit';
            placeBadge.innerHTML = `${AppIcons.get('car', { size: 12 })} Di Perjalanan`;
          } else {
            placeBadge.style.display = 'none';
          }
        }
        if (cardPlaceVal) cardPlaceVal.textContent = '+ Tandai Tempat';
      }

      // Fitur 2: Update Signal Quality Telemetry (U0-6)
      const accCard = document.getElementById('cardAccuracyVal');
      if (accCard) {
        if (!accVal) {
          accCard.textContent = '-';
        } else if (accVal <= 20) {
          accCard.innerHTML = `<span class="telemetry-status is-live">${AppIcons.get('satellite', { size: 13 })} Presisi (±${accVal}m)</span>`;
        } else if (accVal <= 100) {
          accCard.innerHTML = `<span class="telemetry-status is-standby">${AppIcons.get('satellite', { size: 13 })} Perkiraan (±${accVal}m)</span>`;
        } else {
          accCard.innerHTML = `<span class="telemetry-status is-offline">${AppIcons.get('satellite', { size: 13 })} Kasar (±${accVal}m)</span>`;
        }
      }

    }

    function calculateBearing(lat1, lon1, lat2, lon2) {
      const y = Math.sin((lon2 - lon1) * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180);
      const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
        Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos((lon2 - lon1) * Math.PI / 180);
      const θ = Math.atan2(y, x);
      const brng = (θ * 180 / Math.PI + 360) % 360;
      return Math.round(brng);
    }

    function getCompassDirection(deg) {
      const directions = ['Utara', 'Timur Laut', 'Timur', 'Tenggara', 'Selatan', 'Barat Daya', 'Barat', 'Barat Laut'];
      return directions[Math.round(deg / 45) % 8];
    }

    async function resolvePartnerAddress(lat, lng) {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`).then(r => r.json());
        if (res && res.display_name) {
          const parts = res.display_name.split(', ');
          const shortAddress = parts.slice(0, 3).join(', ');
          document.getElementById('partnerAddressLabel').textContent = shortAddress;
          appState.partnerAddress = shortAddress;
        }
      } catch (e) {
        document.getElementById('partnerAddressLabel').textContent = `Koordinat: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      }
    }

    function updatePolyline() {
      if (appState.partnerCoords) {
        polyline.setLatLngs([
          [appState.myCoords.latitude, appState.myCoords.longitude],
          [appState.partnerCoords.latitude, appState.partnerCoords.longitude]
        ]);
      }
    }

    function formatDist(meters) {
      if (!meters && meters !== 0) return 'Menghubungkan...';
      if (meters < 1000) return `${Math.round(meters)} m`;
      return `${(meters / 1000).toFixed(1)} km`;
    }

    async function loadPartnerTelemetry() {
      if (!appState.device) return;
      try {
        const res = await fetch('/api/location/latest', {
          headers: { 'X-Device-Token': appState.device.device_token }
        }).then(r => r.json());

        if (res.partnerDevice && res.partnerDevice.location) {
          onPartnerLocationUpdate({
            location: res.partnerDevice.location,
            distanceToPartner: res.distance,
            distanceFormatted: res.distanceFormatted,
            deviceName: res.partnerDevice.name,
            battery: res.partnerDevice.battery,
            matchedPlace: res.partnerDevice.place
          });
        }
      } catch (e) { }
    }

    function focusMe() {
      triggerHaptic('light');
      map.flyTo([appState.myCoords.latitude, appState.myCoords.longitude], 17, { duration: 1 });
    }

    function focusPartner() {
      triggerHaptic('light');
      if (appState.partnerCoords) {
        map.flyTo([appState.partnerCoords.latitude, appState.partnerCoords.longitude], 17, { duration: 1 });
      } else {
        showToast('Belum ada data lokasi pasangan. Hubungkan via menu Pair.');
      }
    }

    function fitBoth() {
      triggerHaptic('light');
      if (appState.device && !appState.device.partner_device_id) {
        openPairModal();
        return;
      }
      if (appState.partnerCoords) {
        const bounds = L.latLngBounds([
          [appState.myCoords.latitude, appState.myCoords.longitude],
          [appState.partnerCoords.latitude, appState.partnerCoords.longitude]
        ]);
        map.fitBounds(bounds, { padding: [80, 80], maxZoom: 17 });
      } else {
        focusMe();
      }
    }

    function navigateToPartner() {
      triggerHaptic('light');
      if (appState.partnerCoords) {
        const url = `https://www.google.com/maps/dir/?api=1&destination=${appState.partnerCoords.latitude},${appState.partnerCoords.longitude}`;
        window.open(url, '_blank');
      } else {
        showToast('Lokasi pasangan belum tersedia.');
      }
    }

    function shareLiveTrackingWhatsApp() {
      triggerHaptic('light');
      const code = document.getElementById('myPairPinDisplay').textContent;
      const shareUrl = `${window.location.origin}/?pair=${code}`;
      const text = encodeURIComponent(
        `Hai! Buka link ini untuk memantau posisiku secara realtime tanpa batas jarak:\n${shareUrl}\n\nKode Pairing: ${code}`
      );
      window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
    }

    async function generatePairingCode() {
      if (!appState.user) return;
      try {
        const res = await fetch('/api/device/generate-code', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${appState.user.token}` }
        }).then(r => r.json());

        const code = res.code || '------';
        document.getElementById('myPairPinDisplay').textContent = code;

        // Render QR Code untuk Scan HP 1-Tap: ALWAYS Black on White with Quiet Zone (U0-1)
        const qrContainer = document.getElementById('pairingQrContainer');
        qrContainer.innerHTML = '';
        if (typeof QRCode !== 'undefined') {
          const directPairLink = `${window.location.origin}/?pair=${code}`;
          new QRCode(qrContainer, {
            text: directPairLink,
            width: 148,
            height: 148,
            colorDark: '#000000',
            colorLight: '#FFFFFF',
            correctLevel: QRCode.CorrectLevel.M
          });
        }
      } catch (e) { }
    }

    function copyPairCode() {
      triggerHaptic('light');
      const code = document.getElementById('myPairPinDisplay').textContent;
      navigator.clipboard.writeText(code);
      showToast(`Kode ${code} disalin ke clipboard!`);
    }

    function copyPartnerCoords() {
      triggerHaptic('light');
      if (!appState.partnerCoords) {
        showToast('Koordinat pasangan belum tersedia');
        return;
      }
      const text = document.getElementById('cardCoordsVal').textContent.trim();
      navigator.clipboard.writeText(text);
      showToast(`Koordinat ${text} berhasil disalin!`);
    }

    async function submitPairCode() {
      const code = document.getElementById('inputPartnerCode').value.trim().toUpperCase();
      if (!code || code.length !== 6) return showToast('Masukkan 6 karakter kode pairing');

      try {
        const res = await fetch('/api/device/pair', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${appState.user.token}` },
          body: JSON.stringify({ code })
        }).then(r => r.json());

        if (res.error) throw new Error(res.error);

        triggerHaptic('success');
        showToast('Sukses! Perangkat terhubung dengan pasangan.');
        closeModal('pairingModal');
        loadPartnerTelemetry();
      } catch (err) {
        showToast('Gagal: ' + err.message);
      }
    }

    function checkAutoPairParam() {
      const urlParams = new URLSearchParams(window.location.search);
      const pairParam = urlParams.get('pair');
      if (pairParam && pairParam.length === 6) {
        setTimeout(() => {
          if (confirm(`Pasangan Anda membagikan kode pairing: ${pairParam.toUpperCase()}.\nHubungkan sekarang?`)) {
            document.getElementById('inputPartnerCode').value = pairParam.toUpperCase();
            openPairModal();
            submitPairCode();
          }
        }, 1200);
      }
    }

    function triggerHaptic(type = 'light') {
      if (navigator.vibrate) {
        if (type === 'light') navigator.vibrate(20);
        else if (type === 'success') navigator.vibrate([30, 50, 30]);
        else if (type === 'heart') navigator.vibrate([120, 60, 120, 60, 180]);
        else if (type === 'alert') navigator.vibrate([80, 40, 80]);
      }
    }

    
    function updateConnectionStateHUD() {
      const hud = document.querySelector('.distance-floating-hud');
      const distEl = document.getElementById('floatingDistanceText');
      const compassEl = document.getElementById('floatingCompassBearing');
      const bottomSheet = document.getElementById('bottomPartnerSheet');
      const unpairedSheet = document.getElementById('sheetUnpairedContent');
      const pairedSheet = document.getElementById('sheetPairedContent');
      const rail = document.getElementById('mapToolsRail');
      const btnNav = document.getElementById('btnNavRoute');
      const btnPoke = document.getElementById('btnActionPoke');

      if (!hud || !distEl) return;

      hud.classList.remove('state-unpaired', 'state-connecting', 'state-connected', 'state-offline');

      // State 3: Belum dipasangkan (U0-5, K0-3: Jujur, tanpa angka/status palsu)
      if (appState.device && !appState.device.partner_device_id) {
        if (bottomSheet) bottomSheet.classList.add('is-unpaired');
        if (rail) rail.classList.add('is-unpaired-offset');
        hud.classList.add('state-unpaired');
        distEl.innerHTML = `${AppIcons.get('link', { size: 14 })} <span>Hubungkan Pasangan</span>`;
        if (compassEl) compassEl.style.display = 'none';

        if (unpairedSheet) unpairedSheet.style.display = 'flex';
        if (pairedSheet) pairedSheet.style.display = 'none';
        return;
      }

      // Jika sudah berpasangan
      if (bottomSheet) bottomSheet.classList.remove('is-unpaired');
      if (rail) rail.classList.remove('is-unpaired-offset');
      if (unpairedSheet) unpairedSheet.style.display = 'none';
      if (pairedSheet) pairedSheet.style.display = 'block';
      if (compassEl) compassEl.style.display = 'flex';

      // State 1: Menghubungkan (awal)
      if (!appState.partnerCoords) {
        hud.classList.add('state-connecting');
        distEl.innerHTML = '<span class="dist-connecting-spinner"></span><span>Menghubungkan…</span>';
        if (compassEl) {
          compassEl.className = 'floating-compass-pill';
          compassEl.innerHTML = '<span class="empty-state-text">Menunggu sinyal GPS pasangan…</span>';
        }
        if (btnNav) { btnNav.disabled = true; btnNav.classList.add('is-disabled'); btnNav.title = 'Menunggu lokasi pasangan'; }
        if (btnPoke) { btnPoke.disabled = true; btnPoke.classList.add('is-disabled'); btnPoke.title = 'Menunggu lokasi pasangan'; }
        return;
      }

      // Cek apakah pasangan offline (> 120 detik)
      const diffSec = appState.lastPartnerUpdate ? Math.round((Date.now() - appState.lastPartnerUpdate) / 1000) : 9999;
      if (diffSec > 120) {
        // State 4: Pasangan offline
        hud.classList.add('state-offline');
        distEl.textContent = formatDist(appState.distanceMeters);
        const mins = Math.max(1, Math.round(diffSec / 60));
        if (compassEl) {
          compassEl.className = 'floating-compass-pill';
          compassEl.innerHTML = `<span class="empty-state-text">Terakhir aktif ${mins}m lalu</span>`;
        }
        const proxBadge = document.getElementById('partnerProximityBadge');
        if (proxBadge) {
          proxBadge.innerHTML = '<span class="status-indicator-dot offline"></span> Offline';
          proxBadge.className = 'proximity-badge status-offline';
        }
        // Tombol aksi disable saat pasangan offline (U0-5)
        if (btnNav) { btnNav.disabled = true; btnNav.classList.add('is-disabled'); btnNav.title = 'Pasangan sedang offline'; }
        if (btnPoke) { btnPoke.disabled = true; btnPoke.classList.add('is-disabled'); btnPoke.title = 'Pasangan sedang offline'; }
      } else {
        // State 2: Terhubung live
        hud.classList.add('state-connected');
        distEl.textContent = formatDist(appState.distanceMeters);
        const proxBadge = document.getElementById('partnerProximityBadge');
        if (proxBadge) {
          proxBadge.innerHTML = '<span class="status-indicator-dot online"></span> Terhubung Realtime';
          proxBadge.className = 'proximity-badge status-live';
        }
        if (btnNav) { btnNav.disabled = false; btnNav.classList.remove('is-disabled'); btnNav.removeAttribute('title'); }
        if (btnPoke) { btnPoke.disabled = false; btnPoke.classList.remove('is-disabled'); btnPoke.removeAttribute('title'); }
      }
    }

    function startTickerInterval() {
      setInterval(() => {
        if (appState.lastPartnerUpdate) {
          const diffSec = Math.round((new Date() - appState.lastPartnerUpdate) / 1000);
          const tickerEl = document.getElementById('partnerLastSeenTicker');
          if (tickerEl) {
            if (diffSec < 60) {
              tickerEl.innerHTML = '<span class="ticker-dot live"></span>Baru saja';
            } else if (diffSec < 3600) {
              tickerEl.innerHTML = `<span class="ticker-dot standby"></span>${Math.round(diffSec / 60)}m lalu`;
            } else {
              tickerEl.innerHTML = `<span class="ticker-dot offline"></span>${Math.round(diffSec / 3600)}j lalu`;
            }
          }
        }
      }, 1000);
    }

    function checkPwaDisplay() {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
      if (!isStandalone) {
        document.getElementById('pwaBanner').classList.add('active');
      }
    }

    function showPwaInstructions() {
      document.getElementById('pwaGuideModal').classList.add('active');
    }

    function closePwaBanner() {
      document.getElementById('pwaBanner').classList.remove('active');
    }

    
    let lastFocusedElement = null;

    function openPairModal() {
      triggerHaptic('light');
      generatePairingCode();
      openModalWithFocus('pairingModal');
    }

    function openSettingsModal() {
      triggerHaptic('light');
      openModalWithFocus('settingsModal');
    }

    function openHistoryModal() {
      triggerHaptic('light');
      openModalWithFocus('historyModal');
      loadHistoryPoints();
      loadDailySummary(activeHistoryTarget);
    }

    function selectHistoryTarget(target) {
      triggerHaptic('light');
      activeHistoryTarget = target;
      const btnPartner = document.getElementById('histTargetPartner');
      const btnMe = document.getElementById('histTargetMe');
      if (btnPartner) {
        btnPartner.classList.toggle('is-active', target === 'partner');
        btnPartner.setAttribute('aria-selected', target === 'partner' ? 'true' : 'false');
      }
      if (btnMe) {
        btnMe.classList.toggle('is-active', target === 'me');
        btnMe.setAttribute('aria-selected', target === 'me' ? 'true' : 'false');
      }
      loadHistoryPoints();
      loadDailySummary(activeHistoryTarget);
    }

    async function loadHistoryPoints() {
      const listEl = document.getElementById('historyPointsList');
      const countEl = document.getElementById('histPointCount');
      listEl.innerHTML = '<div class="history-empty-message">Mengambil data...</div>';

      if (!appState.device) {
        listEl.innerHTML = '<div class="history-empty-message">Perangkat belum terhubung.</div>';
        return;
      }

      try {
        const queryTarget = activeHistoryTarget === 'partner' ? 'partner' : 'me';
        const res = await fetch(`/api/location/history?target=${queryTarget}&limit=40`, {
          headers: { 'X-Device-Token': appState.device.device_token }
        }).then(r => r.json());

        currentHistoryData = res.locations || [];
        countEl.textContent = `${currentHistoryData.length} Titik`;

        if (currentHistoryData.length === 0) {
          listEl.innerHTML = '<div class="history-empty-message">Belum ada riwayat jejak tersimpan.</div>';
          return;
        }

        listEl.innerHTML = currentHistoryData.map((pt, idx) => {
          const time = new Date(pt.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          const speed = Math.round((pt.speed || 0) * 3.6);
          return `
            <div class="history-item-row">
              <div class="history-item-left">
                <span class="history-idx">#${currentHistoryData.length - idx}</span>
                <span class="history-time">${time}</span>
                <span class="history-coords">(${pt.latitude.toFixed(4)}, ${pt.longitude.toFixed(4)})</span>
              </div>
              <span class="history-speed ${speed > 0 ? 'is-live' : 'is-offline'}">${speed > 0 ? speed + ' km/h' : 'Diam'}</span>
            </div>
          `;
        }).join('');
      } catch (err) {
        listEl.innerHTML = `<div class="history-empty-message error">Gagal memuat: ${escapeHtml(err.message)}</div>`;
      }
    }

    function loadAndRenderHistoryTrail() {
      if (!currentHistoryData || currentHistoryData.length === 0) {
        showToast('Tidak ada titik riwayat untuk ditampilkan.');
        return;
      }

      clearHistoryTrail();

      // Urutkan dari rekaman terlama ke terbaru untuk garis kronologis
      const sorted = [...currentHistoryData].reverse();
      const latlngs = sorted.map(pt => [pt.latitude, pt.longitude]);

      const isPartner = activeHistoryTarget === 'partner';
      const trailColor = isPartner 
        ? (getComputedStyle(document.documentElement).getPropertyValue('--accent-terracotta').trim() || '#BF5129')
        : (getComputedStyle(document.documentElement).getPropertyValue('--ink-secondary').trim() || '#423E37');

      // 1. Gambar Polyline Jejak
      const trailPolyline = L.polyline(latlngs, {
        color: trailColor,
        weight: 3,
        dashArray: '4, 6',
        opacity: 0.9
      });
      historyLayerGroup.addLayer(trailPolyline);

      // 2. Tambah marker titik awal (Start) & titik akhir (End)
      const startPt = latlngs[0];
      const endPt = latlngs[latlngs.length - 1];

      const startIcon = L.divIcon({
        className: 'custom-trail-marker',
        html: '<div class="trail-marker-dot start"></div>',
        iconSize: [12, 12],
        iconAnchor: [6, 6]
      });
      const endIcon = L.divIcon({
        className: 'custom-trail-marker',
        html: '<div class="trail-marker-dot end"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7]
      });

      const startMarker = L.marker(startPt, { icon: startIcon }).bindTooltip('Titik Awal Jejak');
      const endMarker = L.marker(endPt, { icon: endIcon }).bindTooltip('Posisi Terakhir Jejak');
      historyLayerGroup.addLayer(startMarker);
      historyLayerGroup.addLayer(endMarker);

      // 3. Zoom otomatis agar seluruh jejak terlihat pas di layar HP
      map.fitBounds(trailPolyline.getBounds(), { padding: [50, 50] });

      closeModal('historyModal');
      triggerHaptic('success');
    }

    function clearHistoryTrail() {
      if (historyLayerGroup) {
        historyLayerGroup.clearLayers();
      }
    }

    function openNavigationModal() {
      triggerHaptic('light');
      if (!appState.partnerCoords) {
        showToast('Lokasi pasangan belum tersedia. Menunggu GPS pasangan…', 'alert');
        return;
      }
      openModalWithFocus('navigationModal');
    }

    function openPlacesModal() {
      triggerHaptic('light');
      openModalWithFocus('placesModal');
      loadSavedPlaces();
    }

    function showPwaInstructions() {
      openModalWithFocus('pwaGuideModal');
    }

    function openModalWithFocus(id) {
      lastFocusedElement = document.activeElement;
      const modal = document.getElementById(id);
      if (!modal) return;
      modal.classList.add('active');

      const focusables = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusables.length > 0) {
        setTimeout(() => focusables[0].focus(), 50);
      }
    }

    function closeModal(id) {
      const modal = document.getElementById(id);
      if (modal) {
        modal.classList.remove('active');
      }
      if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
        lastFocusedElement.focus();
        lastFocusedElement = null;
      }
      setTimeout(() => {
        if (map) map.invalidateSize();
      }, 200);
    }


    async function resetProfile() {
      if (confirm('Keluar dan reset profil perangkat ini?')) {
        try {
          if (appState.user && appState.user.token) {
            await fetch('/api/auth/logout', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${appState.user.token}` }
            });
          }
        } catch (e) { }
        localStorage.clear();
        location.reload();
      }
    }

    async function togglePauseSharing() {
      triggerHaptic('light');
      if (!appState.device) return;
      const currentlyPaused = Boolean(appState.device.is_sharing_paused);
      const nextPause = !currentlyPaused;

      try {
        const res = await fetch('/api/device/pause-sharing', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${appState.user.token}`
          },
          body: JSON.stringify({ pause: nextPause })
        }).then(r => r.json());

        appState.device.is_sharing_paused = res.isSharingPaused ? 1 : 0;
        localStorage.setItem('tanpilan_device', JSON.stringify(appState.device));
        updateSharingConsentUI();
        showToast(res.message, 'shield');
      } catch (err) {
        showToast('Gagal mengubah status jeda berbagi: ' + err.message, 'alert');
      }
    }

    async function confirmUnpair() {
      triggerHaptic('light');
      if (!confirm('Putuskan hubungan dengan pasangan sekarang? Akses riwayat dan lokasi akan langsung dihentikan.')) {
        return;
      }
      try {
        const res = await fetch('/api/device/unpair', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${appState.user.token}` }
        }).then(r => r.json());

        appState.device.partner_device_id = null;
        appState.partnerCoords = null;
        localStorage.setItem('tanpilan_device', JSON.stringify(appState.device));
        closeModal('settingsModal');
        updateConnectionStateHUD();
        updateSharingConsentUI();
        showToast('Perangkat berhasil diputuskan.', 'link');
        if (markerPartner) {
          map.removeLayer(markerPartner);
          markerPartner = null;
        }
      } catch (err) {
        showToast('Gagal unpair: ' + err.message, 'alert');
      }
    }

    async function confirmDeleteAllData() {
      triggerHaptic('alert');
      const confirm1 = confirm('PERINGATAN: Seluruh akun, perangkat, tempat favorit, dan riwayat lokasi Anda akan DIHAPUS PERMANEN dari server. Lanjutkan?');
      if (!confirm1) return;

      try {
        await fetch('/api/auth/me/data', {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${appState.user.token}` }
        });
        localStorage.clear();
        alert('Seluruh data Anda telah berhasil dihapus permanen.');
        location.reload();
      } catch (err) {
        alert('Gagal menghapus data: ' + err.message);
      }
    }

    function updateSharingConsentUI() {
      const indicator = document.getElementById('sharingConsentIndicator');
      const textEl = document.getElementById('sharingConsentText');
      const pauseBtnText = document.getElementById('btnPauseSharingText');
      const sharingStatusText = document.getElementById('setSharingStatusText');

      const isPaired = appState.device && appState.device.partner_device_id;
      const isPaused = appState.device && appState.device.is_sharing_paused;

      if (pauseBtnText) {
        pauseBtnText.textContent = isPaused ? 'Lanjutkan Berbagi' : 'Jeda Berbagi Lokasi';
      }
      if (sharingStatusText) {
        sharingStatusText.textContent = isPaused ? 'Dijeda' : (isPaired ? 'Aktif' : 'Belum Berpasangan');
      }

      if (!indicator || !textEl) return;

      if (!isPaired) {
        indicator.classList.remove('is-active', 'is-paused');
        indicator.style.display = 'none';
        return;
      }

      indicator.style.display = 'flex';
      if (isPaused) {
        indicator.classList.remove('is-active');
        indicator.classList.add('is-paused');
        textEl.textContent = 'Berbagi lokasi sedang DIJEDA oleh Anda';
      } else {
        indicator.classList.remove('is-paused');
        indicator.classList.add('is-active');
        const partnerName = appState.partner ? appState.partner.name : 'Pasangan';
        textEl.textContent = `Lokasimu sedang dibagikan secara live ke ${partnerName}`;
      }
    }

    // ===== FITUR 1: NAVIGASI CEPAT (GOOGLE MAPS & WAZE) =====
    function openNavigationModal() {
      triggerHaptic('light');
      if (!appState.partnerCoords) {
        showToast('Lokasi pasangan belum tersedia. Menunggu GPS pasangan...');
        return;
      }
      document.getElementById('navigationModal').classList.add('active');
    }

    function openDirectGoogleMaps() {
      triggerHaptic('light');
      if (appState.partnerCoords) {
        const url = `https://www.google.com/maps/dir/?api=1&destination=${appState.partnerCoords.latitude},${appState.partnerCoords.longitude}`;
        window.open(url, '_blank');
        closeModal('navigationModal');
      }
    }

    function openDirectWaze() {
      triggerHaptic('light');
      if (appState.partnerCoords) {
        const url = `https://waze.com/ul?ll=${appState.partnerCoords.latitude},${appState.partnerCoords.longitude}&navigate=yes`;
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
      showToast('Sapaan getaran terkirim ke pasangan!', 'heart');
    }

    function onPartnerPokeReceived(data) {
      triggerHaptic('heart');
      spawnFloatingHearts(6);
      const name = data.senderName || 'Pasangan Anda';
      showToast(`${name} menyapa Anda!`, 'heart');
    }

    function spawnFloatingHearts(count = 4) {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return;
      }
      for (let i = 0; i < count; i++) {
        const heart = document.createElement('div');
        heart.className = 'floating-heart';
        heart.innerHTML = AppIcons.get('heart', { size: 24 });
        heart.style.left = `${Math.random() * 70 + 15}vw`;
        heart.style.animationDelay = `${i * 0.15}s`;
        document.body.appendChild(heart);
        setTimeout(() => heart.remove(), 2400);
      }
    }

    function showToast(msg, icon = null) {
      let toast = document.getElementById('appToast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'appToast';
        toast.className = 'app-toast';
        document.body.appendChild(toast);
      }
      toast.replaceChildren();
      if (icon) {
        const iconSpan = document.createElement('span');
        iconSpan.className = 'toast-icon';
        iconSpan.innerHTML = AppIcons.get(icon, { size: 16 });
        toast.appendChild(iconSpan);
      }
      const textSpan = document.createElement('span');
      textSpan.className = 'toast-text';
      textSpan.textContent = String(msg || '');
      toast.appendChild(textSpan);
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
        pill.innerHTML = `${AppIcons.get('lightning', { size: 13 })} <span>Update tiap 45 dtk</span>`;
        pill.className = 'pill-badge status-standby';
        pill.title = 'Mode Hemat Daya Aktif (Perangkat sedang diam)';
      } else {
        pill.innerHTML = `${AppIcons.get('lightning', { size: 13 })} <span>Update tiap 10 dtk</span>`;
        pill.className = 'pill-badge status-live';
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
      listEl.innerHTML = '<div class="history-empty-message">Memuat data tempat...</div>';

      if (!appState.device) return;

      try {
        const res = await fetch('/api/places', {
          headers: { 'X-Device-Token': appState.device.device_token }
        }).then(r => r.json());

        const places = res.places || [];
        countEl.textContent = `${places.length} Tempat`;

        if (places.length === 0) {
          listEl.innerHTML = '<div class="history-empty-message">Belum ada tempat favorit tersimpan.</div>';
          return;
        }

        listEl.innerHTML = places.map(p => `
          <div class="saved-place-item">
            <div>
              <div class="saved-place-name">
                <app-icon name="home" size="14"></app-icon> <span>${escapeHtml(p.name)}</span>
              </div>
              <div class="saved-place-meta">
                Radius ${p.radius_meters}m • (${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)})
              </div>
            </div>
            <button data-action="deletePlace" data-place-id="${p.id}" class="btn-delete-place" title="Hapus tempat" aria-label="Hapus tempat ${escapeHtml(p.name)}">
              <app-icon name="trash" size="14"></app-icon>
            </button>
          </div>
        `).join('');
      } catch (err) {
        listEl.innerHTML = `<div class="history-empty-message error">Gagal: ${escapeHtml(err.message)}</div>`;
      }
    }

    async function saveNewPlace() {
      const nameInput = document.getElementById('newPlaceNameInput');
      const name = nameInput.value.trim();
      if (!name) {
        showToast('Harap masukkan nama tempat.');
        return;
      }

      let targetCoords = appState.selectedPlaceSource === 'partner' ? appState.partnerCoords : appState.myCoords;
      if (!targetCoords) {
        showToast('Koordinat belum tersedia. Pastikan sinyal GPS aktif.');
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
          showToast(`Tempat "${name}" berhasil disimpan!`, 'check');
          nameInput.value = '';
          loadSavedPlaces();
        } else {
          showToast(res.error || 'Gagal menyimpan tempat');
        }
      } catch (err) {
        showToast('Terjadi kesalahan: ' + err.message);
      }
    }

    async function deletePlace(id) {
      if (!confirm('Hapus tempat favorit ini?')) return;
      try {
        await fetch(`/api/places/${id}`, {
          method: 'DELETE',
          headers: { 'X-Device-Token': appState.device.device_token }
        });
        triggerHaptic('light');
        loadSavedPlaces();
        showToast('Tempat berhasil dihapus');
      } catch (err) {
        showToast('Gagal menghapus: ' + err.message);
      }
    }

    // ===== FITUR 6: RINGKASAN PERJALANAN HARI INI =====
    async function loadDailySummary(target = 'partner') {
      const distEl = document.getElementById('summaryDailyDist');
      const timeEl = document.getElementById('summaryDailyTime');
      const ptsEl = document.getElementById('summaryDailyPoints');

      if (!appState.device) return;

      try {
        const res = await fetch(`/api/location/daily-summary?target=${target}`, {
          headers: { 'X-Device-Token': appState.device.device_token }
        }).then(r => r.json());

        if (res && res.summary) {
          distEl.textContent = res.summary.totalDistanceFormatted || '0 m';
          timeEl.textContent = `${res.summary.activeMinutes} mnt`;
          ptsEl.textContent = `${res.summary.pointsCount} titik`;
        }
      } catch (e) {
        distEl.textContent = '-';
        timeEl.textContent = '-';
        ptsEl.textContent = '-';
      }
    }

    // ===== OPTIMASI: SCREEN WAKE LOCK & VISIBILITY SAVER =====
    let wakeLock = null;
    async function initWakeLock() {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch (e) {}

      document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible' && 'wakeLock' in navigator) {
          try {
            wakeLock = await navigator.wakeLock.request('screen');
          } catch (e) {}
          if (map) map.invalidateSize();
        }
      });
    }
  
    // Aksesibilitas: Tutup modal aktif dengan tombol Escape (Esc)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        const activeModal = document.querySelector('.modal-overlay.active');
        if (activeModal && activeModal.id) {
          closeModal(activeModal.id);
        }
      }
    });

  

// ========================================================
// ACTION REGISTRY & EVENT DELEGATOR (K0-1 CSP Compliant)
// Tidak memakai atribut inline onclick; mendukung keyboard Enter/Space
// ========================================================
const ActionRegistry = {
  openPairModal: () => openPairModal(),
  openSettingsModal: () => openSettingsModal(),
  showPwaInstructions: () => showPwaInstructions(),
  closePwaBanner: () => closePwaBanner(),
  fitBoth: () => fitBoth(),
  cycleMapStyle: () => cycleMapStyle(),
  openHistoryModal: () => openHistoryModal(),
  focusPartner: () => focusPartner(),
  focusMe: () => focusMe(),
  toggleSheetExpand: () => toggleSheetExpand(),
  copyPartnerCoords: () => copyPartnerCoords(),
  openPlacesModal: () => openPlacesModal(),
  openNavigationModal: () => openNavigationModal(),
  sendLovePoke: (el) => sendLovePoke(el.dataset.type || 'heart'),
  shareLiveTrackingWhatsApp: () => shareLiveTrackingWhatsApp(),
  chooseRole: (el) => chooseRole(el.dataset.role),
  finishOnboarding: () => finishOnboarding(),
  closeModal: (el) => closeModal(el.dataset.modal),
  copyPairCode: () => copyPairCode(),
  submitPairCode: () => submitPairCode(),
  togglePauseSharing: () => togglePauseSharing(),
  confirmUnpair: () => confirmUnpair(),
  resetProfile: () => resetProfile(),
  confirmDeleteAllData: () => confirmDeleteAllData(),
  selectHistoryTarget: (el) => selectHistoryTarget(el.dataset.target),
  loadAndRenderHistoryTrail: () => loadAndRenderHistoryTrail(),
  clearHistoryTrail: () => clearHistoryTrail(),
  openDirectGoogleMaps: () => openDirectGoogleMaps(),
  openDirectWaze: () => openDirectWaze(),
  copyPartnerCoordsModal: () => copyPartnerCoordsModal(),
  setPlaceSource: (el) => setPlaceSource(el.dataset.source),
  saveNewPlace: () => saveNewPlace(),
  deletePlace: (el) => {
    const id = parseInt(el.dataset.placeId, 10);
    if (!isNaN(id)) deletePlace(id);
  }
};

let lastKeyboardActionTarget = null;
let lastKeyboardActionTime = 0;

function dispatchDelegatedAction(target, event) {
  const actionEl = target.closest('[data-action]');
  if (!actionEl) return;

  // Cegah eksekusi ganda jika browser mensintesis event click setelah keydown (Enter/Space)
  const now = Date.now();
  if (event.type === 'click' && actionEl === lastKeyboardActionTarget && now - lastKeyboardActionTime < 250) {
    return;
  }

  if (event.type === 'keydown') {
    lastKeyboardActionTarget = actionEl;
    lastKeyboardActionTime = now;
  }

  const actionName = actionEl.dataset.action;
  const handler = ActionRegistry[actionName];
  if (typeof handler === 'function') {
    if (actionEl.tagName === 'A' && actionEl.getAttribute('href') === '#') {
      event.preventDefault();
    }
    handler(actionEl, event);
  }
}

// 1. Click Listener (Delegasi tunggal)
document.addEventListener('click', (e) => {
  dispatchDelegatedAction(e.target, e);
});

// 2. Keyboard Accessibility (Enter & Space untuk div[role="button"] dan tabindex="0")
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
    const target = (e.target && e.target.closest) ? e.target : document.activeElement;
    const actionEl = target ? target.closest('[data-action]') : null;
    if (actionEl && (actionEl.getAttribute('role') === 'button' || actionEl.tagName === 'DIV' || actionEl.tagName === 'SPAN' || actionEl.hasAttribute('tabindex'))) {
      e.preventDefault();
      dispatchDelegatedAction(actionEl, e);
    }
  }
}, true);
