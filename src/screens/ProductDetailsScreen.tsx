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
import {launchImageLibrary} from 'react-native-image-picker';
import {decode} from 'base64-arraybuffer';

const {width} = Dimensions.get('window');

const ProductDetailsScreen = ({route, navigation}: any) => {
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
      
      Alert.alert('Success', 'Product image updated');
    } catch (error: any) {
      Alert.alert('Upload Error', error.message);
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
          <View style={styles.header}>
            <View style={styles.titleContainer}>
              <Text style={styles.name}>{product.name}</Text>
              <Text style={styles.category}>{product.category || 'Uncategorized'}</Text>
            </View>
            <Text style={styles.price}>₹{product.price}</Text>
          </View>

          <View style={styles.divider} />

          {/* Admin Info Tags */}
          <View style={styles.tagContainer}>
            <View style={[styles.tag, {backgroundColor: '#E5F1FF'}]}>
              <Icon name="pricetag-outline" size={14} color="#007AFF" />
              <Text style={[styles.tagText, {color: '#007AFF'}]}>
                {product.product_type.toUpperCase()}
              </Text>
            </View>
            {product.weight_kg !== null && (
              <View style={[styles.tag, {backgroundColor: '#FFF4E5'}]}>
                <Icon name="scale-outline" size={14} color="#FF9500" />
                <Text style={[styles.tagText, {color: '#FF9500'}]}>{product.weight_kg} kg</Text>
              </View>
            )}
            {product.barcode && (
              <View style={[styles.tag, {backgroundColor: '#F2F2F7'}]}>
                <Icon name="barcode-outline" size={14} color="#666" />
                <Text style={[styles.tagText, {color: '#666'}]}>{product.barcode}</Text>
              </View>
            )}
          </View>

          {/* Description */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.description}>
              {product.description || 'No description provided for this product.'}
            </Text>
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
                // Future: Navigate to Store Details if needed
              }}
            >
              <Text style={styles.viewStoreText}>View Store Profile</Text>
              <Icon name="chevron-forward" size={16} color="#007AFF" />
            </TouchableOpacity>
          </View>

          {/* Product IDs (Admin Only) */}
          <View style={styles.adminSection}>
            <Text style={styles.adminTitle}>Internal Metadata</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Product ID:</Text>
              <Text style={styles.metaValue}>{product.id}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Last Updated:</Text>
              <Text style={styles.metaValue}>
                {new Date(product.updated_at || Date.now()).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  titleContainer: {
    flex: 1,
    marginRight: 12,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  category: {
    fontSize: 16,
    color: '#8E8E93',
    fontWeight: '500',
  },
  price: {
    fontSize: 24,
    fontWeight: '900',
    color: '#007AFF',
  },
  divider: {
    height: 1,
    backgroundColor: '#F2F2F7',
    marginVertical: 20,
  },
  tagContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  tagText: {
    fontSize: 12,
    fontWeight: 'bold',
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
  adminSection: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 20,
    marginBottom: 40,
  },
  adminTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  metaLabel: {
    fontSize: 13,
    color: '#8E8E93',
  },
  metaValue: {
    fontSize: 13,
    color: '#D1D1D6',
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
    marginLeft: 20,
  },
});

export default ProductDetailsScreen;
