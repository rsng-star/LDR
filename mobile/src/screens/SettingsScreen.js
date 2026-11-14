import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import apiService from '../services/api';

export default function SettingsScreen({ user, device, onBack, onLogout, onUnpairSuccess }) {
  const handleUnpair = () => {
    Alert.alert(
      'Putuskan Pasangan',
      'Apakah Anda yakin ingin memutuskan hubungan dengan perangkat pasangan?',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Putuskan',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiService.unpairDevice();
              Alert.alert('Berhasil', 'Perangkat berhasil diputuskan.');
              onUnpairSuccess();
            } catch (err) {
              Alert.alert('Gagal', err.message || 'Gagal memutuskan perangkat');
            }
          }
        }
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Kembali</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pengaturan Aplikasi</Text>
      </View>

      {/* Akun */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>AKUN & PENGGUNA</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Email</Text>
          <Text style={styles.rowValue}>{user.email}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>ID Pengguna</Text>
          <Text style={styles.rowValue}>#{user.id}</Text>
        </View>
      </View>

      {/* Perangkat */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>PERANGKAT INI</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Nama Perangkat</Text>
          <Text style={styles.rowValue}>{device.device_name}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>ID Perangkat</Text>
          <Text style={styles.rowValue}>#{device.id}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Status Baterai</Text>
          <Text style={styles.rowValue}>{device.battery_level || 100}%</Text>
        </View>
      </View>

      {/* Parameter Pelacakan Sesuai PRD */}
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>PARAMETER PELACAKAN (PRD)</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Interval Update GPS</Text>
          <Text style={styles.rowValueHighlight}>10 Detik</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Target Latensi Update</Text>
          <Text style={styles.rowValueHighlight}>&lt; 5 Detik</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Ambang Batas Jarak</Text>
          <Text style={styles.rowValueHighlight}>100 Meter</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Retensi Data</Text>
          <Text style={styles.rowValue}>Auto-hapus &gt; 30 Hari</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Enkripsi & Keamanan</Text>
          <Text style={styles.rowValue}>TLS 1.2+ & bcrypt</Text>
        </View>
      </View>

      {/* Tindakan */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.unpairBtn} onPress={handleUnpair}>
          <Text style={styles.unpairBtnText}>Putuskan Hubungan Pasangan</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
          <Text style={styles.logoutBtnText}>Keluar dari Akun</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    padding: 20
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 35,
    paddingBottom: 20
  },
  backBtn: {
    marginRight: 15
  },
  backBtnText: {
    color: '#38BDF8',
    fontSize: 14,
    fontWeight: 'bold'
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold'
  },
  section: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155'
  },
  sectionHeader: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: 12
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: '#334155'
  },
  rowLabel: {
    color: '#CBD5E1',
    fontSize: 13
  },
  rowValue: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '500'
  },
  rowValueHighlight: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: 'bold'
  },
  unpairBtn: {
    backgroundColor: '#7F1D1D',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10
  },
  unpairBtnText: {
    color: '#FEE2E2',
    fontWeight: 'bold',
    fontSize: 13
  },
  logoutBtn: {
    backgroundColor: '#334155',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center'
  },
  logoutBtnText: {
    color: '#94A3B8',
    fontWeight: '600',
    fontSize: 13
  }
});
