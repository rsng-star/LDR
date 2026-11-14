import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Image, Modal } from 'react-native';
import { BarCodeScanner } from 'expo-barcode-scanner';
import apiService from '../services/api';

export default function PairingScreen({ device, onPairingSuccess, onCancel }) {
  const [activeTab, setActiveTab] = useState('input'); // 'input' | 'show'
  const [pairingCodeInput, setPairingCodeInput] = useState('');
  const [myGeneratedCode, setMyGeneratedCode] = useState(null);
  const [loading, setLoading] = useState(false);

  // Barcode Scanner Camera Modal
  const [hasCameraPermission, setHasCameraPermission] = useState(null);
  const [isScanning, setIsScanning] = useState(false);

  // Minta izin kamera untuk scanner
  useEffect(() => {
    (async () => {
      try {
        if (BarCodeScanner && BarCodeScanner.requestPermissionsAsync) {
          const { status } = await BarCodeScanner.requestPermissionsAsync();
          setHasCameraPermission(status === 'granted');
        }
      } catch (e) {
        console.warn('Camera permission check fallback:', e.message);
      }
    })();
  }, []);

  // Generate kode 6 digit untuk dipindai atau dimasukkan pasangan
  const handleGenerateCode = async () => {
    setLoading(true);
    try {
      const res = await apiService.generatePairingCode();
      setMyGeneratedCode(res.code);
    } catch (err) {
      Alert.alert('Gagal', err.message || 'Gagal membuat kode pairing');
    } finally {
      setLoading(false);
    }
  };

  // Submit kode yang diberikan pasangan (UC-01 Main Flow)
  const handlePairSubmit = async (codeToSubmit) => {
    const code = (codeToSubmit || pairingCodeInput).trim().toUpperCase();
    if (!code || code.length !== 6) {
      Alert.alert('Kode Tidak Lengkap', 'Masukkan 6 karakter kode pairing');
      return;
    }

    setLoading(true);
    try {
      const res = await apiService.pairDevice(code);
      Alert.alert('🎉 Berhasil!', 'Device pasangan berhasil terdaftar dan terhubung!');
      onPairingSuccess(res.partner);
    } catch (err) {
      Alert.alert('Kode Tidak Valid', err.message || 'Kode pairing salah atau sudah kedaluwarsa');
    } finally {
      setLoading(false);
    }
  };

  // Handler saat kamera berhasil memindai QR code pasangan
  const handleBarCodeScanned = ({ data }) => {
    setIsScanning(false);
    let extracted = (data || '').trim().toUpperCase();
    
    // Jika data berupa URL (misal: https://.../?pair=ABC123)
    if (extracted.includes('PAIR=')) {
      extracted = extracted.split('PAIR=')[1].slice(0, 6);
    } else if (extracted.length > 6) {
      extracted = extracted.slice(-6);
    }

    if (extracted.length === 6) {
      setPairingCodeInput(extracted);
      handlePairSubmit(extracted);
    } else {
      Alert.alert('Scan Gagal', `Kode tidak dikenali: "${data}"`);
    }
  };

  const qrImageUrl = myGeneratedCode
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(myGeneratedCode)}&bgcolor=090D16&color=38BDF8&margin=4`
    : null;

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Hubungkan Device Pasangan</Text>
        <Text style={styles.description}>
          Satu akun terhubung ke satu perangkat pasangan untuk berbagi lokasi GPS secara aman & realtime (UC-01).
        </Text>

        {/* Tab Switcher */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'input' && styles.activeTab]}
            onPress={() => setActiveTab('input')}
          >
            <Text style={[styles.tabText, activeTab === 'input' && styles.activeTabText]}>
              Input / Scan Pasangan
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'show' && styles.activeTab]}
            onPress={() => {
              setActiveTab('show');
              if (!myGeneratedCode) handleGenerateCode();
            }}
          >
            <Text style={[styles.tabText, activeTab === 'show' && styles.activeTabText]}>
              QR & Kode Saya
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'input' ? (
          <View style={styles.content}>
            <Text style={styles.label}>Masukkan 6-Digit Kode Pasangan:</Text>
            <TextInput
              style={styles.codeInput}
              placeholder="CONTOH: 9K7X2B"
              placeholderTextColor="#64748B"
              value={pairingCodeInput}
              onChangeText={(text) => setPairingCodeInput(text.toUpperCase())}
              maxLength={6}
              autoCapitalize="characters"
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={[styles.primaryBtn, { flex: 1 }]}
                onPress={() => handlePairSubmit()}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.btnText}>Verifikasi & Hubungkan</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.scanBtn}
                onPress={() => {
                  if (hasCameraPermission === false) {
                    Alert.alert('Izin Kamera Ditolak', 'Buka pengaturan HP untuk mengizinkan akses kamera.');
                  } else {
                    setIsScanning(true);
                  }
                }}
              >
                <Text style={styles.scanBtnText}>📷 Pindai QR</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.helperText}>
              Atau minta pasangan membuka tab "QR & Kode Saya" dan arahkan kamera ke layarnya.
            </Text>
          </View>
        ) : (
          <View style={styles.content}>
            <Text style={styles.label}>Tunjukkan Kode Ini ke Pasangan:</Text>
            
            <View style={styles.codeBox}>
              <Text style={styles.generatedCodeText}>{myGeneratedCode || '------'}</Text>
              <Text style={styles.timerBadge}>⏱ Berlaku 15 Menit</Text>
            </View>

            {/* Real Dynamic QR Code Generator */}
            <View style={styles.qrBox}>
              {qrImageUrl ? (
                <Image
                  source={{ uri: qrImageUrl }}
                  style={{ width: 150, height: 150, borderRadius: 10 }}
                  resizeMode="contain"
                />
              ) : (
                <ActivityIndicator color="#38BDF8" size="large" />
              )}
              <Text style={styles.qrSub}>Dapat dipindai langsung dengan kamera pasangan</Text>
            </View>

            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={handleGenerateCode}
              disabled={loading}
            >
              <Text style={styles.secondaryBtnText}>🔄 Buat Kode Baru</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
          <Text style={styles.cancelBtnText}>Kembali ke Peta</Text>
        </TouchableOpacity>
      </View>

      {/* Modal Kamera Scanner BarCode/QR */}
      <Modal visible={isScanning} animationType="slide" transparent={false}>
        <View style={styles.scannerModalContainer}>
          <View style={styles.scannerHeader}>
            <Text style={styles.scannerTitle}>Arahkan Kamera ke QR Pasangan</Text>
            <TouchableOpacity style={styles.closeScanBtn} onPress={() => setIsScanning(false)}>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>✕ Tutup</Text>
            </TouchableOpacity>
          </View>

          {BarCodeScanner ? (
            <BarCodeScanner
              onBarCodeScanned={handleBarCodeScanned}
              style={StyleSheet.absoluteFillObject}
            />
          ) : (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: '#fff' }}>Modul scanner kamera tidak tersedia di platform ini.</Text>
            </View>
          )}

          <View style={styles.scannerOverlayTarget}>
            <View style={styles.targetCornerTL} />
            <View style={styles.targetCornerTR} />
            <View style={styles.targetCornerBL} />
            <View style={styles.targetCornerBR} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090D16',
    justifyContent: 'center',
    padding: 20
  },
  card: {
    backgroundColor: '#0F172A',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)'
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#F8FAFC',
    textAlign: 'center',
    marginBottom: 8
  },
  description: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#090D16',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)'
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8
  },
  activeTab: {
    backgroundColor: '#0284C7'
  },
  tabText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600'
  },
  activeTabText: {
    color: '#FFFFFF',
    fontWeight: '700'
  },
  content: {
    alignItems: 'center'
  },
  label: {
    color: '#CBD5E1',
    fontSize: 13,
    marginBottom: 10,
    alignSelf: 'flex-start'
  },
  codeInput: {
    width: '100%',
    backgroundColor: '#090D16',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.4)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    color: '#38BDF8',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 4,
    textAlign: 'center'
  },
  helperText: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 12,
    textAlign: 'center'
  },
  primaryBtn: {
    backgroundColor: '#0284C7',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  scanBtn: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: '#38BDF8',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  scanBtnText: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '700'
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold'
  },
  codeBox: {
    backgroundColor: '#090D16',
    borderWidth: 1,
    borderColor: '#38BDF8',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
    marginBottom: 16
  },
  generatedCodeText: {
    color: '#38BDF8',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 6
  },
  timerBadge: {
    color: '#10B981',
    fontSize: 11,
    marginTop: 4,
    fontWeight: '600'
  },
  qrBox: {
    backgroundColor: '#090D16',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 16
  },
  qrSub: {
    color: '#94A3B8',
    fontSize: 10,
    marginTop: 8
  },
  secondaryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginBottom: 8
  },
  secondaryBtnText: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600'
  },
  cancelBtn: {
    marginTop: 16,
    alignItems: 'center'
  },
  cancelBtnText: {
    color: '#64748B',
    fontSize: 12
  },
  scannerModalContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'space-between'
  },
  scannerHeader: {
    zIndex: 10,
    paddingTop: 50,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingBottom: 16
  },
  scannerTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold'
  },
  closeScanBtn: {
    padding: 8
  },
  scannerOverlayTarget: {
    position: 'absolute',
    top: '32%',
    left: '15%',
    width: '70%',
    height: '35%',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.4)',
    borderRadius: 16
  },
  targetCornerTL: {
    position: 'absolute',
    top: -2,
    left: -2,
    width: 24,
    height: 24,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderColor: '#38BDF8'
  },
  targetCornerTR: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 24,
    height: 24,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderColor: '#38BDF8'
  },
  targetCornerBL: {
    position: 'absolute',
    bottom: -2,
    left: -2,
    width: 24,
    height: 24,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderColor: '#38BDF8'
  },
  targetCornerBR: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 24,
    height: 24,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderColor: '#38BDF8'
  }
});
