import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import apiService from '../services/api';

export default function AuthScreen({ onAuthSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [loading, setLoading] = useState(false);

  // Quick Persona Presets (Wanita & Pria)
  const setPersona = (name, mail) => {
    setEmail(mail);
    setPassword('Password123');
    setDeviceName(name);
  };

  const handleSubmit = async () => {
    if (!email || !password) {
      Alert.alert('Perhatian', 'Email dan password wajib diisi');
      return;
    }

    setLoading(true);
    try {
      let authData;
      if (isLogin) {
        authData = await apiService.login(email, password);
      } else {
        authData = await apiService.register(email, password);
      }

      // Generate device token unik
      const devToken = `dev_${authData.user.id}_${Date.now()}`;
      const name = deviceName || (email.includes('wanita') || email.includes('lili') ? 'Perangkat Wanita' : 'Perangkat Pria');
      const devRes = await apiService.registerDevice(devToken, name);

      Alert.alert('Sukses', isLogin ? 'Login berhasil!' : 'Registrasi berhasil!');
      onAuthSuccess({
        user: authData.user,
        token: authData.token,
        device: devRes.device
      });
    } catch (err) {
      Alert.alert('Gagal', err.message || 'Terjadi kesalahan otentikasi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.appTitle}>Tanpilan Tracking</Text>
          <Text style={styles.subtitle}>Tracking Dua Device Tanpa Antarmuka Web</Text>
        </View>

        {/* Quick Fill Demo Peran */}
        <Text style={styles.label}>Pilih Peran Cepat:</Text>
        <View style={styles.personaRow}>
          <TouchableOpacity
            style={styles.personaBtn}
            onPress={() => setPersona('Perangkat Wanita', 'wanita@tanpilan.local')}
          >
            <Text style={styles.personaBtnText}>👩 Wanita</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.personaBtn}
            onPress={() => setPersona('Perangkat Pria', 'pria@tanpilan.local')}
          >
            <Text style={styles.personaBtnText}>👨 Pria</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.input}
          placeholder="Email Pengguna"
          placeholderTextColor="#94A3B8"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <TextInput
          style={styles.input}
          placeholder="Password (min 6 karakter)"
          placeholderTextColor="#94A3B8"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {!isLogin && (
          <TextInput
            style={styles.input}
            placeholder="Nama Perangkat (cth: HP Wanita / HP Pria)"
            placeholderTextColor="#94A3B8"
            value={deviceName}
            onChangeText={setDeviceName}
          />
        )}

        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitBtnText}>{isLogin ? 'Masuk ke Aplikasi' : 'Daftar Akun Baru'}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setIsLogin(!isLogin)} style={styles.switchBtn}>
          <Text style={styles.switchBtnText}>
            {isLogin ? 'Belum punya akun? Daftar sekarang' : 'Sudah punya akun? Masuk'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    padding: 20
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#334155'
  },
  header: {
    alignItems: 'center',
    marginBottom: 20
  },
  appTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#38BDF8',
    marginBottom: 6
  },
  subtitle: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center'
  },
  label: {
    color: '#CBD5E1',
    fontSize: 12,
    marginBottom: 8,
    fontWeight: '600'
  },
  personaRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16
  },
  personaBtn: {
    flex: 1,
    backgroundColor: '#334155',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#475569'
  },
  personaBtnText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600'
  },
  input: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    padding: 12,
    color: '#F8FAFC',
    marginBottom: 12,
    fontSize: 14
  },
  submitBtn: {
    backgroundColor: '#0284C7',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15
  },
  switchBtn: {
    marginTop: 16,
    alignItems: 'center'
  },
  switchBtnText: {
    color: '#38BDF8',
    fontSize: 13
  }
});
