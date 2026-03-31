import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  Switch,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { supabase } from '../services/supabaseClient';
import { useAlert } from '../context/AlertContext';
import { Colors } from '../theme/colors';

const AccountScreen = () => {
  const navigation = useNavigation<any>();
  const { showAlert, showToast } = useAlert();
  const [isOnlineEnabled, setIsOnlineEnabled] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoadingSettings(true);
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'pay_online_enabled')
        .single();
      if (!error && data) {
        setIsOnlineEnabled(data.value);
      } else if (error) {
        console.error('Error fetching settings:', error);
      }
    } catch (e) {
      console.error('Error fetching settings:', e);
    } finally {
      setLoadingSettings(false);
    }
  };

  const toggleOnlinePayment = async (newValue: boolean) => {
    try {
      setToggling(true);
      // Use the RPC function to bypass RLS for the static admin app
      const { error } = await supabase.rpc('set_online_payments_enabled', {
        p_enabled: newValue,
      });

      if (error) throw error;
      setIsOnlineEnabled(newValue);
      showToast(`Online payments ${newValue ? 'enabled' : 'disabled'}`, 'success');
    } catch (e: any) {
      showAlert({ title: 'Error', message: e.message, type: 'error' });
    } finally {
      setToggling(false);
    }
  };

  const menuItems = [
    {
      id: 'payments',
      title: 'Payments',
      icon: 'wallet-outline',
      screen: 'Payments',
    },
    {
      id: 'stores',
      title: 'Stores',
      icon: 'storefront-outline',
      screen: 'Stores',
    },
    {
      id: 'riders',
      title: 'Riders',
      icon: 'bicycle-outline',
      screen: 'Riders',
    },
    {
      id: 'notifications',
      title: 'Notifications',
      icon: 'notifications-outline',
      screen: 'Notifications',
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.adminInfoCard}>
          <View style={styles.adminHeader}>
            <View style={styles.adminAvatar}>
              <Icon name="person-circle-outline" size={60} color="#007AFF" />
            </View>
            <View style={styles.adminTextContainer}>
              <Text style={styles.adminName}>Ashu</Text>
              <Text style={styles.adminRole}>Administrator</Text>
            </View>
          </View>
          
          <View style={styles.infoDivider} />
          
          <View style={styles.infoRow}>
            <Icon name="call-outline" size={20} color="#666" />
            <Text style={styles.infoText}>7534846938</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Icon name="card-outline" size={20} color="#666" />
            <Text style={styles.infoText}>aashu9105628720-1@okicici</Text>
          </View>
        </View>

        <View style={styles.menuContainer}>
          {menuItems.map(item => (
            <TouchableOpacity
              key={item.id}
              style={styles.menuItem}
              onPress={() => navigation.navigate(item.screen)}>
              <View style={styles.menuItemLeft}>
                <Icon name={item.icon} size={24} color="#333" />
                <Text style={styles.menuItemTitle}>{item.title}</Text>
              </View>
              <Icon name="chevron-forward" size={20} color="#ccc" />
            </TouchableOpacity>
          ))}
        </View>

        {/* System Management Box */}
        <View style={styles.menuContainer}>
          <View style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <Icon name={isOnlineEnabled ? "flash" : "flash-off"} size={24} color={isOnlineEnabled ? "#007AFF" : "#666"} />
              <View>
                <Text style={styles.menuItemTitle}>Allow Online Payments</Text>
                <Text style={styles.menuItemSubtitle}>
                  {isOnlineEnabled ? "Customers can pay via UPI" : "Customers can only use COD"}
                </Text>
              </View>
            </View>
            <Switch
              value={isOnlineEnabled}
              onValueChange={toggleOnlinePayment}
              trackColor={{ false: '#d1d1d1', true: '#cce4ff' }}
              thumbColor={isOnlineEnabled ? '#007AFF' : '#f4f3f4'}
              disabled={toggling || loadingSettings}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  menuContainer: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#eee',
    marginTop: 10,
    marginBottom: 10,
  },
  adminInfoCard: {
    backgroundColor: '#fff',
    margin: 15,
    borderRadius: 15,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  adminHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  adminAvatar: {
    marginRight: 15,
  },
  adminTextContainer: {
    flex: 1,
  },
  adminName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  adminRole: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
    marginTop: 2,
  },
  infoDivider: {
    height: 1,
    backgroundColor: '#eee',
    marginBottom: 15,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  infoText: {
    fontSize: 16,
    color: '#555',
    marginLeft: 12,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuItemTitle: {
    fontSize: 16,
    color: '#333',
    fontWeight: '600',
    marginLeft: 15,
  },
  menuItemSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
    marginLeft: 15,
  },
});

export default AccountScreen;
