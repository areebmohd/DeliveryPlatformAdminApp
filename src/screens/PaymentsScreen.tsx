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

const PaymentsScreen = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<PayoutType>('store');
  const [payouts, setPayouts] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // UTR Modal states
  const [utrModalVisible, setUtrModalVisible] = useState(false);
  const [currentPayoutGroup, setCurrentPayoutGroup] = useState<any>(null);
  const [utrNumber, setUtrNumber] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const { showAlert, showToast } = useAlert();

  const fetchPayouts = async () => {
    try {
      const { data, error } = await supabase
        .from('payouts')
        .select(`
          *,
          store:recipient_id (id, name, upi_id, phone),
          rider:recipient_id (id, full_name, upi_id, phone),
          customer:recipient_id (id, full_name, upi_id, phone),
          order:order_id (order_number)
        `)
        .eq('recipient_type', activeTab)
        .order('payment_date', { ascending: false });

      if (error) throw error;
      setPayouts(data || []);
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
      const today = new Date().toISOString().split('T')[0];

      // 1. Fetch delivered orders that aren't in payouts yet
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select(`
          id, 
          status, 
          payment_method, 
          total_amount, 
          delivery_fee, 
          rider_id,
          user_id,
          created_at,
          order_items(store_id, price, quantity)
        `)
        .or(`status.eq.delivered,status.eq.cancelled`);

      if (ordersError) throw ordersError;

      const newPayouts: any[] = [];

      for (const order of orders) {
        const orderDate = new Date(order.created_at).toISOString().split('T')[0];

        // STORE PAYOUTS (Delivered orders)
        if (order.status === 'delivered') {
          const storeEarnings: Record<string, number> = {};
          order.order_items.forEach((item: any) => {
            storeEarnings[item.store_id] = (storeEarnings[item.store_id] || 0) + (item.price * item.quantity);
          });

          for (const [storeId, amount] of Object.entries(storeEarnings)) {
            newPayouts.push({
              recipient_id: storeId,
              recipient_type: 'store',
              order_id: order.id,
              amount,
              payment_date: orderDate,
              status: 'pending'
            });
          }

          // RIDER PAYOUTS (Delivered orders)
          if (order.rider_id) {
            newPayouts.push({
              recipient_id: order.rider_id,
              recipient_type: 'rider',
              order_id: order.id,
              amount: order.delivery_fee || 25,
              payment_date: orderDate,
              status: 'pending'
            });
          }
        }

        // CUSTOMER REFUNDS (Cancelled online orders)
        if (order.status === 'cancelled' && order.payment_method === 'pay_online' && order.user_id) {
            newPayouts.push({
                recipient_id: order.user_id,
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
          const { error } = await supabase
            .from('payouts')
            .update({ 
                status: 'paid',
                upi_transaction_id: response.txnId || 'N/A'
            })
            .in('id', group.ids);

          if (error) throw error;
          showToast('Batch payment recorded!', 'success');
          fetchPayouts();
        } catch (e: any) {
          showToast('Updated partially: ' + e.message, 'error');
        }
      },
      () => showToast('Payment cancelled', 'error')
    );
  };

  const openUtrModal = (group: any) => {
    setCurrentPayoutGroup(group);
    setUtrNumber(group.upiTransactionId || '');
    setUtrModalVisible(true);
  };

  const confirmSent = async () => {
    if (!utrNumber) {
        showToast('Please enter the UTR or Transaction ID', 'info');
        return;
    }
    
    try {
      setIsUpdatingStatus(true);
      const { error } = await supabase
        .from('payouts')
        .update({ status: 'sent', upi_transaction_id: utrNumber })
        .in('id', currentPayoutGroup.ids);

      if (error) throw error;
      showToast('Settlement completed!', 'success');
      setUtrModalVisible(false);
      fetchPayouts();
    } catch (e: any) {
      showAlert({ title: 'Error', message: e.message, type: 'error' });
    } finally {
        setIsUpdatingStatus(false);
    }
  };

  const consolidatePayouts = (data: any[]) => {
    const today = new Date().toISOString().split('T')[0];
    
    if (activeTab === 'customer') {
      // Individual refunds for customers
      return data.map(p => ({
        id: p.id,
        ids: [p.id],
        recipient: p.customer,
        amount: p.amount,
        totalAmount: p.amount,
        status: p.status,
        paymentDate: p.payment_date,
        orderRef: p.order?.order_number,
        upiTransactionId: p.upi_transaction_id,
        isToday: p.payment_date === today,
        canPay: true // Customers can always be refunded
      }));
    }

    // Consolidated for Stores and Riders
    const groups: Record<string, any> = {};
    data.forEach(p => {
      const key = `${p.recipient_id}_${p.payment_date}`;
      if (!groups[key]) {
        groups[key] = {
          ids: [],
          recipient: activeTab === 'store' ? p.store : p.rider,
          totalAmount: 0,
          status: p.status, // We use the status of the first one, assuming they are consistent
          paymentDate: p.payment_date,
          isToday: p.payment_date === today,
          upiTransactionId: p.upi_transaction_id,
        };
      }
      groups[key].ids.push(p.id);
      groups[key].totalAmount += parseFloat(p.amount);
      if (p.upi_transaction_id) groups[key].upiTransactionId = p.upi_transaction_id;
      
      // If any of them are NOT 'sent', the group status should reflect that
      if (p.status !== groups[key].status && p.status === 'pending') {
          groups[key].status = 'pending';
      }
    });

    return Object.values(groups).map(g => ({
        ...g,
        canPay: !g.isToday // Buttons only appear for past days
    }));
  };

  const processedData = consolidatePayouts(payouts);
  const groupedByDate: Record<string, any[]> = processedData.reduce((acc: any, curr) => {
    if (!acc[curr.paymentDate]) acc[curr.paymentDate] = [];
    acc[curr.paymentDate].push(curr);
    return acc;
  }, {});
  
  const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));

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
              <Text style={styles.dateText}>{new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Text>
              <View style={styles.dateLine} />
            </View>
            {groupedByDate[date].map((group, idx) => {
                const isPaid = group.status === 'paid' || group.status === 'sent';
                const isSent = group.status === 'sent';
                
                return (
                    <View key={`${date}_${idx}`} style={styles.card}>
                        <View style={styles.cardTop}>
                            <View>
                                <Text style={styles.recipientName}>{group.recipient?.name || group.recipient?.full_name || 'System'}</Text>
                                <Text style={styles.recipientSub}>{group.recipient?.upi_id || 'No UPI'}</Text>
                                {group.orderRef && <Text style={styles.orderLabel}>Order #{group.orderRef}</Text>}
                            </View>
                            <Text style={styles.totalAmount}>₹{group.totalAmount.toFixed(2)}</Text>
                        </View>
                        
                        <View style={styles.badgeRow}>
                            <View style={[styles.badge, { backgroundColor: isSent ? Colors.success + '15' : isPaid ? Colors.info + '15' : Colors.warning + '15' }]}>
                                <Text style={[styles.badgeText, { color: isSent ? Colors.success : isPaid ? Colors.info : Colors.warning }]}>
                                    {group.isToday && group.status === 'pending' ? 'ACCUMULATING' : group.status.toUpperCase()}
                                </Text>
                            </View>
                            {group.upiTransactionId && <Text style={styles.utrLabel}>UTR: {group.upiTransactionId}</Text>}
                        </View>

                        {group.canPay && (
                            <View style={styles.actions}>
                                {!isPaid ? (
                                    <TouchableOpacity style={[styles.actionBtn, {backgroundColor: Colors.primary}]} onPress={() => handleUpiPayment(group)}>
                                        <Text style={styles.actionBtnText}>Pay Total</Text>
                                    </TouchableOpacity>
                                ) : (
                                    <View style={styles.paidBadge}>
                                        <Icon name="checkmark-done" size={18} color={Colors.info} />
                                        <Text style={styles.paidText}>Settled</Text>
                                    </View>
                                )}
                                {!isSent && (
                                    <TouchableOpacity style={[styles.actionBtn, {backgroundColor: Colors.success}]} onPress={() => openUtrModal(group)}>
                                        <Text style={styles.actionBtnText}>{activeTab === 'customer' ? 'Refund Sent' : 'Payment Sent'}</Text>
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

      {/* UTR / Confirmation Modal */}
      <Modal visible={utrModalVisible} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>Confirm Settlement</Text>
                  <Text style={styles.modalSubtitle}>Enter the Transaction ID / UTR for this batch payment (₹{currentPayoutGroup?.totalAmount.toFixed(2)}).</Text>
                  <TextInput 
                    style={styles.utrInput} 
                    placeholder="Enter UTR Number" 
                    value={utrNumber} 
                    onChangeText={setUtrNumber}
                    autoCapitalize="characters"
                  />
                  <View style={styles.modalActions}>
                      <TouchableOpacity style={styles.cancelBtn} onPress={() => setUtrModalVisible(false)}>
                          <Text style={styles.cancelBtnText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.confirmBtn} onPress={confirmSent} disabled={isUpdatingStatus}>
                          {isUpdatingStatus ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.confirmBtnText}>Mark as Sent</Text>}
                      </TouchableOpacity>
                  </View>
              </View>
          </View>
      </Modal>
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
  actions: { flexDirection: 'row', gap: 10, marginTop: 5 },
  actionBtn: { flex: 1, height: 45, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  actionBtnText: { color: Colors.white, fontSize: 14, fontWeight: '800' },
  paidBadge: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.info + '10', borderRadius: 12, height: 45, gap: 6 },
  paidText: { color: Colors.info, fontWeight: '800', fontSize: 14 },
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
