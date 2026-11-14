import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

class MobileNotificationService {
  constructor() {
    this.isConfigured = false;
  }

  async init() {
    if (this.isConfigured) return;

    // Konfigurasi bagaimana notifikasi ditampilkan saat aplikasi di foreground
    try {
      if (Notifications && Notifications.setNotificationHandler) {
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: false,
            shouldSetBadge: false,
          }),
        });

        // Minta izin notifikasi
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus === 'granted') {
          console.log('[NotificationService] Izin push notifikasi diberikan.');
          
          if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('distance-alerts', {
              name: 'Peringatan Jarak Pasangan',
              importance: Notifications.AndroidImportance.MAX,
              vibrationPattern: [0, 250, 250, 250],
              lightColor: '#F43F5E',
            });
          }
        }
      }
      this.isConfigured = true;
    } catch (e) {
      console.warn('[NotificationService] Init error / unsupported:', e.message);
    }
  }

  async sendPairingSuccess(partnerName) {
    try {
      await this.init();
      if (Notifications && Notifications.scheduleNotificationAsync) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: '🎉 Berhasil Terhubung!',
            body: `Perangkat Anda kini terhubung secara realtime dengan ${partnerName}.`,
            data: { type: 'PAIRING_SUCCESS' },
          },
          trigger: null,
        });
      }
    } catch (e) {}
  }
}

export default new MobileNotificationService();
