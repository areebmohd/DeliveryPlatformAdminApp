import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  SafeAreaView,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Colors, Spacing, borderRadius } from '../../theme/colors';

interface ToastProps {
  visible: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
  onClose: () => void;
}

const { width } = Dimensions.get('window');

export const Toast = ({ visible, message, type, onClose }: ToastProps) => {
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 20,
          useNativeDriver: true,
          friction: 8,
          tension: 40,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -100,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const getIcon = () => {
    switch (type) {
      case 'success': return { name: 'check-circle', color: Colors.success };
      case 'error': return { name: 'alert-circle', color: Colors.error };
      default: return { name: 'information', color: Colors.info };
    }
  };

  const getBackgroundColor = () => {
    switch (type) {
      case 'success': return Colors.successLight;
      case 'error': return Colors.errorLight;
      default: return Colors.infoLight;
    }
  };

  const icon = getIcon();

  if (!visible) return null;

  return (
    <SafeAreaView style={styles.container} pointerEvents="none">
      <Animated.View
        style={[
          styles.toast,
          {
            transform: [{ translateY }],
            opacity,
            backgroundColor: getBackgroundColor(),
            borderColor: icon.color + '30',
          },
        ]}
      >
        <Icon name={icon.name} size={24} color={icon.color} />
        <Text style={[styles.message, { color: Colors.text }]}>{message}</Text>
      </Animated.View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 40,
    left: 0,
    right: 0,
    zIndex: 9999,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: borderRadius.lg,
    width: width * 0.9,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  message: {
    marginLeft: Spacing.sm,
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
});
export default Toast;
