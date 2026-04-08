import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {StatusBar, useColorScheme} from 'react-native';

// Import Screens
import DashboardScreen from './src/screens/DashboardScreen';
import OrdersScreen from './src/screens/OrdersScreen';
import DeliveriesScreen from './src/screens/DeliveriesScreen';
import PaymentsScreen from './src/screens/PaymentsScreen';
import StoresScreen from './src/screens/StoresScreen';
import AccountScreen from './src/screens/AccountScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import StoreDetailsScreen from './src/screens/StoreDetailsScreen';
import RidersScreen from './src/screens/RidersScreen';


import Icon from 'react-native-vector-icons/Ionicons';
import { NotificationService } from './src/services/notificationService';


const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({route}) => ({
        headerStyle: {
          backgroundColor: '#fff',
        },
        headerTitleStyle: {
          fontWeight: 'bold',
          fontSize: 22,
        },
        headerTitleAlign: 'center',
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: 'gray',
        tabBarStyle: {
          height: 65,
          paddingBottom: 10,
          paddingTop: 5,
        },
        tabBarIcon: ({focused, color, size}) => {
          let iconName = '';

          if (route.name === 'Dashboard') {
            iconName = focused ? 'grid' : 'grid-outline';
          } else if (route.name === 'Orders') {
            iconName = focused ? 'cart' : 'cart-outline';
          } else if (route.name === 'Deliveries') {
            iconName = focused ? 'bicycle' : 'bicycle-outline';
          } else if (route.name === 'Account') {
            iconName = focused ? 'person-circle' : 'person-circle-outline';
          }

          return <Icon name={iconName} size={size} color={color} />;
        },
      })}>
      <Tab.Screen 
        name="Dashboard" 
        component={DashboardScreen} 
        options={{ title: 'Dashboard' }} 
      />
      <Tab.Screen 
        name="Orders" 
        component={OrdersScreen} 
        options={{ title: 'Orders' }} 
      />
      <Tab.Screen 
        name="Deliveries" 
        component={DeliveriesScreen} 
        options={{ title: 'Deliveries' }} 
      />
      <Tab.Screen 
        name="Account" 
        component={AccountScreen} 
        options={{ title: 'Account' }} 
      />
    </Tab.Navigator>
  );
}

import { AlertProvider } from './src/context/AlertContext';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  React.useEffect(() => {
    NotificationService.initialize();
  }, []);


  return (
    <SafeAreaProvider>
      <AlertProvider>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="MainTabs" component={TabNavigator} />

            <Stack.Screen 
              name="Payments" 
              component={PaymentsScreen}
              options={{ headerShown: true, headerTitle: 'Payments', headerBackTitle: '' }}
            />
            <Stack.Screen 
              name="Stores" 
              component={StoresScreen}
              options={{ headerShown: true, headerTitle: 'Stores', headerBackTitle: '' }}
            />
            <Stack.Screen 
              name="Notifications" 
              component={NotificationsScreen}
              options={{ headerShown: true, headerTitle: 'Notifications', headerBackTitle: '' }}
            />
            <Stack.Screen 
              name="StoreDetails" 
              component={StoreDetailsScreen}
              options={{ headerShown: false }}
            />

            <Stack.Screen 
              name="Riders" 
              component={RidersScreen}
              options={{ headerShown: true, headerTitle: 'Riders', headerBackTitle: '' }}
            />
          </Stack.Navigator>

        </NavigationContainer>
      </AlertProvider>
    </SafeAreaProvider>
  );
}

export default App;

