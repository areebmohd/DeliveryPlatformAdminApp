import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Dimensions,
  ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Colors, Spacing, borderRadius } from '../../theme/colors';

interface AlertAction {
  text: string;
  description?: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'destructive' | 'outline';
}

interface AlertModalProps {
  visible: boolean;
  title: string;
  message: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  onClose: () => void;
  actions?: AlertAction[];
  primaryAction?: AlertAction;
  secondaryAction?: AlertAction;
  tertiaryAction?: AlertAction;
  showCancel?: boolean;
  cancelText?: string;
  verticalButtons?: boolean;
}

export const AlertModal = ({
  visible,
  title,
  message,
  type = 'info',
  onClose,
  primaryAction,
  secondaryAction,
  tertiaryAction,
  showCancel = true,
  cancelText = 'Cancel',
  verticalButtons = false,
}: AlertModalProps) => {
  const scaleValue = useRef(new Animated.Value(0)).current;

  // Combine actions into a single array for rendering
  const finalActions: AlertAction[] = [];
  if (primaryAction) finalActions.push(primaryAction);
  if (secondaryAction) finalActions.push(secondaryAction);
  if (tertiaryAction) finalActions.push(tertiaryAction);

  // Horizontal reversal for design (Primary on right)
  if (!verticalButtons) {
    finalActions.reverse();
  }
  
  // Safety: If no actions are provided, force showCancel to true
  const finalShowCancel = showCancel || finalActions.length === 0;

  useEffect(() => {
    if (visible) {
      scaleValue.setValue(0.85);
      Animated.spring(scaleValue, {
        toValue: 1,
        useNativeDriver: true,
        friction: 8,
        tension: 40,
      }).start();
    }
  }, [visible]);

  const getIcon = () => {
    switch (type) {
      case 'success': return { name: 'check-circle', color: Colors.success, bgColor: Colors.successLight };
      case 'error': return { name: 'alert-circle', color: Colors.error, bgColor: Colors.errorLight };
      case 'warning': return { name: 'alert', color: Colors.warning, bgColor: Colors.warningLight };
      default: return { name: 'information', color: Colors.info, bgColor: Colors.infoLight };
    }
  };

  const icon = getIcon();

  const renderButton = (action: AlertAction, index: number) => {
    const isDestructive = action.variant === 'destructive';
    const isOutline = action.variant === 'outline';
    const isSecondary = action.variant === 'secondary';

    return (
      <TouchableOpacity 
        key={index}
        activeOpacity={0.8}
        style={[
          styles.button, 
          verticalButtons ? styles.verticalButton : { flex: 1 },
          isDestructive && { backgroundColor: Colors.error },
          isOutline && { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: icon.color },
          isSecondary && { backgroundColor: Colors.background },
          !isDestructive && !isOutline && !isSecondary && { backgroundColor: icon.color },
        ]} 
        onPress={() => {
          action.onPress();
          onClose();
        }}
      >
        <Text style={[
          styles.buttonText,
          isOutline && { color: icon.color },
          isSecondary && { color: Colors.textSecondary },
        ]}>
          {action.text}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Animated.View style={[
          styles.modalContainer,
          { transform: [{ scale: scaleValue }] }
        ]}>
          <View style={[styles.iconContainer, { backgroundColor: icon.bgColor }]}>
            <Icon name={icon.name} size={42} color={icon.color} />
          </View>
          
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <View style={[styles.buttonContainer, verticalButtons && styles.verticalButtonContainer]}>
            {finalActions.map(renderButton)}

            {finalShowCancel && (
              <TouchableOpacity 
                activeOpacity={0.7}
                style={[
                  styles.button, 
                  styles.secondaryButton, 
                  verticalButtons ? styles.verticalButton : { flex: 1 }
                ]} 
                onPress={onClose}
              >
                <Text style={styles.secondaryButtonText}>{cancelText}</Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  modalContainer: {
    width: '100%',
    backgroundColor: Colors.white,
    borderRadius: borderRadius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  iconContainer: {
    width: 84,
    height: 84,
    borderRadius: 42,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.sm,
    letterSpacing: -0.5,
  },
  message: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: Spacing.xxl,
    paddingHorizontal: Spacing.sm,
  },
  buttonContainer: {
    flexDirection: 'row',
    width: '100%',
    gap: Spacing.md,
  },
  verticalButtonContainer: {
    flexDirection: 'column',
    gap: Spacing.md,
  },
  button: {
    height: 56,
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  verticalButton: {
    width: '100%',
  },
  buttonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 16,
  },
  secondaryButton: {
    backgroundColor: Colors.background,
  },
  secondaryButtonText: {
    color: Colors.textSecondary,
    fontWeight: '600',
    fontSize: 16,
  },
});
