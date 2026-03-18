import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const Colors = {
  primary: '#007bff',
  primaryLight: '#e7f1ff',
  background: '#F8F9FA',
  surface: '#F8F9FA',
  text: '#1F2937',
  textSecondary: '#6B7280',
  border: '#E5E7EB',
  white: '#FFFFFF',
  black: '#000000',
};
const Spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

interface CustomerProductCardProps {
  product: {
    id: string;
    name: string;
    description?: string;
    price: number;
    weight_kg?: number;
    category?: string;
    image_url?: string;
  };
  onPress?: () => void;
  width?: any;
}

export const CustomerProductCard = ({ 
  product, 
  onPress,
  width = '100%',
}: CustomerProductCardProps) => {
  return (
    <TouchableOpacity 
      style={[styles.container, { width }]} 
      onPress={onPress}
      activeOpacity={onPress ? 0.9 : 1}
      disabled={!onPress}
    >
      <View style={styles.imageContainer}>
        {product.image_url ? (
          <Image source={{ uri: product.image_url }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Icon name="package-variant" size={30} color={Colors.border} />
          </View>
        )}
      </View>

      <View style={styles.content}>
        <Text style={styles.name} numberOfLines={1}>{product.name}</Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>₹{product.price}</Text>
          {product.weight_kg ? (
            <Text style={styles.weight}>
               / {product.weight_kg < 1 ? `${product.weight_kg * 1000}gm` : `${product.weight_kg}kg`}
            </Text>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
    backgroundColor: Colors.primaryLight,
    padding: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  imageContainer: {
    position: 'relative',
    width: '100%',
  },
  image: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 16,
    backgroundColor: Colors.white,
  },
  imagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  content: {
    marginTop: 10,
    paddingHorizontal: 4,
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.black,
    marginBottom: 2,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  price: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.primary,
  },
  weight: {
    fontSize: 11,
    color: Colors.primary,
    opacity: 0.8,
    marginLeft: 2,
  },
});
