import React, { useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import AuthScreen from './src/screens/AuthScreen';
import TrackingMapScreen from './src/screens/TrackingMapScreen';
import PairingScreen from './src/screens/PairingScreen';
import SettingsScreen from './src/screens/SettingsScreen';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [currentDevice, setCurrentDevice] = useState(null);
  const [currentScreen, setCurrentScreen] = useState('auth'); // 'auth', 'map', 'pairing', 'settings'

  const handleAuthSuccess = ({ user, device }) => {
    setCurrentUser(user);
    setCurrentDevice(device);
    setCurrentScreen('map');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentDevice(null);
    setCurrentScreen('auth');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      {currentScreen === 'auth' && (
        <AuthScreen onAuthSuccess={handleAuthSuccess} />
      )}

      {currentScreen === 'map' && currentDevice && (
        <TrackingMapScreen
          user={currentUser}
          device={currentDevice}
          onOpenPairing={() => setCurrentScreen('pairing')}
          onOpenSettings={() => setCurrentScreen('settings')}
          onLogout={handleLogout}
        />
      )}

      {currentScreen === 'pairing' && currentDevice && (
        <PairingScreen
          device={currentDevice}
          onPairingSuccess={() => setCurrentScreen('map')}
          onCancel={() => setCurrentScreen('map')}
        />
      )}

      {currentScreen === 'settings' && currentDevice && (
        <SettingsScreen
          user={currentUser}
          device={currentDevice}
          onBack={() => setCurrentScreen('map')}
          onLogout={handleLogout}
          onUnpairSuccess={() => setCurrentScreen('map')}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A'
  }
});
