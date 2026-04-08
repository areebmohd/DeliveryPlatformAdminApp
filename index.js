/**
 * @format
 */

import { AppRegistry } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import App from './App';
import { name as appName } from './app.json';
import { NotificationService } from './src/services/notificationService';

// Register background handler
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('Message handled in the background!', remoteMessage);
  await NotificationService.displayNotification(remoteMessage);
});

AppRegistry.registerComponent(appName, () => App);
