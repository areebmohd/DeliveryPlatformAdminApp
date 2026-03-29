import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';

const AccountScreen = () => {
  const navigation = useNavigation<any>();

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
    marginLeft: 15,
    color: '#333',
  },
});

export default AccountScreen;
