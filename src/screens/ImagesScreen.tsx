import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Dimensions,
  FlatList,
  Alert,
} from 'react-native';
import {supabase} from '../services/supabaseClient';
import {useAlert} from '../context/AlertContext';
import Icon from 'react-native-vector-icons/Ionicons';
import {launchImageLibrary} from 'react-native-image-picker';
import {decode} from 'base64-arraybuffer';

const {width} = Dimensions.get('window');

const PRODUCT_CATEGORIES = [
  'Clothing & Accessories',
  'Electronics',
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

const ImagesScreen = () => {
  const {showAlert, showToast} = useAlert();
  const [activeTab, setActiveTab] = useState<'banners' | 'categories'>('banners');
  const [banners, setBanners] = useState<any[]>([]);
  const [categoryImages, setCategoryImages] = useState<{[key: string]: string}>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    try {
      setLoading(true);
      if (activeTab === 'banners') {
        const {data, error} = await supabase
          .from('home_banners')
          .select('*')
          .order('created_at', {ascending: false});
        if (error) throw error;
        setBanners(data || []);
      } else {
        const {data, error} = await supabase
          .from('category_images')
          .select('*');
        if (error) throw error;
        const mapping: {[key: string]: string} = {};
        data?.forEach((item: any) => {
          mapping[item.category_name] = item.image_url;
        });
        setCategoryImages(mapping);
      }
    } catch (error: any) {
      showAlert({title: 'Error', message: error.message, type: 'error'});
    } finally {
      setLoading(false);
    }
  };

  const handlePickImage = async (id: string, type: 'banner' | 'category') => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      includeBase64: true,
      quality: 0.7,
    });

    if (result.didCancel || !result.assets || result.assets.length === 0) {
      return;
    }

    const asset = result.assets[0];
    if (!asset.base64) return;

    try {
      setUploading(id);
      
      // Delete old image if it exists
      let oldUrl = '';
      if (type === 'banner') {
          if (id !== 'new') {
              const banner = banners.find(b => b.id === id);
              if (banner) oldUrl = banner.image_url;
          }
      } else {
          oldUrl = categoryImages[id] || '';
      }

      if (oldUrl) {
          try {
              const decodedUrl = decodeURIComponent(oldUrl);
              const parts = decodedUrl.split('/');
              const fileName = parts[parts.length - 1].split('?')[0];
              if (fileName) {
                  await supabase.storage.from('banners').remove([`home/${fileName}`]);
              }
          } catch (e) {
              console.error('Error deleting old image:', e);
          }
      }

      const fileName = `${type}_${id.replace(/\s+/g, '_')}_${Date.now()}.jpg`;
      const filePath = `home/${fileName}`;

      const {data: uploadData, error: uploadError} = await supabase.storage
        .from('banners')
        .upload(filePath, decode(asset.base64), {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const {
        data: {publicUrl},
      } = supabase.storage.from('banners').getPublicUrl(filePath);

      if (type === 'banner') {
          if (id === 'new') {
              const {error} = await supabase
                  .from('home_banners')
                  .insert({image_url: publicUrl});
              if (error) throw error;
          } else {
              const {error} = await supabase
                  .from('home_banners')
                  .update({image_url: publicUrl, updated_at: new Date()})
                  .eq('id', id);
              if (error) throw error;
          }
      } else {
          const {error} = await supabase
              .from('category_images')
              .upsert({category_name: id, image_url: publicUrl, updated_at: new Date()}, {onConflict: 'category_name'});
          if (error) throw error;
      }

      showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} image updated`, 'success');
      fetchData();
    } catch (error: any) {
      showAlert({title: 'Upload Error', message: error.message, type: 'error'});
    } finally {
      setUploading(null);
    }
  };

  const handleDeleteBanner = async (id: string, imageUrl: string) => {
      Alert.alert(
          'Delete Banner',
          'Are you sure you want to delete this banner?',
          [
              {text: 'Cancel', style: 'cancel'},
              {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                      try {
                          const {error} = await supabase.from('home_banners').delete().eq('id', id);
                          if (error) throw error;
                          
                          const decodedUrl = decodeURIComponent(imageUrl);
                          const parts = decodedUrl.split('/');
                          const fileName = parts[parts.length - 1].split('?')[0];
                          if (fileName) {
                              await supabase.storage.from('banners').remove([`home/${fileName}`]);
                          }
                          
                          setBanners(prev => prev.filter(b => b.id !== id));
                          showToast('Banner deleted', 'success');
                      } catch (error: any) {
                          showAlert({title: 'Error', message: error.message, type: 'error'});
                      }
                  }
              }
          ]
      );
  };

  const renderBannerItem = ({item}: {item: any}) => (
    <View style={styles.bannerCard}>
      <Image source={{uri: item.image_url}} style={styles.bannerImage} />
      <View style={styles.bannerActions}>
          <TouchableOpacity 
            style={styles.actionBtn} 
            onPress={() => handlePickImage(item.id, 'banner')}
            disabled={uploading === item.id}
          >
              {uploading === item.id ? (
                  <ActivityIndicator size="small" color="#007AFF" />
              ) : (
                  <Icon name="pencil" size={20} color="#007AFF" />
              )}
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.actionBtn]} 
            onPress={() => handleDeleteBanner(item.id, item.image_url)}
          >
              <Icon name="trash-outline" size={20} color="#FF3B30" />
          </TouchableOpacity>
      </View>
    </View>
  );

  const renderCategoryItem = ({item}: {item: string}) => (
    <View style={styles.categoryCard}>
        <View style={styles.categoryImageContainer}>
            {categoryImages[item] ? (
                <Image source={{uri: categoryImages[item]}} style={styles.categoryImage} />
            ) : (
                <View style={styles.placeholderImage}>
                    <Icon name="image-outline" size={40} color="#ccc" />
                </View>
            )}
            <TouchableOpacity 
                style={styles.editCategoryBtn}
                onPress={() => handlePickImage(item, 'category')}
                disabled={uploading === item}
            >
                {uploading === item ? (
                    <ActivityIndicator size="small" color="#fff" />
                ) : (
                    <Icon name="camera" size={20} color="#fff" />
                )}
            </TouchableOpacity>
        </View>
        <Text style={styles.categoryName} numberOfLines={2}>{item}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'banners' && styles.activeTab]}
          onPress={() => setActiveTab('banners')}>
          <Text style={[styles.tabText, activeTab === 'banners' && styles.activeTabText]}>
            Banners
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'categories' && styles.activeTab]}
          onPress={() => setActiveTab('categories')}>
          <Text style={[styles.tabText, activeTab === 'categories' && styles.activeTabText]}>
            Categories
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : activeTab === 'banners' ? (
        <View style={{flex: 1}}>
            <FlatList
                data={banners}
                renderItem={renderBannerItem}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.listContent}
                ListHeaderComponent={
                    <TouchableOpacity 
                        style={styles.addBannerBtn}
                        onPress={() => handlePickImage('new', 'banner')}
                    >
                        <Icon name="add-circle-outline" size={24} color="#007AFF" />
                        <Text style={styles.addBannerText}>Add New Banner</Text>
                    </TouchableOpacity>
                }
                ListEmptyComponent={
                    <View style={styles.centered}>
                        <Icon name="image-outline" size={64} color="#ccc" />
                        <Text style={styles.emptyText}>No banners added yet</Text>
                    </View>
                }
            />
        </View>
      ) : (
        <FlatList
          data={PRODUCT_CATEGORIES}
          renderItem={renderCategoryItem}
          keyExtractor={item => item}
          contentContainerStyle={styles.listContent}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
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
    padding: 16,
    paddingBottom: 40,
  },
  bannerCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  bannerImage: {
    width: '100%',
    height: 180,
    resizeMode: 'cover',
  },
  bannerActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      padding: 8,
      borderTopWidth: 1,
      borderTopColor: '#F2F2F7',
  },
  actionBtn: {
      padding: 8,
      marginLeft: 16,
  },
  addBannerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#fff',
      padding: 16,
      borderRadius: 12,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: '#007AFF',
      borderStyle: 'dashed',
  },
  addBannerText: {
      marginLeft: 8,
      fontSize: 16,
      fontWeight: '600',
      color: '#007AFF',
  },
  columnWrapper: {
    justifyContent: 'space-between',
  },
  categoryCard: {
      width: (width - 48) / 2,
      backgroundColor: '#fff',
      borderRadius: 16,
      marginBottom: 16,
      overflow: 'hidden',
      elevation: 2,
  },
  categoryImageContainer: {
      width: '100%',
      height: 120,
      backgroundColor: '#f8f8f8',
  },
  categoryImage: {
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
  editCategoryBtn: {
      position: 'absolute',
      bottom: 8,
      right: 8,
      backgroundColor: 'rgba(0,0,0,0.6)',
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
  },
  categoryName: {
      padding: 12,
      fontSize: 14,
      fontWeight: 'bold',
      color: '#1C1C1E',
      textAlign: 'center',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 50,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
    color: '#8E8E93',
  },
});

export default ImagesScreen;
