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
import Icon from 'react-native-vector-icons/Ionicons';

interface Store {
  id: string;
  name: string;
  address: string | null;
  banner_url: string | null;
  logo_url: string | null;
  is_active: boolean;
  is_approved: boolean;
  created_at: string;
}

interface StoreSection {
  title: string;
  data: Store[];
}

const StoresScreen = ({ navigation }: any) => {
  const [storeSections, setStoreSections] = useState<StoreSection[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStores = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('stores')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group by created_at date safely
      const groupedData: { [key: string]: Store[] } = {};

      (data as Store[]).forEach(store => {
        // Handle timezone parsing or use simple substring extraction
        // Example "2024-03-31T20:15:00Z" -> "2024-03-31"
        const dateString = store.created_at
          ? new Date(store.created_at).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long', // Use 'long' if you want "March" instead of "Mar"
            year: 'numeric',
          })
          : 'Unknown Date';

        if (!groupedData[dateString]) {
          groupedData[dateString] = [];
        }
        groupedData[dateString].push(store);
      });

      // Convert grouped object to array of sections
      const sections: StoreSection[] = Object.keys(groupedData).map(date => ({
        title: date,
        data: groupedData[date],
      }));

      setStoreSections(sections);
    } catch (error: any) {
      Alert.alert('Error checking stores', error.message);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      fetchStores();
    }, [])
  );

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
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: item.is_active ? '#34C759' : '#FF9500' },
            ]}
          >
            <Text style={styles.statusText}>
              {item.is_active ? 'Active' : 'Pending Verification'}
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
      {loading ? (
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
    backgroundColor: '#F2F2F7',
  },
  listContent: {
    paddingBottom: 32,
  },
  sectionHeader: {
    backgroundColor: '#F2F2F7',
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
});

export default StoresScreen;
