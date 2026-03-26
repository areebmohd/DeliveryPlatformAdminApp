import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  RefreshControl,
  Dimensions,
} from 'react-native';
import {supabase} from '../services/supabaseClient';
import {useAlert} from '../context/AlertContext';
import Icon from 'react-native-vector-icons/Ionicons';

const {width} = Dimensions.get('window');

interface Rider {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  avatar_url: string | null;
  upi_id: string | null;
  rider_profiles: {
    vehicle_type: string | null;
    vehicle_number: string | null;
  }[] | {
    vehicle_type: string | null;
    vehicle_number: string | null;
  } | null;
  addresses: {
    address_line: string;
    city: string;
    pincode: string;
    is_default: boolean;
  }[] | null;
}

const RidersScreen = () => {
  const {showAlert} = useAlert();
  const [riders, setRiders] = useState<Rider[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRiders = async () => {
    try {
      const {data, error} = await supabase
        .from('profiles')
        .select(`
          id,
          full_name,
          email,
          phone,
          avatar_url,
          upi_id,
          rider_profiles (
            vehicle_type,
            vehicle_number
          ),
          addresses (
            address_line,
            city,
            pincode,
            is_default
          )
        `)
        .eq('role', 'rider')
        .order('full_name', {ascending: true});

      if (error) throw (error as any);
      setRiders((data as any) || []);
    } catch (error: any) {
      showAlert({title: 'Error', message: error.message, type: 'error'});
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchRiders();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchRiders();
  };

  const handleCall = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  const renderRiderItem = ({item}: {item: Rider}) => {
    const riderProfile = Array.isArray(item.rider_profiles) 
      ? item.rider_profiles[0] 
      : item.rider_profiles;

    return (
      <View style={styles.riderCard}>
        <View style={styles.cardHeader}>
          <View style={styles.riderInfo}>
            <View style={styles.avatarContainer}>
              <Icon name="person" size={30} color="#007AFF" />
            </View>
            <View>
              <Text style={styles.riderName}>{item.full_name || 'Unnamed Rider'}</Text>
              <Text style={styles.riderPhone}>{item.phone || 'No phone'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.detailsRow}>
          <View style={styles.detailItem}>
            <Icon name="bicycle-outline" size={16} color="#666" />
            <Text style={styles.detailText}>
              {riderProfile?.vehicle_type || 'N/A'}
            </Text>
          </View>
          <View style={styles.detailItem}>
            <Icon name="card-outline" size={16} color="#666" />
            <Text style={styles.detailText}>
              {riderProfile?.vehicle_number || 'N/A'}
            </Text>
          </View>
        </View>

        {/* Address Section */}
        {(() => {
          const defaultAddress = item.addresses?.find(a => a.is_default) || item.addresses?.[0];
          if (!defaultAddress) return null;
          return (
            <View style={styles.addressContainer}>
              <Icon name="location-outline" size={16} color="#666" />
              <Text style={styles.addressText} numberOfLines={2}>
                {`${defaultAddress.address_line}, ${defaultAddress.city} - ${defaultAddress.pincode}`}
              </Text>
            </View>
          );
        })()}

        <View style={styles.footerRow}>
          <View style={styles.upiContainer}>
            <Icon name="wallet-outline" size={14} color="#007AFF" />
            <Text style={styles.upiText} numberOfLines={1}>
              {item.upi_id || 'Not provided'}
            </Text>
          </View>
          <TouchableOpacity 
            style={styles.callButton}
            onPress={() => item.phone && handleCall(item.phone)}>
            <Icon name="call" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={riders}
        renderItem={renderRiderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="bicycle-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No registered riders found</Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  riderCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  riderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  riderName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  riderPhone: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#F2F2F7',
    marginBottom: 12,
  },
  detailsRow: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 16,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  upiContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 12,
  },
  upiText: {
    fontSize: 12,
    color: '#007AFF',
    marginLeft: 6,
    fontWeight: '500',
  },
  callButton: {
    backgroundColor: '#007AFF',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 100,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: '#8E8E93',
  },
  addressContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F8F9FA',
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  addressText: {
    fontSize: 13,
    color: '#666',
    marginLeft: 8,
    flex: 1,
    lineHeight: 18,
  },
});

export default RidersScreen;
