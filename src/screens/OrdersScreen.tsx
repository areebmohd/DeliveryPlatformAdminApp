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
  Modal,
  ScrollView,
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
  rider_delivery_fee?: number;
  platform_fee?: number;
  helper_fee?: number;
  store_delivery_fees?: Record<string, number>;
  transport_type?: string;
}

interface OrderSection {
  title: string;
  data: Order[];
}

export const getItemTotals = (product: any, allStoreItems: any[], storeOffer: any) => {
  const originalTotal = product.product_price * product.quantity;
  if (!storeOffer) return { original: originalTotal, discounted: originalTotal };

  let discountedTotal = originalTotal;

  switch (storeOffer.type) {
    case 'discount':
      discountedTotal = originalTotal * (1 - storeOffer.amount / 100);
      break;
    case 'free_cash':
      const totalStoreAmount = allStoreItems.reduce((acc: any, curr: any) => acc + curr.product_price * curr.quantity, 0);
      const proportion = (product.product_price * product.quantity) / (totalStoreAmount || 1);
      discountedTotal = originalTotal - (storeOffer.amount * proportion);
      break;
    case 'cheap_product':
      if (storeOffer.conditions?.product_ids?.includes(product.product_id || product.id)) {
        discountedTotal = originalTotal * (1 - storeOffer.amount / 100);
      }
      break;
    case 'fixed_price':
      if (storeOffer.reward_data?.product_ids?.includes(product.product_id || product.id)) {
        discountedTotal = storeOffer.amount * product.quantity;
      }
      break;
    case 'combo':
      if (storeOffer.reward_data?.product_ids?.includes(product.product_id || product.id)) {
        const comboItems = allStoreItems.filter((i: any) => storeOffer.reward_data?.product_ids?.includes(i.product_id || i.id));
        const comboBaseValue = comboItems.reduce((acc: any, curr: any) => acc + curr.product_price, 0);
        const comboDiscount = Math.max(0, comboBaseValue - storeOffer.amount);
        const itemProportion = product.product_price / (comboBaseValue || 1);
        discountedTotal = originalTotal - (comboDiscount * itemProportion);
      }
      break;
    case 'free_product':
      if (product.selected_options?.gift === 'true') {
        discountedTotal = 0;
      }
      break;
  }

  return { 
    original: originalTotal, 
    discounted: Math.max(0, discountedTotal)
  };
};

export const getRiderDeliveryFee = (order: {
  rider_delivery_fee?: number | string | null;
  delivery_fee?: number | string | null;
}) => {
  const riderFee = Number(order.rider_delivery_fee ?? 0);
  if (Number.isFinite(riderFee) && riderFee > 0) return riderFee;

  const customerFee = Number(order.delivery_fee ?? 0);
  return Number.isFinite(customerFee) ? customerFee : 0;
};

