import React, {useState, useLayoutEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Dimensions,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {supabase} from '../services/supabaseClient';
import {useAlert} from '../context/AlertContext';
import {launchImageLibrary} from 'react-native-image-picker';
import {decode} from 'base64-arraybuffer';

const {width, height} = Dimensions.get('window');

const PRODUCT_CATEGORIES = [
  'Clothing & Accessories',
  'Electronics & Appliances',
  'Food & Beverages',
  'Health & Beauty',
  'Home & Garden',
  'Toys, Baby & Games',
  'Sports & Outdoors',
  'Vehicles & Parts',
  'Hardware & Industrial',
  'Animals & Pet Supplies',
  'Arts, Crafts & Entertainment',
  'Office & School',
  'Others',
];

const ProductDetailsScreen = ({route, navigation}: any) => {
  const {showAlert, showToast} = useAlert();
  const {product: initialProduct} = route.params;
  const insets = useSafeAreaInsets();
  const [product, setProduct] = useState(initialProduct);
  const [uploading, setUploading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isPickerVisible, setIsPickerVisible] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        product.product_type === 'barcode' ? (
          <TouchableOpacity 
            onPress={() => setIsEditing(!isEditing)}
            style={{
              marginRight: 10, 
              padding: 5,
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: isEditing ? '#FFF2F2' : '#F0F7FF',
              borderRadius: 20,
              paddingHorizontal: 12,
              paddingVertical: 6,
            }}
          >
            <Icon 
              name={isEditing ? "close-circle" : "create-outline"} 
              size={18} 
              color={isEditing ? "#FF3B30" : "#007AFF"} 
            />
            <Text style={{
              marginLeft: 4,
              fontSize: 14,
              fontWeight: '600',
              color: isEditing ? "#FF3B30" : "#007AFF",
            }}>
              {isEditing ? "Close" : "Edit"}
            </Text>
          </TouchableOpacity>
        ) : null
      ),
    });
  }, [navigation, isEditing, product.product_type]);

  // Form states
  const [name, setName] = useState(product.name || '');
  const [price, setPrice] = useState(product.price?.toString() || '');
  const [weight, setWeight] = useState(product.weight_kg?.toString() || '');
  const [category, setCategory] = useState(product.category || '');
  
  const getInitialDescription = () => {
    try {
      if (!product.description) return [{ title: '', text: '' }];
      const parsed = JSON.parse(product.description);
      if (Array.isArray(parsed)) return parsed;
      return [{ title: 'Description', text: product.description }];
    } catch (e) {
      return [{ title: 'Description', text: product.description || '' }];
    }
  };
  const [descriptionPairs, setDescriptionPairs] = useState<any[]>(getInitialDescription());

  const handlePickImage = async () => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      includeBase64: true,
      quality: 0.5,
    });

    if (result.didCancel || !result.assets || result.assets.length === 0) {
      return;
    }

    const asset = result.assets[0];
    if (!asset.base64) return;

    try {
      setUploading(true);
      const fileName = `${product.id}_${Date.now()}.jpg`;
      const filePath = `product_images/${fileName}`;

      const {data: uploadData, error: uploadError} = await supabase.storage
        .from('products')
        .upload(filePath, decode(asset.base64), {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const {
        data: {publicUrl},
      } = supabase.storage.from('products').getPublicUrl(filePath);

      const {error: updateError} = await supabase
        .from('products')
        .update({image_url: publicUrl})
        .eq('id', product.id);

      if (updateError) throw updateError;

      // Update local state and pass back to previous screen if needed
      const updatedProduct = {...product, image_url: publicUrl};
      setProduct(updatedProduct);
      
      showToast('Product image updated', 'success');
    } catch (error: any) {
      showAlert({title: 'Upload Error', message: error.message, type: 'error'});
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!name || !price) {
      showAlert({ title: 'Required Fields', message: 'Name and Price are required.', type: 'warning' });
      return;
    }

    try {
      setLoading(true);
      const isComplete = !!name && !!product.image_url && !!price && !!category;
      
      const { error } = await supabase
        .from('products')
        .update({
          name,
          price: parseFloat(price),
          weight_kg: parseFloat(weight) || 0,
          category,
          description: JSON.stringify(descriptionPairs.filter(p => p.title.trim() || p.text.trim())),
          is_info_complete: isComplete,
          needs_changes: false, // Clear flag when admin updates
          is_wrong_barcode: false, // Clear flag if it was set
          updated_at: new Date().toISOString(),
        })
        .eq('id', product.id);

      if (error) throw error;
      
      const updatedProduct = {
        ...product,
        name,
        price: parseFloat(price),
        weight_kg: parseFloat(weight) || 0,
        category,
        description: JSON.stringify(descriptionPairs.filter(p => p.title.trim() || p.text.trim())),
        is_info_complete: isComplete,
        needs_changes: false,
        is_wrong_barcode: false,
      };
      setProduct(updatedProduct);
      setIsEditing(false);
      showToast('Product updated successfully', 'success');
    } catch (error: any) {
      showAlert({ title: 'Error', message: error.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleWrongBarcode = async () => {
    try {
      setLoading(true);
      
      // 1. Send Notification to Business group
      const { error: notifError } = await supabase
        .from('notifications')
        .insert({
          title: 'Product Removed',
          description: `The product you entered with barcode ${product.barcode || 'N/A'} has been removed by admin because it has either wrong or not officially registered barcode.`,
          target_group: 'business',
        });

      if (notifError) throw notifError;

      // 2. Soft delete the product
      const { error: deleteError } = await supabase
        .from('products')
        .update({ is_deleted: true })
        .eq('id', product.id);
      
      if (deleteError) throw deleteError;
      
      showToast('Product removed and store notified', 'success');
      navigation.goBack();
    } catch (error: any) {
      showAlert({ title: 'Error', message: error.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Image Section */}
        <View style={styles.imageContainer}>
          {product.image_url ? (
            <Image source={{uri: product.image_url}} style={styles.image} />
          ) : (
            <View style={styles.placeholderImage}>
              <Icon name="cube-outline" size={80} color="#ccc" />
              <Text style={styles.placeholderText}>No Image Available</Text>
            </View>
          )}

          {/* Upload Button overlay */}
          {product.product_type !== 'personal' && (
            <TouchableOpacity 
              style={styles.uploadBtnOverlay} 
              onPress={handlePickImage}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Icon name="camera" size={20} color="#fff" />
                  <Text style={styles.uploadBtnText}>
                    {product.image_url ? 'Change Photo' : 'Add Photo'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>



        {/* Content Section */}
        <View style={styles.content}>
          <View style={styles.headerInfo}>
            <View style={styles.nameRow}>
              {isEditing ? (
                <View style={styles.editInputContainer}>
                  <Text style={styles.editLabel}>Product Name</Text>
                  <TextInput
                    style={styles.editInput}
                    value={name}
                    onChangeText={setName}
                    placeholder="Enter product name"
                    placeholderTextColor="#999"
                  />
                </View>
              ) : (
                <Text style={styles.name}>{product.name}</Text>
              )}
              
              {isEditing ? (
                <View style={styles.editInputContainer}>
                  <Text style={styles.editLabel}>Category</Text>
                  <TouchableOpacity 
                    style={styles.pickerTrigger}
                    onPress={() => setIsPickerVisible(true)}
                  >
                    <Text style={category ? styles.pickerText : styles.pickerPlaceholder}>
                      {category || 'Select Category'}
                    </Text>
                    <Icon name="chevron-down" size={18} color="#007AFF" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.categoryBadge}>
                  <Text style={styles.categoryText}>{product.category || 'Uncategorized'}</Text>
                </View>
              )}
            </View>
            <View style={styles.priceWeightRow}>
              {isEditing ? (
                <View style={[styles.inlineInputs, {marginTop: 8}]}>
                  <View style={[styles.editInputContainer, {flex: 1}]}>
                    <Text style={styles.editLabel}>Price (₹)</Text>
                    <TextInput
                      style={styles.editInput}
                      value={price}
                      onChangeText={setPrice}
                      keyboardType="numeric"
                      placeholder="0.00"
                      placeholderTextColor="#999"
                    />
                  </View>
                  <View style={[styles.editInputContainer, {flex: 1, marginLeft: 12}]}>
                    <Text style={styles.editLabel}>Weight (kg)</Text>
                    <TextInput
                      style={styles.editInput}
                      value={weight}
                      onChangeText={setWeight}
                      keyboardType="numeric"
                      placeholder="0.0"
                      placeholderTextColor="#999"
                    />
                  </View>
                </View>
              ) : (
                <>
                  <Text style={styles.price}>₹{product.price}</Text>
                  {product.weight_kg !== null && (
                    <Text style={styles.weight}> • {product.weight_kg} kg</Text>
                  )}
                </>
              )}
              <View style={[styles.typeBadge, { 
                backgroundColor: product.product_type === 'barcode' ? '#E5F1FF' : 
                                product.product_type === 'common' ? '#FFF4E5' : '#F2F2F7',
                marginLeft: isEditing ? 12 : 12 
              }]}>
                <Text style={[styles.typeText, { 
                  color: product.product_type === 'barcode' ? '#007AFF' : 
                          product.product_type === 'common' ? '#FF9500' : '#666' 
                }]}>{product.product_type}</Text>
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Description / Specifications */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Description</Text>
              {isEditing && (
                <TouchableOpacity onPress={() => setDescriptionPairs([...descriptionPairs, { title: '', text: '' }])}>
                  <Icon name="add-circle" size={24} color="#007AFF" />
                </TouchableOpacity>
              )}
            </View>
            {isEditing ? (
              <View style={styles.specList}>
                {descriptionPairs.map((pair: any, idx: number) => (
                  <View key={idx} style={styles.specEditItem}>
                    <View style={styles.specEditHeader}>
                      <View style={{flex: 1}}>
                        <Text style={styles.editLabel}>Detail Title</Text>
                        <TextInput
                          style={styles.editInputSmall}
                          value={pair.title}
                          onChangeText={(val) => {
                            const newPairs = [...descriptionPairs];
                            newPairs[idx].title = val;
                            setDescriptionPairs(newPairs);
                          }}
                          placeholder="e.g. Color, Material"
                          placeholderTextColor="#999"
                        />
                      </View>
                      <TouchableOpacity 
                        style={styles.deleteSpecBtn}
                        onPress={() => setDescriptionPairs(descriptionPairs.filter((_, i) => i !== idx))}
                      >
                        <Icon name="trash" size={18} color="#FF3B30" />
                      </TouchableOpacity>
                    </View>
                    <View style={{marginTop: 10}}>
                      <Text style={styles.editLabel}>Detail Value</Text>
                      <TextInput
                        style={[styles.editInputSmall, {height: 60, textAlignVertical: 'top'}]}
                        value={pair.text}
                        onChangeText={(val) => {
                          const newPairs = [...descriptionPairs];
                          newPairs[idx].text = val;
                          setDescriptionPairs(newPairs);
                        }}
                        placeholder="Enter value..."
                        placeholderTextColor="#999"
                        multiline
                      />
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              (() => {
                try {
                  if (!product.description || product.description === '[]') 
                    return <Text style={styles.description}>N/A</Text>;
                  
                  const parsed = JSON.parse(product.description);
                  if (Array.isArray(parsed) && parsed.length > 0) {
                    const validPairs = parsed.filter(p => p.title.trim() || p.text.trim());
                    if (validPairs.length === 0) return <Text style={styles.description}>N/A</Text>;
                    
                    return (
                      <View style={styles.specList}>
                        {validPairs.map((item: any, idx: number) => (
                          <View key={idx} style={styles.specItem}>
                            <Text style={styles.specLabel}>{item.title || 'Info'}</Text>
                            <Text style={styles.specValue}>{item.text}</Text>
                          </View>
                        ))}
                      </View>
                    );
                  }
                  return <Text style={styles.description}>{product.description || 'N/A'}</Text>;
                } catch (e) {
                  return <Text style={styles.description}>{product.description || 'N/A'}</Text>;
                }
              })()
            )}
          </View>

          {/* Store Info */}
          <View style={styles.storeCard}>
            <View style={styles.storeHeader}>
              <Icon name="storefront" size={20} color="#007AFF" />
              <Text style={styles.storeTitle}>Source Store</Text>
            </View>
            <Text style={styles.storeName}>{product.stores?.name || 'Unknown Store'}</Text>
            <TouchableOpacity 
              style={styles.viewStoreBtn}
              onPress={() => {
                if (product.store_id) {
                  navigation.navigate('StoreDetails', { store: { id: product.store_id } });
                } else if (product.stores?.id) {
                  navigation.navigate('StoreDetails', { store: { id: product.stores.id } });
                } else {
                  showAlert({title: 'Error', message: 'Store information not found for this product.', type: 'error'});
                }
              }}
            >
              <Text style={styles.viewStoreText}>View Store Profile</Text>
              <Icon name="chevron-forward" size={16} color="#007AFF" />
            </TouchableOpacity>
          </View>

          {isEditing && (
            <View style={styles.actionSection}>
              <TouchableOpacity 
                style={[styles.actionBtn, styles.wrongBarcodeBtn]} 
                onPress={handleWrongBarcode}
                disabled={loading}
              >
                <Icon name="barcode-outline" size={20} color="#FF3B30" />
                <Text style={styles.wrongBarcodeText}>Wrong Barcode</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.actionBtn, styles.saveBtn]} 
                onPress={handleSave}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Icon name="save-outline" size={20} color="#fff" />
                    <Text style={styles.saveText}>Save Changes</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

        </View>
      </ScrollView>

      {/* Category Picker Modal */}
      <Modal
        visible={isPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Category</Text>
              <TouchableOpacity onPress={() => setIsPickerVisible(false)}>
                <Icon name="close" size={24} color="#1C1C1E" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.pickerList}>
              {PRODUCT_CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.pickerItem,
                    category === cat && styles.activePickerItem
                  ]}
                  onPress={() => {
                    setCategory(cat);
                    setIsPickerVisible(false);
                  }}
                >
                  <Text style={[
                    styles.pickerItemText,
                    category === cat && styles.activePickerItemText
                  ]}>
                    {cat}
                  </Text>
                  {category === cat && (
                    <Icon name="checkmark-circle" size={20} color="#007AFF" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  imageContainer: {
    width: width,
    height: width,
    backgroundColor: '#F8F8F8',
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  placeholderImage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    marginTop: 12,
    fontSize: 14,
    color: '#999',
    fontWeight: '500',
  },
  uploadBtnOverlay: {
    position: 'absolute',
    bottom: 40,
    right: 20,
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  uploadBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  content: {
    padding: 20,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    marginTop: -30,
    backgroundColor: '#fff',
    minHeight: height - 100,
  },
  headerInfo: {
    marginBottom: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  categoryBadge: {
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryText: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  priceWeightRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  price: {
    fontSize: 22,
    fontWeight: '800',
    color: '#007AFF',
  },
  weight: {
    fontSize: 18,
    color: '#8E8E93',
    fontWeight: '500',
  },
  typeBadge: {
    marginLeft: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  divider: {
    height: 1,
    backgroundColor: '#F2F2F7',
    marginVertical: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 10,
  },
  description: {
    fontSize: 15,
    color: '#3A3A3C',
    lineHeight: 22,
  },
  specList: {
    marginTop: 8,
  },
  specItem: {
    marginBottom: 16,
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F1F3F5',
  },
  specLabel: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  specValue: {
    fontSize: 15,
    color: '#1C1C1E',
    lineHeight: 20,
    fontWeight: '600',
  },
  storeCard: {
    backgroundColor: '#F8F8F8',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#F2F2F7',
  },
  storeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  storeTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  storeName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 12,
  },
  viewStoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    paddingTop: 12,
  },
  viewStoreText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
  },
  editInputContainer: {
    marginBottom: 16,
    width: '100%',
  },
  editLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8E8E93',
    textTransform: 'uppercase',
    marginBottom: 6,
    marginLeft: 4,
  },
  editInput: {
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  pickerTrigger: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  pickerText: {
    fontSize: 16,
    color: '#1C1C1E',
    fontWeight: '500',
  },
  pickerPlaceholder: {
    fontSize: 16,
    color: '#8E8E93',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: height * 0.7,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  pickerList: {
    padding: 10,
  },
  pickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 4,
  },
  activePickerItem: {
    backgroundColor: '#F0F7FF',
  },
  pickerItemText: {
    fontSize: 16,
    color: '#1C1C1E',
  },
  activePickerItemText: {
    color: '#007AFF',
    fontWeight: '600',
  },
  editableInput: {
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  inlineInputs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  specHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionSection: {
    gap: 12,
    marginTop: 20,
    marginBottom: 40,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  wrongBarcodeBtn: {
    borderWidth: 1,
    borderColor: '#FF3B30',
  },
  wrongBarcodeText: {
    color: '#FF3B30',
    fontWeight: 'bold',
  },
  specEditItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  specEditHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  editInputSmall: {
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  deleteSpecBtn: {
    padding: 8,
    marginTop: 20,
  },
  saveBtn: {
    backgroundColor: '#007AFF',
  },
  saveText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});

export default ProductDetailsScreen;
