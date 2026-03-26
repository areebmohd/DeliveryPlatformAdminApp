import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
  Dimensions,
} from 'react-native';
import {supabase} from '../services/supabaseClient';
import {useAlert} from '../context/AlertContext';
import Icon from 'react-native-vector-icons/Ionicons';
import {launchImageLibrary} from 'react-native-image-picker';
import {decode} from 'base64-arraybuffer';

const {width} = Dimensions.get('window');

interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  image_url: string | null;
  product_type: string;
  barcode: string | null;
  weight_kg: number | null;
  stores: {
    name: string;
  };
}

const ProductsScreen = ({navigation}: any) => {
  const {showAlert, showToast} = useAlert();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'barcode' | 'common' | 'personal'>(
    'barcode'
  );
  const [uploading, setUploading] = useState<string | null>(null);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const {data, error} = await supabase
        .from('products')
        .select('*, stores(name)')
        .eq('product_type', activeTab)
        .eq('is_deleted', false)
        .order('created_at', {ascending: false});

      if (error) throw error;
      setProducts(data || []);
    } catch (error: any) {
      showAlert({title: 'Error', message: error.message, type: 'error'});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [activeTab]);

  const handlePickImage = async (productId: string) => {
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
      setUploading(productId);
      const fileName = `${productId}_${Date.now()}.jpg`;
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
        .eq('id', productId);

      if (updateError) throw updateError;

      // Update local state
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? {...p, image_url: publicUrl} : p))
      );
      showToast('Product image updated', 'success');
    } catch (error: any) {
      showAlert({title: 'Upload Error', message: error.message, type: 'error'});
    } finally {
      setUploading(null);
    }
  };

  const renderProductItem = ({item}: {item: Product}) => (
    <TouchableOpacity
      style={styles.productCard}
      onPress={() => navigation.navigate('ProductDetails', {product: item})}>
      <View style={styles.imageContainer}>
        {item.image_url ? (
          <Image source={{uri: item.image_url}} style={styles.productImage} />
        ) : (
          <View style={styles.placeholderImage}>
            <Icon name="cube-outline" size={40} color="#ccc" />
          </View>
        )}
        {activeTab !== 'personal' && (
          <TouchableOpacity
            style={styles.editImageBtn}
            onPress={() => handlePickImage(item.id)}
            disabled={uploading === item.id}>
            {uploading === item.id ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Icon name="camera" size={16} color="#fff" />
            )}
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.contentContainer}>
        <View style={styles.headerRow}>
          <View style={styles.nameContainer}>
            <Text style={styles.productName} numberOfLines={2}>
              {item.name}
            </Text>
            <Text style={styles.category}>{item.category || 'No Category'}</Text>
          </View>
          <View style={styles.priceContainer}>
            <Text style={styles.productPrice}>₹{item.price}</Text>
            {item.weight_kg !== null && (
              <Text style={styles.weightUnderPrice}>{item.weight_kg}kg</Text>
            )}
          </View>
        </View>
        
        {item.barcode && (
          <View style={styles.metaRow}>
            <View style={styles.barcodeBadge}>
              <Icon name="barcode-outline" size={12} color="#666" />
              <Text style={styles.barcodeText}>{item.barcode}</Text>
            </View>
          </View>
        )}

        <View style={styles.storeRow}>
          <Icon name="storefront-outline" size={14} color="#007AFF" />
          <Text style={styles.storeName}>{item.stores?.name || 'Unknown'}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Custom Tab Bar */}
      <View style={styles.tabBar}>
        {(['barcode', 'common', 'personal'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
            onPress={() => setActiveTab(tab)}>
            <Text
              style={[
                styles.tabText,
                activeTab === tab && styles.activeTabText,
              ]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : (
        <FlatList
          data={products}
          renderItem={renderProductItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Icon name="search-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>No {activeTab} products found</Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 8,
    margin: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: '#007AFF',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  activeTabText: {
    color: '#fff',
  },
  listContent: {
    padding: 12,
    paddingBottom: 32,
  },
  columnWrapper: {
    justifyContent: 'space-between',
  },
  productCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: (width - 40) / 2,
    marginBottom: 16,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  imageContainer: {
    width: '100%',
    height: 140,
    backgroundColor: '#f8f8f8',
  },
  productImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  placeholderImage: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editImageBtn: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentContainer: {
    padding: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  nameContainer: {
    flex: 1,
    marginRight: 8,
  },
  productName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 2,
  },
  productPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  priceContainer: {
    alignItems: 'flex-end',
  },
  weightUnderPrice: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '600',
    marginTop: 1,
  },
  category: {
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 6,
  },
  barcodeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  barcodeText: {
    fontSize: 10,
    color: '#666',
    marginLeft: 2,
  },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F2F2F7',
    paddingTop: 6,
  },
  storeName: {
    fontSize: 11,
    color: '#007AFF',
    marginLeft: 4,
    fontWeight: '600',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 100,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
    color: '#8E8E93',
    fontWeight: '500',
  },
});

export default ProductsScreen;
