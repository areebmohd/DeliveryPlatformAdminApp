import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  Dimensions,
  Linking,
} from 'react-native';
import { supabase } from '../services/supabaseClient';
import { useAlert } from '../context/AlertContext';
import Icon from 'react-native-vector-icons/Ionicons';
import { Colors } from '../theme/colors';

const { width } = Dimensions.get('window');

type PayoutType = 'store' | 'rider' | 'customer';

const getRiderDeliveryFee = (order: {
  rider_delivery_fee?: number | string | null;
  delivery_fee?: number | string | null;
}) => {
  const riderFee = Number(order.rider_delivery_fee ?? 0);
  if (Number.isFinite(riderFee) && riderFee > 0) return riderFee;

  const customerFee = Number(order.delivery_fee ?? 0);
  return Number.isFinite(customerFee) ? customerFee : 0;
};

const PaymentsScreen = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<PayoutType>('store');
  const [payouts, setPayouts] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const { showAlert, showToast } = useAlert();

  const fetchPayouts = async () => {
    try {
      setLoading(true);
      const { data: payoutsData, error: payoutsError } = await supabase
        .from('payouts')
        .select(`
          *,
          order:order_id (order_number)
        `)
        .eq('recipient_type', activeTab)
        .order('payment_date', { ascending: false });

      if (payoutsError) throw payoutsError;

      if (!payoutsData || payoutsData.length === 0) {
        setPayouts([]);
        return;
      }

      const recipientIds = [...new Set(payoutsData.map(p => p.recipient_id))];
      let enrichedPayouts = [...payoutsData];

      if (activeTab === 'store') {
        const { data: stores } = await supabase
          .from('stores')
          .select('id, name, upi_id, phone')
          .in('id', recipientIds);
        
        enrichedPayouts = payoutsData.map(p => ({
          ...p,
          recipient: stores?.find(s => s.id === p.recipient_id)
        }));
      } else {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, upi_id, phone')
          .in('id', recipientIds);
        
        enrichedPayouts = payoutsData.map(p => ({
          ...p,
          recipient: profiles?.find(pr => pr.id === p.recipient_id)
        }));
      }

      setPayouts(enrichedPayouts);
    } catch (error: any) {
      console.error('Error fetching payouts:', error);
      showToast('Error fetching payouts', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchPayouts();
  }, [activeTab]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPayouts();
  };

  const triggerConfirmation = (group: any, utr: string = 'PAID_ONLINE') => {
    showAlert({
      title: 'Payment Confirmation',
      message: `Was the payment of ₹${group.totalAmount.toFixed(2)} completed successfully?`,
      type: 'info',
      showCancel: true,
      cancelText: 'No',
      primaryAction: {
        text: 'Yes, Completed',
        onPress: async () => {
          try {
            const { error } = await supabase
              .from('payouts')
              .update({ 
                  status: 'sent', 
                  upi_transaction_id: utr
              })
              .in('id', group.ids);

            if (error) throw error;
            showToast('Payment settled and marked as Paid!', 'success');
            fetchPayouts();
          } catch (e: any) {
            showToast('Error: ' + e.message, 'error');
          }
        },
      },
    });
  };

  const handleUpiPayment = (group: any) => {
    const recipient = group.recipient;

    if (!recipient?.upi_id) {
      showAlert({ title: 'Missing UPI ID', message: 'Recipient has not linked a UPI ID.', type: 'error' });
      return;
    }

    const recipientName = recipient.name || recipient.full_name || 'Recipient';
    const note = activeTab === 'customer' 
      ? `${recipientName} - Order #${group.orderRef}` 
      : `${recipientName} - ${group.paymentDate}`;

    const upiUrl = `upi://pay?pa=${recipient.upi_id}&pn=${encodeURIComponent(recipientName)}&am=${group.totalAmount}&cu=INR&tn=${encodeURIComponent(note)}&tr=${group.ids[0]}`;

    Linking.openURL(upiUrl).catch(() => {
      showAlert({ title: 'Error', message: 'Could not open any UPI app.', type: 'error' });
    });

    // Preparation for confirmation when they return
    setTimeout(() => {
      triggerConfirmation(group);
    }, 1500);
  };

  const handleCashPayment = (group: any) => {
    showAlert({
      title: 'Confirm Cash Payment',
      message: `Are you sure you want to mark ₹${group.totalAmount.toFixed(2)} as paid via Cash?`,
      type: 'warning',
      primaryAction: {
        text: 'Mark as Paid',
        onPress: async () => {
          try {
            const { error } = await supabase
              .from('payouts')
              .update({ 
                status: 'sent',
                upi_transaction_id: 'PAID_CASH'
              })
              .in('id', group.ids);

            if (error) throw error;
            showToast('Marked as Paid via Cash!', 'success');
            fetchPayouts();
          } catch (e: any) {
            showToast('Error: ' + e.message, 'error');
          }
        }
      },
      showCancel: true,
      cancelText: 'Cancel'
    });
  };

  const generatePayouts = async () => {
    try {
      setIsGenerating(true);
      const today = new Date().toLocaleDateString('en-CA');

      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select(`
          id, 
          status, 
          payment_method, 
          total_amount, 
          delivery_fee, 
          rider_delivery_fee,
          rider_id,
          customer_id,
          store_id,
          created_at,
          order_items(product_price, quantity)
        `)
        .or(`status.eq.delivered,status.eq.cancelled`);

      if (ordersError) throw ordersError;

      const newPayouts: any[] = [];
      for (const order of orders) {
        const orderDate = new Date(order.created_at).toLocaleDateString('en-CA');

        if (order.status === 'delivered' && order.store_id) {
          let storeAmount = 0;
          order.order_items.forEach((item: any) => {
            storeAmount += (item.product_price * item.quantity);
          });

          newPayouts.push({
            recipient_id: order.store_id,
            recipient_type: 'store',
            order_id: order.id,
            amount: storeAmount,
            payment_date: orderDate,
            status: 'pending'
          });

          if (order.rider_id) {
            newPayouts.push({
              recipient_id: order.rider_id,
              recipient_type: 'rider',
              order_id: order.id,
              amount: getRiderDeliveryFee(order),
              payment_date: orderDate,
              status: 'pending'
            });
          }
        }
        
        if (order.status === 'cancelled' && order.payment_method === 'pay_online' && order.customer_id) {
            newPayouts.push({
                recipient_id: order.customer_id,
                recipient_type: 'customer',
                order_id: order.id,
                amount: order.total_amount,
                payment_date: orderDate,
                status: 'pending'
            });
        }
      }

      const { data: existingPayouts } = await supabase.from('payouts').select('order_id, recipient_id');
      const filteredNewPayouts = newPayouts.filter(np => 
        !existingPayouts?.some(ep => ep.order_id === np.order_id && ep.recipient_id === np.recipient_id)
      );

      if (filteredNewPayouts.length > 0) {
        const { error: insertError } = await supabase.from('payouts').insert(filteredNewPayouts);
        if (insertError) throw insertError;
        showToast(`Sync complete: ${filteredNewPayouts.length} entries added.`, 'success');
      } else {
        showToast('System is up to date.', 'info');
      }
      
      fetchPayouts();
    } catch (e: any) {
        showAlert({ title: 'Error', message: e.message, type: 'error' });
    } finally {
        setIsGenerating(false);
    }
  };

  const getProcessedData = () => {
    const today = new Date().toLocaleDateString('en-CA');
    
    if (activeTab === 'customer') {
      return payouts.map(p => ({
        id: p.id,
        ids: [p.id],
        recipient: p.recipient,
        amount: p.amount,
        totalAmount: parseFloat(p.amount),
        status: p.status,
        paymentDate: p.payment_date,
        orderRef: p.order?.order_number,
        upiTransactionId: p.upi_transaction_id,
        isToday: p.payment_date === today,
        canPay: true
      }));
    }

    const groups: Record<string, any> = {};
    payouts.forEach(p => {
      const key = `${p.recipient_id}_${p.payment_date}`;
      if (!groups[key]) {
        groups[key] = {
          ids: [],
          recipient: p.recipient,
          totalAmount: 0,
          status: p.status,
          paymentDate: p.payment_date,
          isToday: p.payment_date === today,
          upiTransactionId: p.upi_transaction_id,
        };
      }
      groups[key].ids.push(p.id);
      groups[key].totalAmount += parseFloat(p.amount);
      if (p.upi_transaction_id) groups[key].upiTransactionId = p.upi_transaction_id;
      
      if (p.status !== groups[key].status && p.status === 'pending') {
          groups[key].status = 'pending';
      }
    });

    return Object.values(groups).map(g => ({
        ...g,
        canPay: !g.isToday
    }));
  };

  const processedData = getProcessedData();
  const groupedByDate: Record<string, any[]> = processedData.reduce((acc: any, curr: any) => {
    if (!acc[curr.paymentDate]) acc[curr.paymentDate] = [];
    acc[curr.paymentDate].push(curr);
    return acc;
  }, {});
  
  const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));
  
  const dailyTotals = React.useMemo(() => {
    const totals: Record<string, number> = {};
    Object.keys(groupedByDate).forEach(date => {
      totals[date] = groupedByDate[date].reduce((sum, item) => sum + item.totalAmount, 0);
    });
    return totals;
  }, [groupedByDate]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      <View style={styles.topBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabContainer} contentContainerStyle={styles.tabScrollContent}>
          {(['store', 'rider', 'customer'] as PayoutType[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.activeTab]}
              onPress={() => { setLoading(true); setActiveTab(tab); }}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}s
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <TouchableOpacity 
            style={[styles.syncBtn, isGenerating && { opacity: 0.7 }]} 
            onPress={generatePayouts}
            disabled={isGenerating}
        >
            {isGenerating ? <ActivityIndicator size="small" color={Colors.primary} /> : <Icon name="sync" size={24} color={Colors.primary} />}
        </TouchableOpacity>
      </View>

      <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading && !refreshing ? (
             <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
        ) : sortedDates.length > 0 ? sortedDates.map(date => (
          <View key={date}>
            <View style={styles.dateHeader}>
              <Text style={styles.dateText}>
                {new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </Text>
              <View style={styles.dateLine} />
            </View>
            
            {dailyTotals[date] > 0 && (
              <View style={styles.dailyTotalBox}>
                <Text style={styles.dailyTotalAmount}>₹{dailyTotals[date].toFixed(0)}</Text>
                <Text style={styles.dailyTotalTitle}>TOTAL PAYOUT</Text>
              </View>
            )}
            {groupedByDate[date].map((group: any, idx: number) => {
                const isPaid = group.status === 'paid' || group.status === 'sent';
                
                return (
                    <View key={`${date}_${idx}`} style={styles.card}>
                        <View style={styles.cardTop}>
                            <View>
                                <Text style={styles.recipientName}>{group.recipient?.name || group.recipient?.full_name || 'System'}</Text>
                                <Text style={styles.recipientSub}>{group.recipient?.upi_id || 'No UPI'}</Text>
                                {group.upiTransactionId && (
                                    <Text style={styles.utrDetailText}>
                                        {group.upiTransactionId === 'PAID_CASH' ? '✓ Paid Cash' : `Paid Online`}
                                    </Text>
                                )}
                                {group.orderRef && <Text style={styles.orderLabel}>Order #{group.orderRef}</Text>}
                            </View>
                            <Text style={styles.totalAmount}>₹{group.totalAmount.toFixed(2)}</Text>
                        </View>
                        
                        {!isPaid && (
                            <View style={styles.badgeRow}>
                                <View style={[styles.badge, { backgroundColor: '#FEF3C7' }]}>
                                    <Text style={[styles.badgeText, { color: '#D97706' }]}>
                                        {group.isToday ? 'ACCUMULATING' : 'PENDING'}
                                    </Text>
                                </View>
                            </View>
                        )}

                        {group.canPay && (
                            <View style={styles.actions}>
                                {!isPaid ? (
                                    <>
                                        <TouchableOpacity 
                                            style={[styles.actionBtn, {backgroundColor: '#007AFF'}]} 
                                            onPress={() => handleUpiPayment(group)}
                                        >
                                            <Text style={styles.actionBtnText}>Pay Online</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity 
                                            style={[styles.actionBtn, {backgroundColor: '#10B981'}]} 
                                            onPress={() => handleCashPayment(group)}
                                        >
                                            <Text style={styles.actionBtnText}>Pay Cash</Text>
                                        </TouchableOpacity>
                                    </>
                                ) : (
                                    <TouchableOpacity disabled style={[styles.actionBtn, {backgroundColor: '#10B98120', borderWidth: 1, borderColor: '#10B98140'}]}>
                                        <Text style={[styles.actionBtnText, {color: '#10B981'}]}>Paid</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        )}
                    </View>
                );
            })}
          </View>
        )) : (
            <View style={styles.empty}>
                <Text style={styles.emptyText}>No payouts recorded yet.</Text>
            </View>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingTop: 15, paddingHorizontal: 15, paddingBottom: 5 },
  tabContainer: { flex: 1, marginRight: 10 },
  tabScrollContent: { gap: 8, paddingRight: 10 },
  tab: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: '#E5E7EB', minWidth: 80, alignItems: 'center' },
  activeTab: { backgroundColor: '#007AFF' },
  tabText: { fontSize: 13, fontWeight: '700', color: '#6B7280' },
  activeTabText: { color: '#FFFFFF' },
  syncBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderRadius: 22, borderWidth: 1.5, borderColor: '#007AFF', elevation: 3, shadowColor: '#007AFF', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4 },
  content: { padding: 20 },
  dateHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 15, marginBottom: 10, gap: 10 },
  dateText: { fontSize: 12, fontWeight: '900', color: '#6B7280', textTransform: 'uppercase' },
  dailyTotalBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E0EEFE', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, marginBottom: 8, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#B0D5FD' },
  dailyTotalTitle: { fontSize: 11, fontWeight: '800', color: '#007AFF', marginLeft: 6 },
  dailyTotalAmount: { fontSize: 15, fontWeight: '900', color: '#007AFF' },
  dateLine: { flex: 1, height: 1, backgroundColor: '#D1D5DB' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 16, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  recipientName: { fontSize: 17, fontWeight: '800', color: '#111827' },
  recipientSub: { fontSize: 12, color: '#6B7280', marginTop: 2, fontStyle: 'italic' },
  orderLabel: { fontSize: 11, fontWeight: '800', color: '#007AFF', marginTop: 5 },
  totalAmount: { fontSize: 20, fontWeight: '900', color: '#000000' },
  badgeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 12 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: '900' },
  utrDetailText: { fontSize: 12, fontWeight: '800', color: '#10B981', marginTop: 4 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 5 },
  actionBtn: { flex: 1, height: 45, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  actionBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  empty: { marginTop: 100, alignItems: 'center' },
  emptyText: { color: '#6B7280', fontWeight: '600' },
});

export default PaymentsScreen;
