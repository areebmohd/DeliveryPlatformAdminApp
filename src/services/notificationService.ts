import notifee, { AndroidImportance, AndroidVisibility, EventType } from '@notifee/react-native';
import messaging from '@react-native-firebase/messaging';
import { supabase } from './supabaseClient';
import { Platform } from 'react-native';

export class NotificationService {
  static async initialize() {
    // Request permission for iOS/Android 13+
    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (enabled) {
      console.log('Authorization status:', authStatus);
      await this.getAndSaveToken();
    }

    // Also request Notifee permission (Android 13+)
    await notifee.requestPermission();

    // Create Notifee Channel
    await notifee.createChannel({
      id: 'admin_orders',
      name: 'Admin Order Notifications',
      lights: true,
      vibration: true,
      importance: AndroidImportance.HIGH,
    });

    // Handle foreground messages
    messaging().onMessage(async remoteMessage => {
      console.log('Foreground message received:', remoteMessage);
      await this.displayNotification(remoteMessage);
    });

    // Handle background actions
    notifee.onBackgroundEvent(async ({ type, detail }) => {
      const { notification, pressAction } = detail;
      if (type === EventType.PRESS && pressAction?.id === 'default') {
        console.log('User pressed notification in background:', notification);
      }
    });

    // Handle foreground actions
    notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.PRESS) {
        console.log('User pressed notification in foreground:', detail.notification);
      }
    });
  }

  static async getAndSaveToken() {
    try {
      // Get FCM token
      const token = await messaging().getToken();
      
      if (token) {
        console.log('FCM Token:', token);
        
        // Save to Supabase using RPC to bypass RLS and handle uniqueness
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id || null;

        const { error } = await supabase.rpc('register_admin_token', {
          p_token: token,
          p_device_type: Platform.OS,
          p_user_id: userId
        });

        if (error) {
          console.error('Error saving FCM token using RPC:', error);
        } else {
          console.log('FCM token registered successfully as admin');
        }
      }
    } catch (error) {
      console.error('Error getting FCM token:', error);
    }
  }

  static async displayNotification(remoteMessage: any) {
    const { title, body } = remoteMessage.notification || {};
    
    // Ensure channel exists (safe to call multiple times)
    await notifee.createChannel({
      id: 'admin_orders',
      name: 'Admin Order Notifications',
      lights: true,
      vibration: true,
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
    });

    await notifee.displayNotification({
      title: title || 'New Notification',
      body: body || '',
      android: {
        channelId: 'admin_orders',
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
        smallIcon: 'ic_launcher', // Use standard app icon
        pressAction: {
          id: 'default',
        },
      },
    });
  }
}
