import notifee, { AndroidImportance, AndroidVisibility, EventType } from '@notifee/react-native';
import messaging from '@react-native-firebase/messaging';
import { supabase } from './supabaseClient';
import { PermissionsAndroid, Platform } from 'react-native';

const ADMIN_NOTIFICATION_CHANNEL_ID = 'delivery-platform-notifications';
const DUPLICATE_NOTIFICATION_WINDOW_MS = 5000;

export class NotificationService {
  private static recentNotificationKeys = new Map<string, number>();

  static async initialize() {
    await this.createNotificationChannels();

    // Request permission for iOS/Android 13+
    const authStatus = await this.requestNotificationPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL ||
      Platform.OS === 'android';

    if (enabled) {
      console.log('Authorization status:', authStatus);
      await this.getAndSaveToken();
    }

    // Handle foreground messages
    const unsubscribeForegroundMessages = messaging().onMessage(async remoteMessage => {
      console.log('Foreground message received:', remoteMessage);
      await this.displayNotification(remoteMessage);
    });

    const unsubscribeTokenRefresh = messaging().onTokenRefresh(async token => {
      await this.saveToken(token);
    });

    const adminNotificationsChannel = supabase
      .channel('admin_push_notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: 'target_group=eq.admin',
        },
        async payload => {
          console.log('Admin notification inserted:', payload);
          await this.displayNotification({
            notification: {
              title: payload.new.title,
              body: payload.new.description,
            },
            data: {
              order_id: payload.new.order_id,
              target_group: payload.new.target_group,
            },
          });
        },
      )
      .subscribe();

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

    return () => {
      unsubscribeForegroundMessages();
      unsubscribeTokenRefresh();
      supabase.removeChannel(adminNotificationsChannel);
    };
  }

  static async requestNotificationPermission() {
    const authStatus = await messaging().requestPermission();

    // Notifee handles iOS and Android 13+ notification permission prompts.
    await notifee.requestPermission();

    if (Platform.OS === 'android' && Platform.Version >= 33) {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    }

    if (Platform.OS === 'ios') {
      await messaging().registerDeviceForRemoteMessages();
    }

    return authStatus;
  }

  static async createNotificationChannels() {
    await notifee.createChannel({
      id: ADMIN_NOTIFICATION_CHANNEL_ID,
      name: 'Delivery Platform Notifications',
      lights: true,
      vibration: true,
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
    });
  }

  static async getAndSaveToken() {
    try {
      // Get FCM token
      const token = await messaging().getToken();
      
      if (token) {
        await this.saveToken(token);
      }
    } catch (error) {
      console.error('Error getting FCM token:', error);
    }
  }

  static async saveToken(token: string) {
    console.log('FCM Token:', token);

    // Save to Supabase using RPC to bypass RLS and handle uniqueness
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id || null;

    const { error } = await supabase.rpc('register_admin_token', {
      p_token: token,
      p_device_type: Platform.OS,
      p_user_id: userId,
    });

    if (error) {
      console.error('Error saving FCM token using RPC:', error);
    } else {
      console.log('FCM token registered successfully as admin');
    }
  }

  static async displayNotification(remoteMessage: any) {
    const { title, body } = remoteMessage.notification || {};
    const notificationTitle = title || remoteMessage.data?.title || 'New Notification';
    const notificationBody = body || remoteMessage.data?.body || remoteMessage.data?.description || '';
    const dedupeKey = [
      remoteMessage.data?.order_id || '',
      remoteMessage.data?.target_group || '',
      notificationTitle,
      notificationBody,
    ].join('|');
    const now = Date.now();
    const lastDisplayedAt = this.recentNotificationKeys.get(dedupeKey);

    if (lastDisplayedAt && now - lastDisplayedAt < DUPLICATE_NOTIFICATION_WINDOW_MS) {
      return;
    }

    this.recentNotificationKeys.set(dedupeKey, now);
    
    // Ensure channel exists (safe to call multiple times)
    await this.createNotificationChannels();

    await notifee.displayNotification({
      title: notificationTitle,
      body: notificationBody,
      android: {
        channelId: ADMIN_NOTIFICATION_CHANNEL_ID,
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
        smallIcon: 'ic_launcher', // Use standard app icon
        pressAction: {
          id: 'default',
        },
      },
      data: remoteMessage.data,
    });
  }
}
