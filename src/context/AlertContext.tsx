import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { AlertModal } from '../components/ui/AlertModal';
import Toast from '../components/ui/Toast';

interface AlertAction {
  text: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'destructive' | 'outline';
}

interface AlertConfig {
  visible: boolean;
  title: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  primaryAction?: AlertAction;
  secondaryAction?: AlertAction;
  tertiaryAction?: AlertAction;
  showCancel?: boolean;
  cancelText?: string;
  verticalButtons?: boolean;
  onClose?: () => void;
}

interface ToastConfig {
  visible: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface AlertContextData {
  showAlert: (config: Omit<AlertConfig, 'visible'>) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info', duration?: number) => void;
  hideAlert: () => void;
}

const AlertContext = createContext<AlertContextData>({} as AlertContextData);

export const AlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
  });

  const [toastConfig, setToastConfig] = useState<ToastConfig>({
    visible: false,
    message: '',
    type: 'info',
  });

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showAlert = useCallback((config: Omit<AlertConfig, 'visible'>) => {
    setAlertConfig({ ...config, visible: true });
  }, []);

  const hideAlert = useCallback(() => {
    setAlertConfig(prev => {
      if (prev.onClose) prev.onClose();
      return { ...prev, visible: false };
    });
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info', duration: number = 3000) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    
    setToastConfig({ visible: true, message, type });
    
    toastTimer.current = setTimeout(() => {
      setToastConfig(prev => ({ ...prev, visible: false }));
    }, duration);
  }, []);

  return (
    <AlertContext.Provider value={{ showAlert, showToast, hideAlert }}>
      {children}
      <AlertModal
        {...alertConfig}
        onClose={hideAlert}
      />
      <Toast
        visible={toastConfig.visible}
        message={toastConfig.message}
        type={toastConfig.type}
        onClose={() => setToastConfig(prev => ({ ...prev, visible: false }))}
      />
    </AlertContext.Provider>
  );
};

export const useAlert = () => useContext(AlertContext);
