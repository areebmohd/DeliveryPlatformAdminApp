import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import {supabase} from '../services/supabaseClient';
import {useAlert} from '../context/AlertContext';
import Icon from 'react-native-vector-icons/Ionicons';

interface OrderItem {
  id: string;
  product_name: string;
  product_price: number;
  quantity: number;
}

interface Order {
  id: string;
  order_number: string;
  created_at: string;
  status: string;
  total_amount: number;
  payment_method: string;
  payment_status: string;
  store_id: string;
  rider_id: string | null;
  delivery_address_id: string;
  stores: {
    name: string;
    address: string;
  };
  addresses: {
    receiver_name: string;
    address_line: string;
    city: string;
    receiver_phone: string;
  };
  rider?: {
    full_name: string;
    phone: string;
  };
  order_items: OrderItem[];
}

interface OrderSection {
  title: string;
  data: Order[];
}

const DeliveriesScreen = () => {
  const {showAlert} = useAlert();
  const [sections, setSections] = useState<OrderSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const groupOrdersByDate = (orders: Order[]) => {
    const groups: {[key: string]: Order[]} = {};

    orders.forEach((order) => {
      const date = new Date(order.created_at);
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);

      let dateString = '';
      if (date.toDateString() === today.toDateString()) {
        dateString = 'Today';
      } else if (date.toDateString() === yesterday.toDateString()) {
        dateString = 'Yesterday';
      } else {
        dateString = date.toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
      }

      if (!groups[dateString]) {
        groups[dateString] = [];
      }
      groups[dateString].push(order);
    });

    return Object.keys(groups).map((date) => ({
      title: date,
      data: groups[date],
    }));
  };

  const [user, setUser] = useState<any>(null);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      
      const { data: { user: authUser } } = await supabase.auth.getUser();
      setUser(authUser);

      const {data, error} = await supabase
        .from('orders')
        .select(`
          *,
          stores:store_id (*),
          addresses:delivery_address_id (*),
          rider:rider_id (full_name, phone),
          order_items (*)
        `)
        .order('created_at', {ascending: false});

      if (error) {
        showAlert({title: 'Error', message: error.message, type: 'error'});
      } else {
        const groupedData = groupOrdersByDate(data || []);
        setSections(groupedData);
      }
    } catch (error: any) {
      showAlert({title: 'Error', message: error.message || 'An unexpected error occurred', type: 'error'});
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrders();
  };

  const getStatusLabel = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending_verification':
        return 'Pending Approval';
      case 'accepted':
      case 'preparing':
      case 'ready':
        return 'Ready for Pickup';
      case 'picked_up':
        return 'Out for Delivery';
      case 'delivered':
        return 'Delivered';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status.replace(/_/g, ' ');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending_verification':
        return '#95a5a6'; // Gray
      case 'accepted':
      case 'preparing':
      case 'ready':
        return '#f39c12'; // Orange
      case 'picked_up':
        return '#3498db'; // Blue
      case 'delivered':
        return '#27ae60'; // Green
      case 'cancelled':
        return '#e74c3c'; // Red
      default:
        return '#7f8c8d';
    }
  };

  const renderOrderItem = ({item}: {item: Order}) => (
    <View style={styles.orderCard}>
      {/* Header: Order Info & Status */}
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.orderNumber}>Order #{item.order_number}</Text>
          <Text style={styles.orderTime}>
            {new Date(item.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            {backgroundColor: getStatusColor(item.status)},
          ]}>
          <Text style={styles.statusText}>{getStatusLabel(item.status)}</Text>
        </View>
      </View>

      <View style={styles.divider} />

      {/* Pickup Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Icon name="storefront" size={16} color="#007AFF" />
          <Text style={styles.sectionTitle}>Pickup from Store</Text>
        </View>
        <Text style={styles.storeName}>{item.stores?.name || 'Unknown Store'}</Text>
        <Text style={styles.addressText}>{item.stores?.address || 'Address not available'}</Text>
      </View>

      <View style={styles.innerDivider} />

      {/* Delivery Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Icon name="location" size={16} color="#27ae60" />
          <Text style={styles.sectionTitle}>Deliver to Customer</Text>
        </View>
        <Text style={styles.customerName}>
          {Array.isArray(item.addresses) ? item.addresses[0]?.receiver_name : item.addresses?.receiver_name || 'Customer'}
        </Text>
        <Text style={styles.addressText}>
          {Array.isArray(item.addresses) ? 
            `${item.addresses[0]?.address_line}, ${item.addresses[0]?.city}` : 
            `${item.addresses?.address_line || 'No address'}, ${item.addresses?.city || ''}`}
        </Text>
        <Text style={styles.phoneText}>
          <Icon name="call" size={14} color="#007AFF" /> {Array.isArray(item.addresses) ? item.addresses[0]?.receiver_phone : item.addresses?.receiver_phone}
        </Text>
      </View>

      <View style={styles.divider} />

      {/* Rider Section */}
      <View style={styles.riderSection}>
        {item.rider ? (
          <View style={styles.riderInfo}>
            <View style={styles.riderAvatar}>
               <Icon name="bicycle" size={20} color="#666" />
            </View>
            <View>
              <Text style={styles.riderLabel}>Assigned Rider</Text>
              <Text style={styles.riderName}>
                {Array.isArray(item.rider) ? item.rider[0]?.full_name : item.rider.full_name}
              </Text>
              <Text style={styles.riderPhone}>
                {Array.isArray(item.rider) ? item.rider[0]?.phone : item.rider.phone}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.unassignedRider}>
            <Icon name="alert-circle-outline" size={20} color="#f39c12" />
            <Text style={styles.unassignedText}>Waiting for rider assignment</Text>
          </View>
        )}
      </View>

      <View style={styles.cardFooter}>
         <View style={styles.paymentMethod}>
            <Text style={styles.paymentLabel}>Payment Details</Text>
            <Text style={[
              styles.paymentValue,
              { color: item.payment_status === 'verified' ? '#27ae60' : '#f39c12' }
            ]}>
              {item.payment_method === 'pay_now' ? 'Pay Now' : 'Pay on Delivery'} • {item.payment_status === 'verified' ? 'Received' : 'Not Received'}
            </Text>
         </View>
         <Text style={styles.totalAmount}>₹{item.total_amount.toFixed(2)}</Text>
      </View>
    </View>
  );

  const renderSectionHeader = ({section: {title}}: {section: {title: string}}) => (
    <View style={styles.sectionHeaderBox}>
      <Text style={styles.sectionHeaderText}>{title}</Text>
    </View>
  );

  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        renderItem={renderOrderItem}
        renderSectionHeader={renderSectionHeader}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.centered}>
            <Icon name="bicycle-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No deliveries found</Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  sectionHeaderBox: {
    backgroundColor: '#f8f9fa',
    paddingVertical: 12,
    marginBottom: 8,
  },
  sectionHeaderText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  orderNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1c1c1e',
  },
  orderTime: {
    fontSize: 12,
    color: '#8e8e93',
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  divider: {
    height: 1,
    backgroundColor: '#f2f2f7',
    marginVertical: 16,
  },
  innerDivider: {
    height: 1,
    backgroundColor: '#f2f2f7',
    marginVertical: 12,
    marginHorizontal: -16,
    opacity: 0.5,
  },
  section: {
    marginTop: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#8e8e93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  storeName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1c1c1e',
  },
  customerName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1c1c1e',
  },
  addressText: {
    fontSize: 14,
    color: '#3a3a3c',
    marginTop: 4,
    lineHeight: 20,
  },
  phoneText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '700',
    marginTop: 8,
  },
  riderSection: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#f2f2f7',
  },
  riderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  riderAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e5e5ea',
    justifyContent: 'center',
    alignItems: 'center',
  },
  riderLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#8e8e93',
    textTransform: 'uppercase',
  },
  riderName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1c1c1e',
  },
  riderPhone: {
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '600',
  },
  unassignedRider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  unassignedText: {
    fontSize: 13,
    color: '#f39c12',
    fontWeight: '700',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  paymentMethod: {
    flex: 1,
  },
  paymentLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#8e8e93',
    textTransform: 'uppercase',
  },
  paymentValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3a3a3c',
    marginTop: 2,
  },
  totalAmount: {
    fontSize: 22,
    fontWeight: '900',
    color: '#1c1c1e',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 12,
    fontWeight: '600',
  },
});

export default DeliveriesScreen;
