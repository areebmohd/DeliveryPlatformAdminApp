import React, {useState} from 'react';
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
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {supabase} from '../services/supabaseClient';
import {useAlert} from '../context/AlertContext';
import {launchImageLibrary} from 'react-native-image-picker';
import {decode} from 'base64-arraybuffer';

const {width} = Dimensions.get('window');

const ProductDetailsScreen = ({route, navigation}: any) => {
  const {showAlert, showToast} = useAlert();
  const {product: initialProduct} = route.params;
  const insets = useSafeAreaInsets();
  const [product, setProduct] = useState(initialProduct);
  const [uploading, setUploading] = useState(false);

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
              <Text style={styles.name}>{product.name}</Text>
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryText}>{product.category || 'Uncategorized'}</Text>
              </View>
            </View>
            <View style={styles.priceWeightRow}>
              <Text style={styles.price}>₹{product.price}</Text>
              {product.weight_kg !== null && (
                <Text style={styles.weight}> • {product.weight_kg} kg</Text>
              )}
              <View style={[styles.typeBadge, { 
                backgroundColor: product.product_type === 'barcode' ? '#E5F1FF' : 
                                product.product_type === 'common' ? '#FFF4E5' : '#F2F2F7' 
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
            <Text style={styles.sectionTitle}>Description</Text>
            {(() => {
              try {
                if (!product.description) return <Text style={styles.description}>No description available.</Text>;
                const parsed = JSON.parse(product.description);
                if (Array.isArray(parsed) && parsed.length > 0) {
                  return (
                    <View style={styles.specList}>
                      {parsed.map((item: any, idx: number) => (
                        <View key={idx} style={styles.specItem}>
                          <Text style={styles.specLabel}>{item.title || 'Info'}</Text>
                          <Text style={styles.specValue}>{item.text}</Text>
                        </View>
                      ))}
                    </View>
                  );
                }
                return <Text style={styles.description}>{product.description}</Text>;
              } catch (e) {
                return <Text style={styles.description}>{product.description}</Text>;
              }
            })()}
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

        </View>
      </ScrollView>
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
});

export default ProductDetailsScreen;
