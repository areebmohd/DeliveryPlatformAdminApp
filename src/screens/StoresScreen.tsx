import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  ActivityIndicator,
  Image,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../services/supabaseClient';
import { useAlert } from '../context/AlertContext';
import Icon from 'react-native-vector-icons/Ionicons';
import { Colors, Spacing, borderRadius } from '../theme/colors';

interface Store {
  id: string;
  name: string;
  address: string | null;
  banner_url: string | null;
  logo_url: string | null;
  is_active: boolean;
  is_approved: boolean;
  has_pending_changes: boolean;
  created_at: string;
}

interface StoreSection {
  title: string;
  data: Store[];
}

const StoresScreen = ({ navigation }: any) => {
  const { showAlert } = useAlert();
  const [storeSections, setStoreSections] = useState<StoreSection[]>([]);
  const [allStores, setAllStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'all' | 'unactive' | 'unverified'>('all');

  const processStores = (stores: Store[], filter: string) => {
    const filtered = stores.filter(store => {
      if (filter === 'unactive') return !store.is_active;
      if (filter === 'unverified') return store.has_pending_changes;
      return true;
    });

    const groupedData: { [key: string]: Store[] } = {};

    filtered.forEach(store => {
      const dateString = store.created_at
        ? new Date(store.created_at).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
        : 'Unknown Date';

      if (!groupedData[dateString]) {
        groupedData[dateString] = [];
      }
      groupedData[dateString].push(store);
    });

    return Object.keys(groupedData).map(date => ({
      title: date,
      data: groupedData[date],
    }));
  };

  const fetchStores = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('stores')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setAllStores(data as Store[]);
      const sections = processStores(data as Store[], activeFilter);
      setStoreSections(sections);
    } catch (error: any) {
      showAlert({
        title: 'Error checking stores',
        message: error.message,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      fetchStores();
    }, [])
  );

  useEffect(() => {
    const sections = processStores(allStores, activeFilter);
    setStoreSections(sections);
  }, [activeFilter, allStores]);

  const renderStoreCard = ({ item }: { item: Store }) => (
    <TouchableOpacity
      style={styles.storeCard}
      onPress={() => {
        navigation.navigate('StoreDetails', { store: item });
      }}
    >
      <View style={styles.bannerContainer}>
        {item.banner_url ? (
          <Image source={{ uri: item.banner_url }} style={styles.bannerImage} />
        ) : (
          <View style={styles.bannerPlaceholder}>
            <Icon name="image-outline" size={40} color="#ccc" />
          </View>
        )}
      </View>

      <View style={styles.infoContainer}>
        <View style={styles.textContainer}>
          <Text style={styles.storeName}>{item.name}</Text>
          {item.address && (
            <Text style={styles.storeAddress} numberOfLines={2}>
              {item.address}
            </Text>
          )}
        </View>

        <View style={styles.statusContainer}>
          {item.has_pending_changes && (
            <View style={[styles.statusBadge, { backgroundColor: '#FF3B30', marginBottom: 4 }]}>
              <Text style={styles.statusText}>Unverified Changes</Text>
            </View>
          )}
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: item.is_active ? '#34C759' : '#FF9500' },
            ]}
          >
            <Text style={styles.statusText}>
              {item.is_active ? 'Active' : 'Unactive'}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderSectionHeader = ({
    section: { title },
  }: {
    section: StoreSection;
  }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{title}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.tabBar}>
        {(['all', 'unactive', 'unverified'] as const).map((filter) => (
          <TouchableOpacity
            key={filter}
            style={[
              styles.tab,
              activeFilter === filter && styles.activeTab
            ]}
            onPress={() => setActiveFilter(filter)}
          >
            <Text style={[
              styles.tabTextHeader,
              activeFilter === filter && styles.activeTabTextHeader
            ]}>
              {filter.charAt(0).toUpperCase() + filter.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && allStores.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : (
        <SectionList
          sections={storeSections}
          keyExtractor={item => item.id}
          renderItem={renderStoreCard}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={fetchStores} colors={["#007AFF"]} />
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <Icon name="storefront-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>No stores found</Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  listContent: {
    paddingBottom: 32,
  },
  sectionHeader: {
    backgroundColor: Colors.background,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  sectionHeaderText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#8E8E93',
  },
  storeCard: {
    backgroundColor: '#fff',
    marginBottom: 12,
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  bannerContainer: {
    height: 120,
    backgroundColor: '#E5E5EA',
  },
  bannerImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  bannerPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoContainer: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'center',
  },
  logoContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#fff',
    marginTop: -35, // Pushes logo into banner
  },
  logoImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  logoPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  storeName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  storeAddress: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  statusContainer: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 50,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
    color: '#8E8E93',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.background,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tab: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 25,
    marginRight: 10,
    backgroundColor: Colors.border,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  activeTab: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
    elevation: 4,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  tabTextHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  activeTabTextHeader: {
    color: Colors.white,
  },
});

export default StoresScreen;
