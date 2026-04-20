import notifee, { AndroidImportance, AndroidVisibility, EventType } from '@notifee/react-native';
import messaging from '@react-native-firebase/messaging';
import { supabase } from './supabaseClient';
import { PermissionsAndroid, Platform } from 'react-native';

const ADMIN_NOTIFICATION_CHANNEL_ID = 'delivery-platform-notifications';
const DUPLICATE_NOTIFICATION_WINDOW_MS = 5000;

export class NotificationService {
  private static recentNotificationKeys = new Map<string, number>();

  static async initialize() {
    let unsubscribeForegroundMessages: (() => void) | null = null;
    let unsubscribeTokenRefresh: (() => void) | null = null;
    let adminNotificationsChannel: any = null;

    try {
      await this.createNotificationChannels();

      // Request permission for iOS/Android 13+
      const authStatus = await this.requestNotificationPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL ||
        Platform.OS === 'android';

      if (enabled) {
        console.log('Authorization status:', authStatus);
        try {
          await this.getAndSaveToken();
        } catch (tokenError) {
          console.warn('Error getting and saving token:', tokenError);
        }
      }

      // Handle foreground messages
      unsubscribeForegroundMessages = messaging().onMessage(async remoteMessage => {
        try {
          console.log('Foreground message received:', remoteMessage);
          await this.displayNotification(remoteMessage);
        } catch (displayError) {
          console.error('Error displaying notification:', displayError);
        }
      });

      unsubscribeTokenRefresh = messaging().onTokenRefresh(async token => {
        try {
          await this.saveToken(token);
        } catch (saveError) {
          console.error('Error saving refreshed token:', saveError);
        }
      });

      try {
        adminNotificationsChannel = supabase
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
              try {
                console.log('Admin notification inserted:', payload);
                await this.displayNotification({
                  notification: {
                    title: payload.new?.title,
                    body: payload.new?.description,
                  },
                  data: {
                    order_id: payload.new?.order_id,
                    target_group: payload.new?.target_group,
                  },
                });
              } catch (notifError) {
                console.error('Error handling admin notification:', notifError);
              }
            },
          )
          .subscribe();
      } catch (channelError) {
        console.warn('Error subscribing to admin notifications:', channelError);
      }

      // Handle background actions
      notifee.onBackgroundEvent(async ({ type, detail }) => {
        try {
          const { notification, pressAction } = detail;
          if (type === EventType.PRESS && pressAction?.id === 'default') {
            console.log('User pressed notification in background:', notification);
          }
        } catch (bgError) {
          console.error('Error handling background event:', bgError);
        }
      });

      // Handle foreground actions
      notifee.onForegroundEvent(({ type, detail }) => {
        try {
          if (type === EventType.PRESS) {
            console.log('User pressed notification in foreground:', detail?.notification);
          }
        } catch (fgError) {
          console.error('Error handling foreground event:', fgError);
        }
      });
    } catch (error) {
      console.error('Critical error in notification service initialization:', error);
    }

    return () => {
      try {
        if (unsubscribeForegroundMessages) unsubscribeForegroundMessages();
        if (unsubscribeTokenRefresh) unsubscribeTokenRefresh();
        if (adminNotificationsChannel) supabase.removeChannel(adminNotificationsChannel);
      } catch (cleanupError) {
        console.error('Error during notification cleanup:', cleanupError);
      }
    };
  }

  static async requestNotificationPermission() {
    try {
      const authStatus = await messaging().requestPermission();

      // Notifee handles iOS and Android 13+ notification permission prompts.
      try {
        await notifee.requestPermission();
      } catch (notifeeError) {
        console.warn('Notifee permission error:', notifeeError);
      }

      if (Platform.OS === 'android' && Platform.Version >= 33) {
        try {
          await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        } catch (permError) {
          console.warn('Android POST_NOTIFICATIONS permission error:', permError);
        }
      }

      if (Platform.OS === 'ios') {
        try {
          await messaging().registerDeviceForRemoteMessages();
        } catch (iosError) {
          console.warn('iOS device registration error:', iosError);
        }
      }

      return authStatus;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      throw error;
    }
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
    try {
      if (!token) {
        console.warn('Empty token provided to saveToken');
        return;
      }

      console.log('FCM Token:', token);

      // Save to Supabase using RPC to bypass RLS and handle uniqueness
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.warn('Error getting session:', sessionError);
      }
      
      const userId = sessionData?.session?.user?.id || null;

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
    } catch (error) {
      console.error('Unexpected error in saveToken:', error);
    }
  }

  static async displayNotification(remoteMessage: any) {
    try {
      if (!remoteMessage) {
        console.warn('Received empty notification message');
        return;
      }

      const { title, body } = remoteMessage.notification || {};
      const notificationTitle = title || remoteMessage.data?.title || 'New Notification';
      const notificationBody = body || remoteMessage.data?.body || remoteMessage.data?.description || '';
      
      // Validate notification content
      if (!notificationTitle && !notificationBody) {
        console.warn('Notification has no title or body');
        return;
      }

      const dedupeKey = [
        remoteMessage.data?.order_id || '',
        remoteMessage.data?.target_group || '',
        notificationTitle,
        notificationBody,
      ].join('|');
      
      const now = Date.now();
      const lastDisplayedAt = this.recentNotificationKeys.get(dedupeKey);

      if (lastDisplayedAt && now - lastDisplayedAt < DUPLICATE_NOTIFICATION_WINDOW_MS) {
        console.log('Skipping duplicate notification');
        return;
      }

      this.recentNotificationKeys.set(dedupeKey, now);
      
      // Ensure channel exists (safe to call multiple times)
      await this.createNotificationChannels();

      await notifee.displayNotification({
        title: notificationTitle || undefined,
        body: notificationBody || undefined,
        android: {
          channelId: ADMIN_NOTIFICATION_CHANNEL_ID,
          importance: AndroidImportance.HIGH,
          visibility: AndroidVisibility.PUBLIC,
          smallIcon: 'ic_launcher', // Use standard app icon
          pressAction: {
            id: 'default',
          },
        },
        data: remoteMessage.data || {},
      });
    } catch (error) {
      console.error('Error displaying notification:', error);
    }
  }
}
