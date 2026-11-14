import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform, Linking } from 'react-native';
import MapView, { Marker, Polyline, Circle, PROVIDER_DEFAULT } from 'react-native-maps';
import apiService from '../services/api';
import socketService from '../services/socket';
import locationService from '../services/locationService';
import mobileNotificationService from '../services/notificationService';

export default function TrackingMapScreen({ user, device, onOpenPairing, onOpenSettings, onLogout }) {
  const [partner, setPartner] = useState(null);
  const [partnerPlace, setPartnerPlace] = useState(null);
  const [myLocation, setMyLocation] = useState({ latitude: -7.8013885, longitude: 110.3647176 });
  const [partnerLocation, setPartnerLocation] = useState(null);
  const [distance, setDistance] = useState(null);
  const [distanceFormatted, setDistanceFormatted] = useState('Belum Terhubung');
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [nextUpdateSeconds, setNextUpdateSeconds] = useState(10);
  const [mapType, setMapType] = useState('standard'); // 'standard' | 'satellite'

  const mapRef = useRef(null);

  // Inisialisasi WebSocket & Pelacakan Lokasi Native
  useEffect(() => {
    mobileNotificationService.init();
    loadInitialStatus();

    socketService.connect(device.device_token);

    const unsubWsStatus = socketService.on('connection_change', (data) => {
      setIsWsConnected(data.isConnected);
    });

    // Listener pembaruan posisi pasangan via WebSocket
    const unsubPartnerLoc = socketService.on('partner_location_update', (data) => {
      if (data.location) {
        setPartnerLocation({
          latitude: data.location.latitude,
          longitude: data.location.longitude,
          speed: data.location.speed,
          heading: data.location.heading
        });
      }
      if (data.distanceToPartner !== null) {
        setDistance(data.distanceToPartner);
        setDistanceFormatted(data.distanceFormatted);
      }
      if (data.matchedPlace) {
        setPartnerPlace(data.matchedPlace);
      }
    });

    const unsubPoke = socketService.on('partner_poke_received', (data) => {
      Alert.alert('❤️ Sentuhan Cinta', `${data.senderName || 'Pasangan Anda'} mengirimkan getaran cinta!`);
    });

    const unsubPartnerStatus = socketService.on('partner_status', (data) => {
      setPartner((prev) => (prev ? { ...prev, isOnline: data.isOnline } : null));
    });

    locationService.startTracking(device.device_token);
    const unsubMyLoc = locationService.onLocation((coords) => {
      setMyLocation(coords);
    });

    const countdownInterval = setInterval(() => {
      setNextUpdateSeconds((sec) => (sec <= 1 ? 10 : sec - 1));
    }, 1000);

    return () => {
      unsubWsStatus();
      unsubPartnerLoc();
      unsubPoke();
      unsubPartnerStatus();
      unsubMyLoc();
      clearInterval(countdownInterval);
      locationService.stopTracking();
      socketService.disconnect();
    };
  }, [device]);

  const loadInitialStatus = async () => {
    try {
      const statusRes = await apiService.getDeviceStatus();
      if (statusRes.partner) {
        setPartner(statusRes.partner);
      }
      const locRes = await apiService.getLatestLocations();
      if (locRes.myDevice?.location) {
        setMyLocation(locRes.myDevice.location);
      }
      if (locRes.partnerDevice?.location) {
        setPartnerLocation(locRes.partnerDevice.location);
      }
      if (locRes.distance !== null) {
        setDistance(locRes.distance);
        setDistanceFormatted(locRes.distanceFormatted);
      }
    } catch (err) {
      console.warn('Gagal memuat status awal:', err.message);
    }
  };

  const toggleSimulation = () => {
    const nextState = !isSimulating;
    setIsSimulating(nextState);
    locationService.setSimulationMode(nextState);
  };

  const focusMe = () => {
    if (mapRef.current && myLocation) {
      mapRef.current.animateToRegion({
        latitude: myLocation.latitude,
        longitude: myLocation.longitude,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008
      }, 600);
    }
  };

  const focusPartner = () => {
    if (mapRef.current && partnerLocation) {
      mapRef.current.animateToRegion({
        latitude: partnerLocation.latitude,
        longitude: partnerLocation.longitude,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008
      }, 600);
    } else {
      Alert.alert('Info', 'Belum ada data koordinat pasangan.');
    }
  };

  const fitBoth = () => {
    if (mapRef.current && partnerLocation && myLocation) {
      mapRef.current.fitToCoordinates([myLocation, partnerLocation], {
        edgePadding: { top: 90, right: 60, bottom: 90, left: 60 },
        animated: true
      });
    } else {
      focusMe();
    }
  };

  const toggleMapType = () => {
    setMapType((prev) => (prev === 'standard' ? 'satellite' : 'standard'));
  };

  const navigateToPartner = () => {
    if (!partnerLocation) {
      Alert.alert('Info', 'Belum ada data koordinat pasangan.');
      return;
    }
    const url = `https://www.google.com/maps/dir/?api=1&destination=${partnerLocation.latitude},${partnerLocation.longitude}`;
    Linking.openURL(url).catch(() => Alert.alert('Error', 'Gagal membuka aplikasi navigasi'));
  };

  const sendPoke = () => {
    socketService.send('send_poke', { type: 'heart' });
    Alert.alert('❤️ Sentuhan Terkirim', 'Getar cinta terkirim ke pasangan!');
  };

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Tanpilan: Pelacakan Realtime</Text>
          <Text style={styles.headerSub}>
            {device.device_name} • {isWsConnected ? '🟢 Terhubung Cloud' : '🔴 Terputus'}
          </Text>
        </View>
        <TouchableOpacity style={styles.settingsBtn} onPress={onOpenSettings}>
          <Text style={styles.settingsBtnText}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* Global Distance Banner */}
      <View style={styles.globalBanner}>
        <Text style={styles.globalBannerLabel}>JARAK DENGAN PASANGAN:</Text>
        <Text style={styles.globalBannerVal}>{distanceFormatted}</Text>
        <Text style={styles.globalBannerSub}>
          {distance !== null
            ? distance > 50000
              ? '🌍 Beda Kota / Wilayah Jauh'
              : distance > 1000
              ? '🚗 Perjalanan / Luar Area'
              : '🚶 Berada di Sekitar'
            : 'Menunggu sambungan pasangan...'}
        </Text>
      </View>

      {/* Real Interactive MapView (react-native-maps) */}
      <View style={styles.mapContainer}>
        {Platform.OS !== 'web' ? (
          <MapView
            ref={mapRef}
            style={styles.map}
            provider={PROVIDER_DEFAULT}
            mapType={mapType}
            initialRegion={{
              latitude: myLocation.latitude,
              longitude: myLocation.longitude,
              latitudeDelta: 0.015,
              longitudeDelta: 0.015
            }}
          >
            {/* Accuracy Halo Lingkaran Saya */}
            <Circle
              center={{ latitude: myLocation.latitude, longitude: myLocation.longitude }}
              radius={18}
              fillColor="rgba(56, 189, 248, 0.25)"
              strokeColor="#38BDF8"
              strokeWidth={1.5}
            />

            {/* Marker Perangkat Saya */}
            <Marker
              coordinate={{ latitude: myLocation.latitude, longitude: myLocation.longitude }}
              title={`Saya (${device.device_name})`}
              description="Posisi GPS Aktual Anda"
              pinColor="#38BDF8"
            />

            {/* Marker Perangkat Pasangan & Polyline Penghubung */}
            {partnerLocation && (
              <>
                <Marker
                  coordinate={{ latitude: partnerLocation.latitude, longitude: partnerLocation.longitude }}
                  title={partner?.name || 'Pasangan'}
                  description={`Jarak: ${distanceFormatted}`}
                  pinColor="#F43F5E"
                />
                <Polyline
                  coordinates={[
                    { latitude: myLocation.latitude, longitude: myLocation.longitude },
                    { latitude: partnerLocation.latitude, longitude: partnerLocation.longitude }
                  ]}
                  strokeColor="#38BDF8"
                  strokeWidth={3.5}
                  lineDashPattern={[6, 8]}
                />
              </>
            )}
          </MapView>
        ) : (
          /* Web Fallback Preview */
          <View style={styles.webFallbackContainer}>
            <Text style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center', padding: 20 }}>
              🌐 Mode Web: Silakan buka versi Web di browser HP untuk tampilan Leaflet interaktif penuh.
            </Text>
          </View>
        )}

        {/* Floating Map Action Buttons */}
        <View style={styles.mapToolRail}>
          {partnerLocation && (
            <TouchableOpacity style={[styles.fabBtn, { borderColor: '#F43F5E' }]} onPress={focusPartner}>
              <Text style={{ fontSize: 18 }}>💖</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.fabBtn} onPress={focusMe}>
            <Text style={{ fontSize: 18 }}>🎯</Text>
          </TouchableOpacity>
          {partnerLocation && (
            <TouchableOpacity style={styles.fabBtn} onPress={fitBoth}>
              <Text style={{ fontSize: 18 }}>🗺️</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.fabBtn} onPress={toggleMapType}>
            <Text style={{ fontSize: 16 }}>{mapType === 'satellite' ? '☀️' : '🛰️'}</Text>
          </TouchableOpacity>
        </View>

        {/* Update Countdown Indicator */}
        <View style={styles.countdownPill}>
          <Text style={styles.countdownText}>
            ⏱ Pembaruan lokasi berikutnya: {nextUpdateSeconds}s (Interval 10s)
          </Text>
        </View>
      </View>

      {/* Bottom Status Card */}
      <View style={styles.bottomCard}>
        <View style={styles.partnerInfoRow}>
          <View style={styles.partnerAvatar}>
            <Text style={{ fontSize: 20 }}>{partner ? '💑' : '👤'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.partnerNameText}>
              {partner ? partner.name : 'Belum Terhubung Pasangan'}
              {partnerPlace && ` • 🏠 ${partnerPlace.name}`}
            </Text>
            <Text style={styles.partnerSubText}>
              {partner
                ? `${partner.isOnline ? '🟢 Online' : '⚪ Offline'} • Baterai ${partner.battery || 100}% • Jarak: ${distanceFormatted}`
                : 'Hubungkan dengan kode pairing 6-digit'}
            </Text>
          </View>
          {!partner && (
            <TouchableOpacity style={styles.smallPairBtn} onPress={onOpenPairing}>
              <Text style={styles.smallPairBtnText}>Pair</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Quick Controls */}
        <View style={styles.controlRow}>
          {partnerLocation && (
            <TouchableOpacity style={[styles.actionBtn, { borderColor: '#38BDF8' }]} onPress={navigateToPartner}>
              <Text style={[styles.actionBtnText, { color: '#38BDF8' }]}>🧭 Rute Peta</Text>
            </TouchableOpacity>
          )}
          {partner && (
            <TouchableOpacity style={[styles.actionBtn, { borderColor: '#F43F5E' }]} onPress={sendPoke}>
              <Text style={[styles.actionBtnText, { color: '#F43F5E' }]}>❤️ Ping Sayang</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.actionBtn, isSimulating && styles.actionBtnActive]}
            onPress={toggleSimulation}
          >
            <Text style={styles.actionBtnText}>
              {isSimulating ? '🛑 Stop' : '🎮 Simulasi'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={onOpenPairing}>
            <Text style={styles.actionBtnText}>🔗 Pairing</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090D16'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 45,
    paddingBottom: 12,
    backgroundColor: '#0F172A',
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)'
  },
  headerTitle: {
    color: '#38BDF8',
    fontSize: 16,
    fontWeight: 'bold'
  },
  headerSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2
  },
  settingsBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    padding: 8,
    borderRadius: 12
  },
  settingsBtnText: {
    fontSize: 16
  },
  globalBanner: {
    backgroundColor: '#0E1726',
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)'
  },
  globalBannerLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5
  },
  globalBannerVal: {
    color: '#38BDF8',
    fontSize: 22,
    fontWeight: '900',
    marginVertical: 2
  },
  globalBannerSub: {
    color: '#CBD5E1',
    fontSize: 11
  },
  mapContainer: {
    flex: 1,
    position: 'relative'
  },
  map: {
    ...StyleSheet.absoluteFillObject
  },
  webFallbackContainer: {
    flex: 1,
    backgroundColor: '#090D16',
    justifyContent: 'center',
    alignItems: 'center'
  },
  mapToolRail: {
    position: 'absolute',
    right: 16,
    top: 20,
    gap: 10
  },
  fabBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4
  },
  countdownPill: {
    position: 'absolute',
    top: 14,
    left: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)'
  },
  countdownText: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '600'
  },
  bottomCard: {
    backgroundColor: '#0F172A',
    padding: 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)'
  },
  partnerInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14
  },
  partnerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(244, 63, 94, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  partnerNameText: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: 'bold'
  },
  partnerSubText: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2
  },
  smallPairBtn: {
    backgroundColor: '#0284C7',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 14
  },
  smallPairBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold'
  },
  controlRow: {
    flexDirection: 'row',
    gap: 10
  },
  actionBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)'
  },
  actionBtnActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderColor: '#EF4444'
  },
  actionBtnText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700'
  }
});
