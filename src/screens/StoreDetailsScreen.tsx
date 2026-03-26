import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  StatusBar,
  Linking,
  Image,
  Platform,
  TouchableOpacity,
  Alert,
  Modal
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '../services/supabaseClient';
import { useAlert } from '../context/AlertContext';
import { Colors, Spacing, borderRadius } from '../theme/colors';
import { CustomerProductCard } from '../components/CustomerProductCard';


const StoreDetailsScreen = ({ route, navigation }: any) => {
  const { showAlert, showToast } = useAlert();
  const { store } = route.params;
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'products' | 'info'>('products');
  const insets = useSafeAreaInsets();
  const [isActivating, setIsActivating] = useState(false);
  const [currentStore, setCurrentStore] = useState(store);
  const [isVerificationModalVisible, setIsVerificationModalVisible] = useState(false);
  const [changedFields, setChangedFields] = useState<{ label: string; old: string; new: string }[]>([]);

  useEffect(() => {
    fetchStoreDetails();
    fetchProducts();
  }, []);

  const fetchStoreDetails = async () => {
    try {
      const { data, error } = await supabase
        .from('stores_with_location')
        .select('*')
        .eq('id', store.id)
        .single();

      if (error) throw error;
      setCurrentStore(data);
    } catch (e) {
      console.error('Error fetching store details:', e);
    }
  };

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('store_id', store.id)
        .eq('in_stock', true)
        .eq('is_deleted', false);

      if (error) throw error;
      setProducts(data || []);
    } catch (e) {
      console.error('Error fetching products:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleActivateStore = async () => {
    try {
      setIsActivating(true);
      
      // 1. Update database
      const snapshot = {
        name: currentStore.name,
        description: currentStore.description,
        category: currentStore.category,
        upi_id: currentStore.upi_id,
        phone: currentStore.phone,
        email: currentStore.email,
        whatsapp_number: currentStore.whatsapp_number,
        address_line_1: currentStore.address_line_1,
        pincode: currentStore.pincode,
        city: currentStore.city,
        state: currentStore.state,
        owner_name: currentStore.owner_name,
        owner_number: currentStore.owner_number,
        location: currentStore.location_wkt,
        opening_hours: currentStore.opening_hours,
      };

      const { error: updateError } = await supabase
        .from('stores')
        .update({ 
          is_active: true, 
          is_approved: true,
          verification_images: [], // Clear images after activation as requested
          approved_details: snapshot
        })
        .eq('id', store.id);

      if (updateError) throw updateError;

      // 2. Delete images from storage
      if (currentStore.verification_images && currentStore.verification_images.length > 0) {
        for (const url of currentStore.verification_images) {
          try {
            const bucket = 'banners'; // as used in mainApp
            const path = url.split(`${bucket}/`)[1];
            if (path) {
              await supabase.storage.from(bucket).remove([path]);
            }
          } catch (storageError) {
            console.error('Error deleting image from storage:', storageError);
          }
        }
      }

      setCurrentStore({ 
        ...currentStore, 
        is_active: true, 
        is_approved: true,
        verification_images: [],
        approved_details: snapshot
      });

      showToast('Store activated successfully!', 'success');
    } catch (e: any) {
      console.error('Activation error:', e);
      showAlert({
        title: 'Error',
        message: 'Could not activate store. ' + e.message,
        type: 'error',
      });
    } finally {
      setIsActivating(false);
    }
  };

  const renderFormattedValue = (key: string, value: any) => {
    if (!value || value === 'Not set' || value === 'Not provided') return 'Not set';
    
    if (key === 'opening_hours') {
      try {
        const hours = typeof value === 'string' ? JSON.parse(value) : value;
        if (Array.isArray(hours) && hours.length > 0) {
          return hours.map((h: any) => `${h.start} - ${h.end}`).join(', ');
        }
      } catch (e) {
        return String(value);
      }
    }
    
    if (key === 'location_wkt' || key === 'location') {
      if (typeof value === 'string') {
        return value.replace('POINT(', '').replace(')', '').split(' ').reverse().join(', ');
      }
    }
    
    return String(value);
  };

  const getChangedFields = () => {
    const fields = [
      { key: 'name', label: 'Store Name' },
      { key: 'description', label: 'Description' },
      { key: 'category', label: 'Category' },
      { key: 'upi_id', label: 'UPI ID' },
      { key: 'phone', label: 'Phone' },
      { key: 'email', label: 'Email' },
      { key: 'whatsapp_number', label: 'WhatsApp' },
      { key: 'address_line_1', label: 'Address Line 1' },
      { key: 'pincode', label: 'Pincode' },
      { key: 'city', label: 'City' },
      { key: 'state', label: 'State' },
      { key: 'owner_name', label: 'Owner Name' },
      { key: 'owner_number', label: 'Owner Number' },
      { key: 'location_wkt', label: 'Location' },
      { key: 'opening_hours', label: 'Opening Hours' },
    ];

    const approved = currentStore.approved_details || {};
    const changes: { label: string; old: string; new: string }[] = [];

    fields.forEach(field => {
      const oldValueRaw = approved[field.key] || 'Not set';
      const newValueRaw = currentStore[field.key] || 'Not set';
      
      const oldValue = renderFormattedValue(field.key, oldValueRaw);
      const newValue = renderFormattedValue(field.key, newValueRaw);

      if (oldValue !== newValue) {
        changes.push({
          label: field.label,
          old: oldValue,
          new: newValue,
        });
      }
    });

    return changes;
  };

  const handleVerifyChanges = async () => {
    const changes = getChangedFields();
    if (changes.length === 0) {
      // If no data changes detected, still need to clear the flag
      confirmVerification();
      return;
    }
    setChangedFields(changes);
    setIsVerificationModalVisible(true);
  };

  const confirmVerification = async () => {
    try {
      setIsActivating(true);
      const snapshot = {
        name: currentStore.name,
        description: currentStore.description,
        category: currentStore.category,
        upi_id: currentStore.upi_id,
        phone: currentStore.phone,
        email: currentStore.email,
        whatsapp_number: currentStore.whatsapp_number,
        address_line_1: currentStore.address_line_1,
        pincode: currentStore.pincode,
        city: currentStore.city,
        state: currentStore.state,
        owner_name: currentStore.owner_name,
        owner_number: currentStore.owner_number,
        location: currentStore.location_wkt,
        opening_hours: currentStore.opening_hours,
      };

      const { error } = await supabase
        .from('stores')
        .update({ 
          has_pending_changes: false,
          approved_details: snapshot
        })
        .eq('id', store.id);

      if (error) throw error;

      setCurrentStore({ 
        ...currentStore, 
        has_pending_changes: false,
        approved_details: snapshot 
      });
      setIsVerificationModalVisible(false);
      showToast('Store changes verified successfully!', 'success');
    } catch (e: any) {
      console.error('Verification error:', e);
      showAlert({
        title: 'Error',
        message: 'Could not verify changes. ' + e.message,
        type: 'error',
      });
    } finally {
      setIsActivating(false);
    }
  };

  const handleDeactivateStore = async () => {
    try {
      setIsActivating(true);
      
      const { error: updateError } = await supabase
        .from('stores')
        .update({ 
          is_active: false, 
          is_approved: false 
        })
        .eq('id', store.id);

      if (updateError) throw updateError;

      setCurrentStore({ 
        ...currentStore, 
        is_active: false, 
        is_approved: false 
      });

      showToast('Store deactivated successfully!', 'success');
    } catch (e: any) {
      console.error('Deactivation error:', e);
      showAlert({
        title: 'Error',
        message: 'Could not deactivate store. ' + e.message,
        type: 'error',
      });
    } finally {
      setIsActivating(false);
    }
  };

  const handleContact = (type: string, value: string) => {
    let url = '';
    switch (type) {
      case 'tel':
        url = `tel:${value}`;
        break;
      case 'mailto':
        url = `mailto:${value}`;
        break;
      case 'whatsapp':
        const cleanedNumber = value.replace(/\D/g, '');
        url = `whatsapp://send?phone=${cleanedNumber}`;
        break;
      case 'browser':
        url = value.startsWith('http') ? value : `https://${value}`;
        break;
    }
    
    if (url) {
      Linking.canOpenURL(url).then(supported => {
        if (supported) {
          Linking.openURL(url);
        } else {
          console.warn('Cannot open URL:', url);
          if (type === 'whatsapp') {
             Linking.openURL(`https://wa.me/${value.replace(/\D/g, '')}`);
          }
        }
      });
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />
      
      {/* Custom Header with Branding */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Icon name="arrow-left" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerMainTitle}>Store</Text>
        </View>
      </View>

      <ScrollView 
        stickyHeaderIndices={[2]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
      >
        {/* Banner */}
        <View style={styles.bannerContainer}>
          {store.banner_url ? (
            <Image source={{ uri: store.banner_url }} style={styles.banner} />
          ) : (
            <View style={[styles.banner, styles.bannerPlaceholder]}>
              <Icon name="store" size={60} color={Colors.border} />
              <Text style={styles.placeholderText}>Welcome to our store</Text>
            </View>
          )}
        </View>

        {/* Store Branding */}
        <View style={styles.brandingContainer}>
          <View style={styles.nameRow}>
            <Text style={styles.storeName} numberOfLines={1}>{currentStore.name}</Text>
            <View style={styles.badgeContainer}>
              {!currentStore.is_active && (
                <View style={styles.inactiveBadge}>
                  <Text style={styles.inactiveBadgeText}>INACTIVE</Text>
                </View>
              )}
              {currentStore.has_pending_changes && (
                <View style={[styles.inactiveBadge, { backgroundColor: Colors.warning + '15', borderColor: Colors.warning + '30', marginLeft: 8 }]}>
                  <Text style={[styles.inactiveBadgeText, { color: Colors.warning }]}>UNVERIFIED</Text>
                </View>
              )}
            </View>
          </View>
          <View style={styles.badgeRow}>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{currentStore.category}</Text>
            </View>
            {currentStore.city && (
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryText}>{currentStore.city}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabWrapper}>
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'products' && styles.activeTab]}
              onPress={() => setActiveTab('products')}
            >
              <Icon
                name="package-variant-closed"
                size={20}
                color={activeTab === 'products' ? Colors.white : Colors.primary}
              />
              <Text style={[styles.tabText, activeTab === 'products' && styles.activeTabText]}>
                Products
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'info' && styles.activeTab]}
              onPress={() => setActiveTab('info')}
            >
              <Icon
                name={activeTab === 'info' ? 'information' : 'information-outline'}
                size={20}
                color={activeTab === 'info' ? Colors.white : Colors.primary}
              />
              <Text style={[styles.tabText, activeTab === 'info' && styles.activeTabText]}>
                Store Info
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.tabContent}>
          {activeTab === 'products' ? (
            <View style={styles.productsSection}>
              {loading ? (
                <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
              ) : products.length > 0 ? (
              <View style={styles.productsGrid}>
                {products.map((product) => (
                  <CustomerProductCard
                    key={product.id}
                    product={product}
                    onPress={() => navigation.navigate('ProductDetails', { product })}
                    width="48.5%"
                  />
                ))}
              </View>
              ) : (
                <View style={styles.emptyContainer}>
                  <Icon name="package-variant" size={64} color={Colors.border} />
                  <Text style={styles.emptyText}>No products available right now.</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.infoSection}>
              <View style={styles.infoCard}>
                <View style={styles.verificationSection}>
                  <Text style={styles.infoLabel}>Owner Information</Text>
                  
                  <View style={styles.verificationDetail}>
                    <Text style={styles.detailLabel}>Owner Name:</Text>
                    <Text style={styles.detailValue}>{currentStore.owner_name || 'Not provided'}</Text>
                  </View>
                  
                  <View style={styles.verificationDetail}>
                    <Text style={styles.detailLabel}>Owner Number:</Text>
                    <TouchableOpacity onPress={() => handleContact('tel', currentStore.owner_number)}>
                      <Text style={[styles.detailValue, { color: Colors.primary }]}>{currentStore.owner_number || 'Not provided'}</Text>
                    </TouchableOpacity>
                  </View>

                  {!currentStore.is_active && currentStore.verification_images && currentStore.verification_images.length > 0 && (
                    <View style={styles.imagesContainer}>
                      <Text style={styles.detailLabel}>Store Images:</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageGallery}>
                        {currentStore.verification_images.map((img: string, idx: number) => (
                          <TouchableOpacity key={idx} onPress={() => handleContact('browser', img)}>
                            <Image source={{ uri: img }} style={styles.verificationImage} />
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>

                <View style={styles.infoDivider} />

                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Business Information</Text>
                  <View style={styles.verificationDetail}>
                    <Text style={styles.detailLabel}>UPI ID:</Text>
                    <Text style={styles.detailValue}>{currentStore.upi_id || 'Not provided'}</Text>
                  </View>
                  <View style={styles.verificationDetail}>
                    <Text style={styles.detailLabel}>Email:</Text>
                    <Text style={styles.detailValue}>{currentStore.email || 'Not provided'}</Text>
                  </View>
                </View>

                <View style={styles.infoDivider} />

                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>About the Store</Text>
                  <Text style={styles.infoValue}>
                    {currentStore.description || 'Quality products from your neighborhood store.'}
                  </Text>
                </View>

                <View style={styles.infoDivider} />

                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Operating Hours</Text>
                  <View style={styles.infoRow}>
                    <Icon name="clock-outline" size={18} color={Colors.primary} />
                    <Text style={styles.infoValue}>
                      {renderFormattedValue('opening_hours', currentStore.opening_hours) !== 'Not set' ? 
                        renderFormattedValue('opening_hours', currentStore.opening_hours) : 
                        'Contact store for timings'}
                    </Text>
                  </View>
                </View>

                <View style={styles.infoDivider} />

                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Live Location</Text>
                  <View style={styles.infoRow}>
                    <Icon name="crosshairs-gps" size={18} color={Colors.primary} />
                    <Text style={styles.infoValue}>
                      {currentStore.location_wkt ? 
                        currentStore.location_wkt.replace('POINT(', '').replace(')', '').split(' ').reverse().join(', ') : 
                        'Fetching latest coordinates...'}
                    </Text>
                  </View>
                  
                  {currentStore.location_wkt && (
                    <TouchableOpacity 
                      style={styles.mapLink}
                      onPress={() => {
                        const match = currentStore.location_wkt.match(/POINT\(([-\d.]+) ([-\d.]+)\)/);
                        if (match) {
                          const lng = match[1];
                          const lat = match[2];
                          const url = Platform.select({
                            ios: `maps:0,0?q=${currentStore.name}@${lat},${lng}`,
                            android: `geo:0,0?q=${lat},${lng}(${currentStore.name})`
                          });
                          if (url) Linking.openURL(url);
                        }
                      }}
                    >
                      <Icon name="google-maps" size={16} color={Colors.primary} />
                      <Text style={styles.mapLinkText}>View on Map</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.infoDivider} />

                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Address</Text>
                  <View style={styles.infoRow}>
                    <Icon name="map-marker-outline" size={18} color={Colors.error} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.infoValue}>
                        {(currentStore.address_line_1 || currentStore.address) || 'Not provided'}
                        {currentStore.pincode ? ` - ${currentStore.pincode}` : ''}
                        {currentStore.city ? `\n${currentStore.city}` : ''}
                        {currentStore.state ? `, ${currentStore.state}` : ''}
                      </Text>
                    </View>
                  </View>
                </View>

                {(store.phone || store.email || store.whatsapp_number) && (
                  <>
                    <View style={styles.infoDivider} />
                    <View style={styles.infoItem}>
                      <Text style={styles.infoLabel}>Contact Information</Text>
                      <View style={styles.contactActions}>
                        {store.phone && (
                          <TouchableOpacity 
                            style={styles.contactButton} 
                            onPress={() => handleContact('tel', store.phone)}
                          >
                            <Icon name="phone" size={18} color={Colors.white} />
                            <Text style={styles.contactButtonText}>Call</Text>
                          </TouchableOpacity>
                        )}
                        {store.whatsapp_number && (
                          <TouchableOpacity 
                            style={[styles.contactButton, { backgroundColor: '#25D366' }]} 
                            onPress={() => handleContact('whatsapp', store.whatsapp_number)}
                          >
                            <Icon name="whatsapp" size={18} color={Colors.white} />
                            <Text style={styles.contactButtonText}>WhatsApp</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </>
                )}

                {(store.instagram_url || store.facebook_url) && (
                  <>
                    <View style={styles.infoDivider} />
                    <View style={styles.infoItem}>
                      <Text style={styles.infoLabel}>Social Media</Text>
                      <View style={styles.socialRow}>
                        {store.instagram_url && (
                          <TouchableOpacity 
                            style={styles.socialButton}
                            onPress={() => handleContact('browser', store.instagram_url)}
                          >
                            <Icon name="instagram" size={24} color="#E4405F" />
                          </TouchableOpacity>
                        )}
                        {store.facebook_url && (
                          <TouchableOpacity 
                            style={styles.socialButton}
                            onPress={() => handleContact('browser', store.facebook_url)}
                          >
                            <Icon name="facebook" size={24} color="#1877F2" />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </>
                )}
              </View>
              <View style={{ height: 10 }} />
            </View>
          )}
        </View>
      </ScrollView>

      {currentStore.is_active ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
          {currentStore.has_pending_changes && (
            <TouchableOpacity 
              style={[styles.activateButton, { backgroundColor: Colors.success, marginBottom: Spacing.sm }, isActivating && { opacity: 0.7 }]}
              onPress={handleVerifyChanges}
              disabled={isActivating}
            >
              <Icon name="check-circle" size={24} color={Colors.white} />
              <Text style={styles.activateButtonText}>Verify Changed Details</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity 
            style={[styles.activateButton, { backgroundColor: Colors.error }, isActivating && { opacity: 0.7 }]}
            onPress={handleDeactivateStore}
            disabled={isActivating}
          >
            {isActivating ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <>
                <Icon name="close-circle" size={24} color={Colors.white} />
                <Text style={styles.activateButtonText}>Deactivate Store</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
          <TouchableOpacity 
            style={[styles.activateButton, isActivating && { opacity: 0.7 }]}
            onPress={handleActivateStore}
            disabled={isActivating}
          >
            {isActivating ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <>
                <Icon name="check-decagram" size={24} color={Colors.white} />
                <Text style={styles.activateButtonText}>Activate Store</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Verification Changes Modal */}
      <Modal
        visible={isVerificationModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsVerificationModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Icon name="clipboard-check-outline" size={28} color={Colors.primary} />
              <Text style={styles.modalTitle}>Review Changes</Text>
            </View>
            
            <Text style={styles.modalSubtitle}>
              The following details have been updated by the owner. Please review before accepting.
            </Text>

            <ScrollView style={styles.changesList} showsVerticalScrollIndicator={false}>
              {changedFields.map((field, index) => (
                <View key={index} style={styles.changeItem}>
                  <Text style={styles.changeLabel}>{field.label}</Text>
                  <View style={styles.diffContainer}>
                    <View style={styles.oldValueContainer}>
                      <Text style={styles.diffTypeLabel}>Old</Text>
                      <Text style={styles.oldValueText}>{field.old}</Text>
                    </View>
                    <Icon name="arrow-right-thick" size={16} color={Colors.textSecondary} style={{ marginHorizontal: 8 }} />
                    <View style={styles.newValueContainer}>
                      <Text style={styles.diffTypeLabel}>New</Text>
                      <Text style={styles.newValueText}>{field.new}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]} 
                onPress={() => setIsVerificationModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.confirmButton]} 
                onPress={confirmVerification}
                disabled={isActivating}
              >
                {isActivating ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.confirmButtonText}>Accept Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    backgroundColor: Colors.background,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  favButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 22,
    backgroundColor: Colors.white,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerMainTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
    marginLeft: Spacing.sm,
  },
  brandingContainer: {
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  categoryBadge: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  categoryText: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  bannerContainer: {
    width: '100%',
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.sm,
  },
  banner: {
    width: '100%',
    height: 160,
    borderRadius: 24,
    backgroundColor: Colors.surface,
  },
  bannerPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  placeholderText: {
    marginTop: 8,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  tabWrapper: {
    backgroundColor: '#F8F9FA',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    padding: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  activeTab: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginLeft: 8,
  },
  activeTabText: {
    color: Colors.white,
  },
  tabContent: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingBottom: Spacing.md,
  },
  productsSection: {
    flex: 1,
  },
  infoSection: {
    flex: 1,
  },
  infoCard: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoItem: {
    marginVertical: 4,
  },
  infoLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  infoValue: {
    fontSize: 15,
    color: Colors.text,
    lineHeight: 22,
    fontWeight: '500',
  },
  mapLink: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginLeft: 28,
    gap: 4,
  },
  mapLinkText: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '700',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  infoDivider: {
    height: 1,
    backgroundColor: '#F1F3F5',
    marginVertical: Spacing.lg,
  },
  contactActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
  },
  contactButtonText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  socialRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
  },
  socialButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyContainer: {
    marginTop: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginTop: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 7,
    gap: 12,
  },
  storeName: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.text,
    flex: 1,
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inactiveBadge: {
    backgroundColor: Colors.error + '15',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.error + '30',
  },
  inactiveBadgeText: {
    color: Colors.error,
    fontSize: 12,
    fontWeight: '800',
  },
  verificationSection: {
    marginBottom: Spacing.xs,
  },
  verificationDetail: {
    flexDirection: 'row',
    marginBottom: 10,
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '600',
    width: 120,
  },
  detailValue: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '700',
  },
  imagesContainer: {
    marginTop: 12,
  },
  imageGallery: {
    marginTop: 10,
    flexDirection: 'row',
  },
  verificationImage: {
    width: 120,
    height: 120,
    borderRadius: 16,
    marginRight: 12,
    backgroundColor: Colors.border,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
  },
  activateButton: {
    backgroundColor: Colors.success,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: 16,
    gap: 12,
  },
  activateButtonText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    width: '100%',
    maxHeight: '80%',
    padding: 24,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
  },
  modalSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 20,
  },
  changesList: {
    marginBottom: 24,
  },
  changeItem: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  changeLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  diffContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  oldValueContainer: {
    flex: 1,
    backgroundColor: '#FFF1F0',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFD8D6',
  },
  newValueContainer: {
    flex: 1,
    backgroundColor: '#F6FFED',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D9F7BE',
  },
  diffTypeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  oldValueText: {
    fontSize: 13,
    color: '#CF1322',
    fontWeight: '600',
  },
  newValueText: {
    fontSize: 13,
    color: '#389E0D',
    fontWeight: '600',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#F3F4F6',
  },
  confirmButton: {
    backgroundColor: Colors.primary,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
});

export default StoreDetailsScreen;
