declare module 'react-native-upi-payment' {
  interface PaymentConfig {
    vpa: string;
    payeeName: string;
    amount: string;
    transactionNote: string;
    transactionRef: string;
  }

  export default class RNUpiPayment {
    static initializePayment(
      config: PaymentConfig,
      onSuccess: (response: any) => void,
      onFailure: (error: any) => void
    ): void;
  }
}
