declare module 'react-native-upi-payment' {
  interface UpiConfig {
    vpa: string;
    payeeName: string;
    amount: string;
    transactionNote: string;
    transactionRef: string;
  }

  interface UpiPayment {
    initializePayment(
      config: UpiConfig,
      successCallback: (response: any) => void,
      failureCallback?: (error: any) => void
    ): void;
  }

  const RNUpiPayment: UpiPayment;
  export default RNUpiPayment;
}
