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
  Switch,
} from 'react-native';
import {supabase} from '../services/supabaseClient';
import {useAlert} from '../context/AlertContext';
import Icon from 'react-native-vector-icons/Ionicons';

interface OrderItem {
  id: string;
  product_name: string;
  product_price: number;
  quantity: number;
  selected_options?: {[key: string]: string};
  products?: {
    store_id: string;
    stores?: {
      name: string;
      id: string;
    };
  };
}

interface Order {
  id: string;
  order_number: string;
  created_at: string;
  status: string;
  total_amount: number;
  payment_method: string;
  payment_status: string;
  utr_number?: string;
  store_id: string;
  stores: {
    id: string;
    name: string;
  };
  order_items: OrderItem[];
  applied_offers?: any;
  delivery_fee?: number;
  platform_fee?: number;
  helper_fee?: number;
  transport_type?: string;
}

interface OrderSection {
  title: string;
  data: Order[];
}

const OrdersScreen = () => {
  const {showAlert, showToast} = useAlert();
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


  const fetchOrders = async () => {
    try {
      console.log('Fetching orders...');
      const {data, error} = await supabase
        .from('orders')
        .select('*, stores(id, name), order_items(*, selected_options, products(id, store_id, stores(id, name))), applied_offers')
        .order('created_at', {ascending: false});

      if (error) {
        console.error('Supabase error fetching orders:', error);
        showAlert({title: 'Error', message: error.message, type: 'error'});
      } else {
        console.log('Fetched orders count:', data?.length || 0);
        const groupedData = groupOrdersByDate(data || []);
        setSections(groupedData);
      }
    } catch (error: any) {
      console.error('Unexpected error in fetchOrders:', error);
      showAlert({title: 'Error', message: error.message || 'An unexpected error occurred', type: 'error'});
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchOrders();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrders();
  };

  // ... (getStatusColor stays the same)
  const getStatusLabel = (status: string) => {
    switch (status.toLowerCase()) {
      case 'waiting_for_pickup':
        return 'Waiting for Pickup';
      case 'picked_up':
        return 'Picked Up';
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
      case 'waiting_for_pickup':
        return '#f39c12'; // Orange for waiting
      case 'picked_up':
        return '#3498db'; // Blue for picked up
      case 'delivered':
        return '#27ae60'; // Green for delivered
      case 'cancelled':
        return '#e74c3c'; // Red for cancelled
      default:
        return '#7f8c8d';
    }
  };

  const handleVerifyPayment = async (orderId: string, orderNumber: string) => {
    showAlert({
      title: 'Confirm Payment',
      message: `Are you sure you have received the payment for order #${orderNumber}?`,
      type: 'warning',
      showCancel: true,
      primaryAction: {
        text: 'Yes, Received',
        onPress: async () => {
          try {
            const {error} = await supabase
              .from('orders')
              .update({payment_status: 'verified'})
              .eq('id', orderId);

            if (error) {
              showAlert({title: 'Error', message: error.message, type: 'error'});
            } else {
              showToast('Payment verified', 'success');
              fetchOrders(); // Refresh the list
            }
          } catch (error: any) {
            showAlert({title: 'Error', message: error.message || 'Failed to update payment status', type: 'error'});
          }
        },
      },
    });
  };

  const renderOrderItem = ({item}: {item: Order}) => (
    <View style={styles.orderCard}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.orderNumber}>#{item.order_number}</Text>
          <Text style={styles.orderTime}>
            {new Date(item.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
            {item.transport_type && ` • ${item.transport_type === 'heavy' ? 'Truck' : 'Bike'}`}
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

      <View style={styles.itemsList}>
        {(() => {
          // Group items by store
          const itemsByStore: {[key: string]: {name: string, items: OrderItem[]}} = {};
          
          item.order_items.forEach((oi: any) => {
            const storeId = oi.products?.store_id || item.stores?.id || item.store_id || 'unknown';
            const storeName = oi.products?.stores?.name || item.stores?.name || 'Unknown Store';
            
            if (!itemsByStore[storeId]) {
              itemsByStore[storeId] = { name: storeName, items: [] };
            }
            itemsByStore[storeId].items.push(oi);
          });

          return Object.entries(itemsByStore).map(([storeId, storeData], sIdx) => {
            const storeOffer = item.applied_offers?.[storeId];
            
            return (
              <View key={storeId} style={sIdx > 0 ? {marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f0f0f0'} : {}}>
                <View style={styles.storeContainer}>
                  <Icon name="storefront-outline" size={14} color="#666" />
                  <Text style={[styles.storeName, {fontSize: 12}]}>{storeData.name}</Text>
                </View>
                
                {storeData.items.map((product) => {
                  const hasStoreWideDiscount = storeOffer && (storeOffer.type === 'discount' || storeOffer.type === 'free_cash');
                  
                  let discountedUnitPrice = product.product_price;
                  if (storeOffer?.type === 'discount') {
                    discountedUnitPrice = product.product_price * (1 - storeOffer.amount / 100);
                  } else if (storeOffer?.type === 'free_cash') {
                    const totalStoreAmount = storeData.items
                      .reduce((acc: number, curr: any) => acc + curr.product_price * curr.quantity, 0);
                    const proportion = (product.product_price * product.quantity) / (totalStoreAmount || 1);
                    discountedUnitPrice = (product.product_price * product.quantity - storeOffer.amount * proportion) / product.quantity;
                  }

                  return (
                    <View key={product.id} style={styles.productRow}>
                      <View style={{flex: 1}}>
                        <Text style={styles.productName}>
                          {product.product_name}
                          {product.selected_options && Object.keys(product.selected_options).length > 0 && (
                            <Text style={styles.itemOptionsText}>
                              {` (${Object.entries(product.selected_options)
                                .map(([k, v]) => `${v}`)
                                .join(', ')})`}
                            </Text>
                          )}
                          {' '}x{product.quantity}
                        </Text>
                      </View>
                      <View style={{flexDirection: 'row', alignItems: 'center'}}>
                        {hasStoreWideDiscount ? (
                          <>
                            <Text style={[styles.productPrice, {color: '#27ae60', fontWeight: 'bold'}]}>
                              ₹{(discountedUnitPrice * product.quantity).toFixed(2)}
                            </Text>
                            <Text style={[styles.productPrice, {textDecorationLine: 'line-through', color: '#999', fontSize: 11, marginLeft: 6}]}>
                              ₹{(product.product_price * product.quantity).toFixed(2)}
                            </Text>
                          </>
                        ) : (
                          <Text style={styles.productPrice}>
                            ₹{(product.product_price * product.quantity).toFixed(2)}
                          </Text>
                        )}
                      </View>
                    </View>
                  );
                })}

                {/* Offer for this store */}
                {storeOffer && (
                  <View style={[styles.offerBadge, {marginTop: 8, marginBottom: 0, padding: 8}]}>
                    <View style={[styles.offerIconCircle, {width: 20, height: 20}]}>
                      <Icon name="pricetag-outline" size={12} color="#27ae60" />
                    </View>
                    <View style={{flex: 1}}>
                      <Text style={[styles.offerName, {fontSize: 12}]}>{storeOffer.name || (storeOffer.type === 'free_delivery' ? 'Free Delivery' : 'Special Offer')}</Text>
                      <Text style={[styles.offerDescription, {fontSize: 10}]}>
                        {(() => {
                          const { type, amount, name } = storeOffer;
                          switch (type) {
                            case 'discount': return `${amount}% Instant Discount on Total Items Price`;
                            case 'free_delivery': return '₹0 Delivery fee';
                            case 'free_product': return `Get Free ${name || 'Gift Item'}`;
                            case 'cheap_product': return `${amount}% Instant Discount on ${name || 'Some Items'}`;
                            case 'combo': return `${name || 'Items'} at Only ₹${amount}`;
                            case 'free_cash': return `₹${amount} Free Cash amount`;
                            default: return 'Special store offer';
                          }
                        })()}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            );
          });
        })()}
      </View>

      <View style={styles.divider} />

      <View style={styles.cardFooter}>
        <View>
          <View style={styles.paymentStatusRow}>
            <Text style={styles.paymentInfo}>
              {item.payment_method.replace(/_/g, ' ')}
            </Text>
            {item.payment_status === 'verified' ? (
              <View style={styles.verifiedRow}>
                <Icon name="checkmark-circle" size={14} color="#27ae60" />
                <Text style={styles.verifiedText}>Payment Received</Text>
              </View>
            ) : (
              <Text style={styles.paymentPendingText}> • {item.payment_status}</Text>
            )}
          </View>
          {item.utr_number && item.payment_method === 'pay_online' && (
            <View style={styles.utrRow}>
              <Text style={styles.utrLabel}>UTR:</Text>
              <Text style={styles.utrValue}>{item.utr_number}</Text>
            </View>
          )}
        </View>
        <View style={{alignItems: 'flex-end'}}>
          {(() => {
            const hasAnyOffer = item.applied_offers && Object.keys(item.applied_offers).length > 0;
            if (!hasAnyOffer) {
              return <Text style={styles.totalAmount}>₹{Number(item.total_amount).toFixed(2)}</Text>;
            }

            // Calculate original total (items + fees)
            const originalItemsTotal = item.order_items.reduce((acc, oi) => acc + (oi.product_price * oi.quantity), 0);
            
            // Check for free delivery offers to add back the standard fee
            const hasFreeDelivery = Object.values(item.applied_offers).some((offer: any) => offer.type === 'free_delivery');
            
            const originalTotal = originalItemsTotal + 
                                 Number(item.delivery_fee || 0) + 
                                 Number(item.platform_fee || 0) + 
                                 Number(item.helper_fee || 0) + 
                                 (hasFreeDelivery ? 25 : 0);

            if (Math.abs(originalTotal - item.total_amount) > 1) {
              return (
                <View style={{flexDirection: 'row', alignItems: 'baseline'}}>
                  <Text style={styles.totalAmount}>₹{Number(item.total_amount).toFixed(2)}</Text>
                  <Text style={[styles.totalAmount, {textDecorationLine: 'line-through', color: '#999', fontSize: 14, marginLeft: 6}]}>
                    ₹{originalTotal.toFixed(2)}
                  </Text>
                </View>
              );
            }
            
            return <Text style={styles.totalAmount}>₹{Number(item.total_amount).toFixed(2)}</Text>;
          })()}
        </View>
      </View>

      {item.payment_status !== 'verified' &&
        !(
          item.status === 'cancelled' && item.payment_method === 'pay_on_delivery'
        ) && (
          <TouchableOpacity
            style={styles.verifyButton}
            onPress={() => handleVerifyPayment(item.id, item.order_number)}>
            <Text style={styles.verifyButtonText}>Payment Received</Text>
          </TouchableOpacity>
        )}
    </View>
  );

  const renderSectionHeader = ({section: {title}}: {section: {title: string}}) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{title}</Text>
    </View>
  );

  if (loading) {
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
            <Text style={styles.emptyText}>No orders found</Text>
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
    marginTop: 50,
  },
  sectionHeader: {
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
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  orderNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  orderTime: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  divider: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 12,
  },
  storeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  storeName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#444',
    marginLeft: 6,
  },
  itemsList: {
    marginBottom: 4,
  },
  productRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  productName: {
    fontSize: 13,
    color: '#333',
    fontWeight: '700',
    flex: 1,
  },
  itemOptionsText: {
    fontSize: 11,
    color: '#007AFF',
    fontWeight: '600',
  },
  productPrice: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentInfo: {
    fontSize: 12,
    color: '#777',
    textTransform: 'capitalize',
  },
  paymentStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 4,
  },
  verifiedText: {
    fontSize: 12,
    color: '#27ae60',
    fontWeight: 'bold',
    marginLeft: 4,
  },
  paymentPendingText: {
    fontSize: 12,
    color: '#777',
    textTransform: 'capitalize',
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  verifyButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 16,
    alignItems: 'center',
  },
  verifyButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 5,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  toggleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  toggleTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#333',
  },
  toggleSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 1,
  },
  utrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    backgroundColor: '#f0f7ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  utrLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#007AFF',
    marginRight: 4,
  },
  utrValue: {
    fontSize: 11,
    color: '#333',
    fontWeight: '600',
  },
  offersContainer: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 12,
  },
  offersTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#27ae60',
    letterSpacing: 1,
    marginBottom: 8,
  },
  offerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dcfce7',
    marginBottom: 6,
  },
  offerIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#dcfce7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  offerName: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#166534',
  },
  offerDescription: {
    fontSize: 11,
    color: '#15803d',
    marginTop: 1,
  },
});


export default OrdersScreen;
