import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from 'react-native';
import {supabase} from '../services/supabaseClient';
import {useAlert} from '../context/AlertContext';
import Icon from 'react-native-vector-icons/Ionicons';
import {Colors, Spacing, Typography, borderRadius} from '../theme/colors';

const {width} = Dimensions.get('window');

interface DashboardStats {
  total_orders: number;
  total_deliveries: number;
  total_payment_received: number;
  total_to_stores: number;
  total_to_riders: number;
  total_to_admin: number;
  stores_joined: number;
  products_added: number;
}

type Timeframe = 'daily' | 'weekly' | 'monthly';

const DashboardScreen = () => {
  const {showAlert} = useAlert();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeframe, setTimeframe] = useState<Timeframe>('daily');
  const [stats, setStats] = useState<DashboardStats | null>(null);

  const fetchDashboardData = async (selectedTimeframe: Timeframe) => {
    try {
      const days = selectedTimeframe === 'daily' ? 1 : selectedTimeframe === 'weekly' ? 7 : 30;
      
      const {data, error} = await supabase.rpc('get_admin_dashboard_stats', {
        days_limit: days,
      });

      if (error) throw error;
      
      setStats((data || {}) as DashboardStats);
    } catch (error: any) {
      showAlert({title: 'Error', message: error?.message || 'Failed to load dashboard data', type: 'error'});
      setStats(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData(timeframe);
  }, [timeframe]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData(timeframe);
  };

  const formatCurrency = (amount: number) => {
    return `₹${Number(amount).toLocaleString('en-IN', {minimumFractionDigits: 0, maximumFractionDigits: 1})}`;
  };

  const StatCard = ({title, value, icon, color, subtitle}: any) => (
    <View style={styles.statCard}>
      <View style={[styles.iconContainer, {backgroundColor: color + '20'}]}>
        <Icon name={icon} size={24} color={color} />
      </View>
      <View style={styles.statInfo}>
        <Text style={styles.statLabel} numberOfLines={1}>{title}</Text>
        <Text style={[styles.statValue, {color: color}]}>{value}</Text>
        {subtitle && <Text style={styles.statSubtitle}>{subtitle}</Text>}
      </View>
    </View>
  );

  const TimeframeButton = ({label, value}: {label: string; value: Timeframe}) => (
    <TouchableOpacity
      style={[
        styles.timeframeBtn,
        timeframe === value && styles.timeframeBtnActive,
      ]}
      onPress={() => {
        setLoading(true);
        setTimeframe(value);
      }}>
      <Text
        style={[
          styles.timeframeText,
          timeframe === value && styles.timeframeTextActive,
        ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.timeframeContainer}>
          <TimeframeButton label="Daily" value="daily" />
          <TimeframeButton label="Weekly" value="weekly" />
          <TimeframeButton label="Monthly" value="monthly" />
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }>
        
        {/* Orders Overview */}
        <View style={styles.statsRow}>
          <StatCard
            title="Total Orders"
            value={stats?.total_orders || 0}
            icon="cart-outline"
            color={Colors.primary}
          />
          <StatCard
            title="Deliveries"
            value={stats?.total_deliveries || 0}
            icon="bicycle-outline"
            color={Colors.success}
          />
        </View>

        {/* Financial Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Financial Breakdown</Text>
        </View>

        <View style={styles.mainFinanceCard}>
          <View style={styles.mainFinanceContent}>
            <Text style={styles.mainFinanceLabel}>Total Payment Received</Text>
            <Text style={styles.mainFinanceValue}>
              {formatCurrency(stats?.total_payment_received || 0)}
            </Text>
          </View>
          <View style={styles.mainFinanceIcon}>
            <Icon name="wallet" size={40} color={Colors.white} />
          </View>
        </View>

        <View style={styles.financeGrid}>
          <View style={styles.financeItem}>
            <View style={[styles.financeIcon, {backgroundColor: Colors.info + '15'}]}>
              <Icon name="business" size={18} color={Colors.info} />
            </View>
            <Text style={styles.financeLabel}>To Stores</Text>
            <Text style={[styles.financeValue, {color: Colors.info}]}>
              {formatCurrency(stats?.total_to_stores || 0)}
            </Text>
          </View>
          <View style={styles.financeItem}>
            <View style={[styles.financeIcon, {backgroundColor: Colors.warning + '15'}]}>
              <Icon name="bicycle" size={18} color={Colors.warning} />
            </View>
            <Text style={styles.financeLabel}>To Riders</Text>
            <Text style={[styles.financeValue, {color: Colors.warning}]}>
              {formatCurrency(stats?.total_to_riders || 0)}
            </Text>
          </View>
          <View style={styles.financeItem}>
            <View style={[styles.financeIcon, {backgroundColor: Colors.success + '15'}]}>
              <Icon name="trending-up" size={18} color={Colors.success} />
            </View>
            <Text style={styles.financeLabel}>Admin Profit</Text>
            <Text style={[styles.financeValue, {color: Colors.success}]}>
              {formatCurrency(stats?.total_to_admin || 0)}
            </Text>
          </View>
        </View>

        {/* Network Growth Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Network & Growth</Text>
        </View>

        <View style={styles.statsRow}>
          <StatCard
            title="Stores Joined"
            value={stats?.stores_joined || 0}
            icon="business-outline"
            color="#9333ea"
          />
          <StatCard
            title="Products Added"
            value={stats?.products_added || 0}
            icon="cube-outline"
            color="#ea580c"
          />
        </View>

        <View style={styles.footerSpacer} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  timeframeContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: borderRadius.lg,
    padding: 2,
  },
  timeframeBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: borderRadius.md,
  },
  timeframeBtnActive: {
    backgroundColor: Colors.white,
    elevation: 2,
    shadowColor: Colors.black,
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  timeframeText: {
    ...Typography.caption,
    fontWeight: '600',
    color: Colors.textSecondary,
    fontSize: 14,
  },
  timeframeTextActive: {
    color: Colors.primary,
  },
  scrollContent: {
    padding: Spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: borderRadius.lg,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 2,
    shadowColor: Colors.black,
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  statInfo: {
    flex: 1,
  },
  statLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontSize: 11,
    lineHeight: 14,
  },
  statValue: {
    ...Typography.title,
    fontSize: 22,
    marginTop: 2,
  },
  statSubtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontSize: 10,
    marginTop: 2,
  },
  sectionHeader: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    ...Typography.body,
    fontWeight: '700',
    color: Colors.text,
  },
  mainFinanceCard: {
    backgroundColor: Colors.primary,
    borderRadius: borderRadius.lg,
    padding: Spacing.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
    elevation: 4,
  },
  mainFinanceContent: {
    flex: 1,
  },
  mainFinanceLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '600',
  },
  mainFinanceValue: {
    color: Colors.white,
    fontSize: 32,
    fontWeight: '800',
    marginTop: 4,
  },
  mainFinanceIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  financeGrid: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  financeItem: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: borderRadius.lg,
    padding: Spacing.sm,
    alignItems: 'center',
    elevation: 2,
    shadowColor: Colors.black,
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  financeIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  financeLabel: {
    ...Typography.caption,
    fontSize: 10,
    color: Colors.textSecondary,
    marginBottom: 2,
    textAlign: 'center',
  },
  financeValue: {
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  footerSpacer: {
    height: 40,
  },
});

export default DashboardScreen;