export const getSponsoredDeliveryFee = (order: {
  store_delivery_fees?: Record<string, number> | null;
}) => {
  if (!order.store_delivery_fees) return 0;

  return Object.values(order.store_delivery_fees).reduce((sum, fee) => {
    const value = Number(fee ?? 0);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
};

export const getDisplayPlatformFee = (order: {
  platform_fee?: number | string | null;
  rider_delivery_fee?: number | string | null;
  delivery_fee?: number | string | null;
  store_delivery_fees?: Record<string, number> | null;
}) => {
  const platformFee = Number(order.platform_fee ?? 0);
  const basePlatformFee = Number.isFinite(platformFee) ? platformFee : 0;
  const sponsoredDeliveryFee = getSponsoredDeliveryFee(order);
  const riderDeliveryFee = getRiderDeliveryFee(order);

  if (sponsoredDeliveryFee <= 0) return basePlatformFee;

  return basePlatformFee + Math.max(0, sponsoredDeliveryFee - riderDeliveryFee);
};

const OrdersScreen = () => {
  const {showAlert, showToast} = useAlert();
  const [sections, setSections] = useState<OrderSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [breakdownModal, setBreakdownModal] = useState<{ visible: boolean; order: any }>({ 
    visible: false, 
    order: null 
  });

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
            const deliveryOffer = item.applied_offers?.[`${storeId}_delivery`];
            
            return (
              <View key={storeId} style={sIdx > 0 ? {marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f0f0f0'} : {}}>
                <View style={styles.storeContainer}>
                  <Icon name="storefront-outline" size={14} color="#666" />
                  <Text style={[styles.storeName, {fontSize: 12}]}>{storeData.name}</Text>
                </View>
                
                {storeData.items.map((product) => {
                  const { original, discounted } = getItemTotals(product, storeData.items, storeOffer);

                  return (
                    <View key={product.id} style={styles.productRow}>
                      <View style={{flex: 1}}>
                        <Text style={styles.productName}>
                          {product.product_name}
                          {product.selected_options && Object.keys(product.selected_options).length > 0 && (
                            <Text style={styles.itemOptionsText}>
                              {` (${Object.entries(product.selected_options)
                                .map(([k, v]) => k === 'gift' ? 'Gift' : `${v}`)
                                .join(', ')})`}
                            </Text>
                          )}
                          {' '}x{product.quantity}
                        </Text>
                      </View>
                      <View style={{flexDirection: 'row', alignItems: 'center'}}>
                        {discounted < original ? (
                          <>
                            <Text style={[styles.productPrice, {color: '#27ae60', fontWeight: 'bold'}]}>
                              ₹{discounted.toFixed(2)}
                            </Text>
                            <Text style={[styles.productPrice, {textDecorationLine: 'line-through', color: '#999', fontSize: 11, marginLeft: 6}]}>
                              ₹{original.toFixed(2)}
                            </Text>
                          </>
                        ) : (
                          <Text style={styles.productPrice}>
                            ₹{original.toFixed(2)}
                          </Text>
                        )}
                      </View>
                    </View>
                  );
                })}

                {/* Offer for this store */}
                {(storeOffer || deliveryOffer) && (
                  <View style={{marginTop: 8, gap: 8}}>
                    {storeOffer && (
                      <View style={[styles.offerBadge, {marginBottom: 0, padding: 8}]}>
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
                    {deliveryOffer && (
                      <View style={[styles.offerBadge, {backgroundColor: '#fffbeb', borderColor: '#fde68a', marginBottom: 0, padding: 8}]}>
                        <View style={[styles.offerIconCircle, {width: 20, height: 20, backgroundColor: '#fef3c7'}]}>
                          <Icon name="truck-outline" size={12} color="#d97706" />
                        </View>
                        <View style={{flex: 1}}>
                          <Text style={[styles.offerName, {fontSize: 12, color: '#d97706'}]}>{deliveryOffer.name || 'Free Delivery'}</Text>
                          <Text style={[styles.offerDescription, {fontSize: 10, color: '#b45309'}]}>₹0 Delivery fee</Text>
                        </View>
                      </View>
                    )}
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
            
            const originalTotal = originalItemsTotal + 
                                 getRiderDeliveryFee(item) + 
                                 Number(item.platform_fee || 0) + 
                                 Number(item.helper_fee || 0) + 
                                 getSponsoredDeliveryFee(item);

            if (Math.abs(originalTotal - item.total_amount) > 1) {
              return (
                <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.totalAmount}>₹{Number(item.total_amount).toFixed(2)}</Text>
                <TouchableOpacity 
                   onPress={() => setBreakdownModal({ visible: true, order: { ...item, delivery_fee: getRiderDeliveryFee(item) } })}
                   style={{ marginTop: 4 }}
                >
                   <Text style={styles.viewSharesText}>View Shares</Text>
                </TouchableOpacity>
                </View>
              );
            }

            return <Text style={styles.totalAmount}>Rs {Number(item.total_amount).toFixed(2)}</Text>;
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

      <Modal
        visible={breakdownModal.visible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setBreakdownModal({ ...breakdownModal, visible: false })}
      >
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setBreakdownModal({ ...breakdownModal, visible: false })}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Order Breakdown</Text>
              <TouchableOpacity onPress={() => setBreakdownModal({ ...breakdownModal, visible: false })}>
                <Icon name="close-outline" size={24} color="#000" />
              </TouchableOpacity>
            </View>

            {breakdownModal.order && (
              <ScrollView style={styles.modalBody}>
                <View style={styles.breakdownSection}>
                  <Text style={styles.breakdownSectionTitle}>Store Shares</Text>
                  {(() => {
                    const storeShares: { [key: string]: number } = {};
                    const deliverySponsored: { [key: string]: number } = {};
                    
                    breakdownModal.order.order_items.forEach((oi: any) => {
                      const sId = oi.products?.store_id || breakdownModal.order.store_id || 'unknown';
                      const sName = oi.products?.stores?.name || breakdownModal.order.stores?.name || 'Store';
                      
                      const storeOffer = breakdownModal.order.applied_offers?.[sId];
                      const allStoreItems = breakdownModal.order.order_items.filter((i: any) => (i.products?.store_id || breakdownModal.order.store_id) === sId);
                      
                      const { discounted } = getItemTotals(oi, allStoreItems, storeOffer);

                      if (!storeShares[sName]) storeShares[sName] = 0;
                      storeShares[sName] += discounted;

                      if (deliverySponsored[sName] === undefined) {
                        const deliveryFeePaidByStore = Number(breakdownModal.order.store_delivery_fees?.[sId] || 0);
                        deliverySponsored[sName] = deliveryFeePaidByStore;
                        storeShares[sName] -= deliveryFeePaidByStore;
                      }
                    });

                    return (
                      <>
                        {Object.entries(storeShares).map(([name, amount], idx) => (
                          <View key={idx} style={styles.breakdownRow}>
                            <Text style={styles.breakdownLabel}>{name}</Text>
                            <Text style={styles.breakdownValue}>₹{amount.toFixed(2)}</Text>
                          </View>
                        ))}
                        {Object.entries(deliverySponsored).filter(([_, amt]) => amt > 0).map(([name, amount], idx) => (
                          <View key={`del-${idx}`} style={styles.breakdownRow}>
                            <Text style={styles.breakdownLabel}>{name} Sponsored Delivery</Text>
                            <Text style={[styles.breakdownValue, { color: '#e74c3c' }]}>-₹{amount.toFixed(2)}</Text>
                          </View>
                        ))}
                      </>
                    );
                  })()}
                </View>

                <View style={styles.breakdownSection}>
                  <Text style={styles.breakdownSectionTitle}>Fees & Services</Text>
                  {(getRiderDeliveryFee(breakdownModal.order) > 0) && (
                    <View style={styles.breakdownRow}>
                      <Text style={styles.breakdownLabel}>Delivery Fee</Text>
                      <Text style={styles.breakdownValue}>₹{Number(breakdownModal.order.delivery_fee).toFixed(2)}</Text>
                    </View>
                  )}
                  {(() => {
                    const displayPlatformFee = getDisplayPlatformFee(breakdownModal.order);
                    return displayPlatformFee > 0 ? (
                      <View style={styles.breakdownRow}>
                        <Text style={styles.breakdownLabel}>Platform Fee</Text>
                        <Text style={styles.breakdownValue}>₹{displayPlatformFee.toFixed(2)}</Text>
                      </View>
                    ) : null;
                  })()}
                  {(breakdownModal.order.helper_fee > 0) && (
                    <View style={styles.breakdownRow}>
                      <Text style={styles.breakdownLabel}>Helper Fee</Text>
                      <Text style={styles.breakdownValue}>₹{Number(breakdownModal.order.helper_fee).toFixed(2)}</Text>
                    </View>
                  )}
                </View>

                <View style={[styles.breakdownRow, styles.grandTotalRowModal]}>
                  <Text style={styles.grandTotalLabelModal}>Grand Total</Text>
                  <Text style={styles.grandTotalValueModal}>₹{Number(breakdownModal.order.total_amount).toFixed(2)}</Text>
                </View>
              </ScrollView>
            )}

            <TouchableOpacity 
              style={styles.closeBtnModal}
              onPress={() => setBreakdownModal({ ...breakdownModal, visible: false })}
            >
              <Text style={styles.closeBtnTextModal}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
  viewSharesText: {
    fontSize: 11,
    color: '#007AFF',
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingTop: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  modalBody: {
    marginBottom: 20,
  },
  breakdownSection: {
    marginBottom: 24,
  },
  breakdownSectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  breakdownLabel: {
    fontSize: 14,
    color: '#444',
    fontWeight: '600',
  },
  breakdownValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '800',
  },
  grandTotalRowModal: {
    borderTopWidth: 2,
    borderTopColor: '#f0f0f0',
    paddingTop: 16,
    marginTop: 8,
  },
  grandTotalLabelModal: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#000',
  },
  grandTotalValueModal: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  closeBtnModal: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#007AFF',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  closeBtnTextModal: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
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
