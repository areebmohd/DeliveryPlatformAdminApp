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
  TextInput,
  Modal,
} from 'react-native';
import { supabase } from '../services/supabaseClient';
import { useAlert } from '../context/AlertContext';
import Icon from 'react-native-vector-icons/Ionicons';
import { Colors, Spacing, borderRadius } from '../theme/colors';
import RNUpiPayment from 'react-native-upi-payment';

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
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const { showAlert, showToast } = useAlert();

  const fetchPayouts = async () => {
    try {
      setLoading(true);
      // 1. Fetch raw payouts
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

      // 2. Fetch recipient details based on type
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

  const generatePayouts = async () => {
    try {
      setIsGenerating(true);
      const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time

      // 1. Fetch delivered orders that aren't in payouts yet
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

        // STORE PAYOUTS (Delivered orders)
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

          // RIDER PAYOUTS (Delivered orders)
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

        // CUSTOMER REFUNDS (Cancelled online orders)
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

  const handleUpiPayment = (group: any) => {
    const recipient = activeTab === 'store' ? group.recipient : 
                    activeTab === 'rider' ? group.recipient : 
                    group.recipient;

    if (!recipient?.upi_id) {
      showAlert({ title: 'Missing UPI ID', message: 'Recipient has not linked a UPI ID.', type: 'error' });
      return;
    }

    RNUpiPayment.initializePayment(
      {
        vpa: recipient.upi_id,
        payeeName: recipient.name || recipient.full_name,
        amount: group.totalAmount.toString(),
        transactionNote: `${activeTab.toUpperCase()} settlement - ${group.paymentDate}`,
        transactionRef: group.ids[0], // Using the first payout ID as ref
      },
      async (response: any) => {
        try {
          // Automated UTR fetching: check multiple common fields
          const capturedUtr = response.txnId || response.ApprovalRefNo || response.txnRef || 'N/A';
          const { error } = await supabase
            .from('payouts')
            .update({ 
                status: 'sent', // Mark as 'sent' (terminal state) automatically
                upi_transaction_id: capturedUtr
            })
            .in('id', group.ids);

          if (error) throw error;
          showToast('Payment settled automatically!', 'success');
          fetchPayouts();
        } catch (e: any) {
          showToast('Updated partially: ' + e.message, 'error');
        }
      },
    );
  };

  const handleCashPayment = (group: any) => {
    showAlert({
      title: 'Confirm Cash Payment',
      message: `Are you sure you want to mark ₹${group.totalAmount.toFixed(2)} as paid via Cash? Ensure you have received the amount.`,
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


  const consolidatePayouts = (data: any[]) => {
    const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
    
    if (activeTab === 'customer') {
      // Individual refunds for customers
      return data.map(p => ({
        id: p.id,
        ids: [p.id],
        recipient: p.recipient,
        amount: p.amount,
        totalAmount: p.amount,
        status: p.status,
        paymentDate: p.payment_date,
        orderRef: p.order?.order_number,
        upiTransactionId: p.upi_transaction_id,
        isToday: p.payment_date === today,
        canPay: true // Customers can canPay immediately
      }));
    }

    // Consolidated for Stores and Riders
    const groups: Record<string, any> = {};
    data.forEach(p => {
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
        canPay: !g.isToday // Buttons only appear for past days for Store/Rider
    }));
  };

  const processedData = consolidatePayouts(payouts);
  const groupedByDate: Record<string, any[]> = processedData.reduce((acc: any, curr) => {
    if (!acc[curr.paymentDate]) acc[curr.paymentDate] = [];
    acc[curr.paymentDate].push(curr);
    return acc;
  }, {});
  
  const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));
  
  const dailyTotalPayouts = React.useMemo(() => {
    const totals: Record<string, number> = {};
    Object.keys(groupedByDate).forEach(date => {
      totals[date] = groupedByDate[date].reduce((sum, item) => {
        return sum + item.totalAmount;
      }, 0);
    });
    return totals;
  }, [groupedByDate]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      <View style={styles.topBar}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          style={styles.tabContainer}
          contentContainerStyle={styles.tabScrollContent}
        >
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
            
            {dailyTotalPayouts[date] > 0 && (
              <View style={styles.dailyTotalBox}>
                <Text style={styles.dailyTotalAmount}>₹{dailyTotalPayouts[date].toFixed(0)}</Text>
                <Text style={styles.dailyTotalTitle}>TOTAL PAYOUT</Text>
              </View>
            )}
            {groupedByDate[date].map((group, idx) => {
                const isPaid = group.status === 'paid' || group.status === 'sent';
                const isSent = group.status === 'sent';
                
                return (
                    <View key={`${date}_${idx}`} style={styles.card}>
                        <View style={styles.cardTop}>
                            <View>
                                <Text style={styles.recipientName}>{group.recipient?.name || group.recipient?.full_name || 'System'}</Text>
                                <Text style={styles.recipientSub}>{group.recipient?.upi_id || 'No UPI'}</Text>
                                {group.upiTransactionId && (
                                    <Text style={styles.utrDetailText}>
                                        {group.upiTransactionId === 'PAID_CASH' ? '✓ Paid Cash' : `UTR: ${group.upiTransactionId}`}
                                    </Text>
                                )}
                                {group.orderRef && <Text style={styles.orderLabel}>Order #{group.orderRef}</Text>}
                            </View>
                            <Text style={styles.totalAmount}>₹{group.totalAmount.toFixed(2)}</Text>
                        </View>
                        
                        {!isPaid && !isSent && (
                            <View style={styles.badgeRow}>
                                <View style={[styles.badge, { backgroundColor: Colors.warning + '15' }]}>
                                    <Text style={[styles.badgeText, { color: Colors.warning }]}>
                                        {group.isToday ? 'ACCUMULATING' : 'PENDING'}
                                    </Text>
                                </View>
                            </View>
                        )}

                        {group.canPay && (
                            <View style={styles.actions}>
                                {!isPaid && !isSent ? (
                                    <>
                                        <TouchableOpacity 
                                            style={[styles.actionBtn, {backgroundColor: Colors.success}]} 
                                            onPress={() => handleCashPayment(group)}
                                        >
                                            <Text style={styles.actionBtnText}>Pay Cash</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity 
                                            style={[styles.actionBtn, {backgroundColor: Colors.primary}]} 
                                            onPress={() => handleUpiPayment(group)}
                                        >
                                            <Text style={styles.actionBtnText}>Pay Online</Text>
                                        </TouchableOpacity>
                                    </>
                                ) : (
                                    <TouchableOpacity disabled style={[styles.actionBtn, {backgroundColor: Colors.success + '20', borderWidth: 1, borderColor: Colors.success + '40'}]}>
                                        <Text style={[styles.actionBtnText, {color: Colors.success}]}>Paid</Text>
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
  topBar: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingTop: 15, 
    paddingHorizontal: 15, 
    paddingBottom: 5,
  },
  tabContainer: {
    flex: 1,
    marginRight: 10,
  },
  tabScrollContent: {
    gap: 8,
    paddingRight: 10,
  },
  tab: { 
    paddingHorizontal: 16, 
    paddingVertical: 10, 
    borderRadius: 20, 
    backgroundColor: '#E5E7EB',
    minWidth: 80,
    alignItems: 'center',
  },
  activeTab: { backgroundColor: Colors.primary },
  tabText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  activeTabText: { color: Colors.white },
  syncBtn: { 
    width: 44,
    height: 44,
    alignItems: 'center', 
    justifyContent: 'center',
    backgroundColor: Colors.white, 
    borderRadius: 22, 
    borderWidth: 1.5,
    borderColor: Colors.primary,
    elevation: 3,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  syncBtnText: { color: Colors.primary, fontWeight: '800', fontSize: 13 },
  content: { padding: 20 },
  dateHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 15, marginBottom: 10, gap: 10 },
  dateText: { fontSize: 12, fontWeight: '900', color: Colors.textSecondary, textTransform: 'uppercase' },
  dailyTotalBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0EEFE',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    marginBottom: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#B0D5FD',
  },
  dailyTotalTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#007AFF',
    marginLeft: 6,
  },
  dailyTotalAmount: {
    fontSize: 15,
    fontWeight: '900',
    color: '#007AFF',
  },
  dateLine: { flex: 1, height: 1, backgroundColor: Colors.border + '50' },
  card: { backgroundColor: Colors.white, borderRadius: 16, padding: 16, marginBottom: 16, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  recipientName: { fontSize: 17, fontWeight: '800', color: Colors.text },
  recipientSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2, fontStyle: 'italic' },
  orderLabel: { fontSize: 11, fontWeight: '800', color: Colors.primary, marginTop: 5 },
  totalAmount: { fontSize: 20, fontWeight: '900', color: Colors.black },
  badgeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 12 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: '900' },
  utrLabel: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },
  utrDetailText: { fontSize: 12, fontWeight: '800', color: Colors.success, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 5 },
  actionBtn: { flex: 1, height: 45, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  actionBtnText: { color: Colors.white, fontSize: 14, fontWeight: '800' },
  empty: { marginTop: 100, alignItems: 'center' },
  emptyText: { color: Colors.textSecondary, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 25 },
  modalContent: { backgroundColor: Colors.white, borderRadius: 24, padding: 25 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: Colors.text, marginBottom: 10 },
  modalSubtitle: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20, marginBottom: 20 },
  utrInput: { backgroundColor: '#F3F4F6', height: 55, borderRadius: 12, paddingHorizontal: 15, fontSize: 16, fontWeight: '700', color: Colors.text, borderWidth: 1, borderColor: Colors.border, marginBottom: 25 },
  modalActions: { flexDirection: 'row', gap: 15 },
  cancelBtn: { flex: 1, height: 55, justifyContent: 'center', alignItems: 'center' },
  cancelBtnText: { color: Colors.textSecondary, fontWeight: '800' },
  confirmBtn: { flex: 1, height: 55, backgroundColor: Colors.success, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  confirmBtnText: { color: Colors.white, fontWeight: '800' },
});

export default PaymentsScreen;
