import crypto from 'crypto';

export interface PaymentGatewayConfig {
  merchantId: string;
  apiKey?: string;
  sandbox: boolean;
  callbackUrl: string;
  webhookUrl: string;
}

export interface PaymentRequest {
  amount: number;
  description: string;
  mobile?: string;
  orderId: string;
}

export interface PaymentResponse {
  success: boolean;
  authority?: string;
  url?: string;
  message?: string;
}

export interface VerificationResponse {
  success: boolean;
  refId?: string;
  message?: string;
  amount?: number;
}

export class ZarinPalGateway {
  private config: PaymentGatewayConfig;
  private sandboxUrl = 'https://sandbox.zarinpal.com/pg/rest/WebGate/';
  private productionUrl = 'https://bank.zarinpal.com/pg/rest/WebGate/';

  constructor(config: PaymentGatewayConfig) {
    this.config = config;
  }

  private getBaseUrl(): string {
    return this.config.sandbox ? this.sandboxUrl : this.productionUrl;
  }

  async requestPayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      const url = `${this.getBaseUrl()}PaymentRequest.json`;
      const payload = {
        MerchantID: this.config.merchantId,
        Amount: request.amount,
        Description: request.description,
        CallbackURL: this.config.callbackUrl,
        Mobile: request.mobile || '',
        OrderID: request.orderId,
      };

      console.log(`[ZARINPAL] Payment Request: ${JSON.stringify(payload)}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data.Status === 100 && data.Authority) {
        const paymentUrl = this.config.sandbox
          ? `https://sandbox.zarinpal.com/pg/StartPay/${data.Authority}`
          : `https://bank.zarinpal.com/pg/StartPay/${data.Authority}`;

        console.log(`[ZARINPAL] Payment URL generated: ${paymentUrl}`);
        return {
          success: true,
          authority: data.Authority,
          url: paymentUrl,
        };
      } else {
        console.error(`[ZARINPAL] Error: ${data.Status} - ${data.Errors || 'Unknown error'}`);
        return {
          success: false,
          message: data.Errors || `ZarinPal error code: ${data.Status}`,
        };
      }
    } catch (error) {
      console.error('[ZARINPAL] Request error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async verifyPayment(authority: string, amount: number): Promise<VerificationResponse> {
    try {
      const url = `${this.getBaseUrl()}PaymentVerification.json`;
      const payload = {
        MerchantID: this.config.merchantId,
        Authority: authority,
        Amount: amount,
      };

      console.log(`[ZARINPAL] Verification Request: ${JSON.stringify(payload)}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data.Status === 100 && data.RefID) {
        console.log(`[ZARINPAL] Payment verified. RefID: ${data.RefID}`);
        return {
          success: true,
          refId: String(data.RefID),
          amount: data.Amount || amount,
        };
      } else {
        console.error(`[ZARINPAL] Verification failed: ${data.Status} - ${data.Errors || 'Unknown error'}`);
        return {
          success: false,
          message: data.Errors || `Verification error code: ${data.Status}`,
        };
      }
    } catch (error) {
      console.error('[ZARINPAL] Verification error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async inquireTransaction(authority: string): Promise<any> {
    try {
      const url = `${this.getBaseUrl()}PaymentInquiry.json`;
      const payload = {
        MerchantID: this.config.merchantId,
        Authority: authority,
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      return await response.json();
    } catch (error) {
      console.error('[ZARINPAL] Inquiry error:', error);
      return null;
    }
  }
}

export class PayIRGateway {
  private config: PaymentGatewayConfig;
  private sandboxUrl = 'https://sandbox.pay.ir/pg/';
  private productionUrl = 'https://pay.ir/pg/';

  constructor(config: PaymentGatewayConfig) {
    this.config = config;
  }

  private getBaseUrl(): string {
    return this.config.sandbox ? this.sandboxUrl : this.productionUrl;
  }

  async requestPayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      const url = `${this.getBaseUrl()}v1/request.json`;
      const payload = {
        merchant_id: this.config.merchantId,
        amount: request.amount,
        callback: this.config.callbackUrl,
        order_id: request.orderId,
        mobile: request.mobile || '',
        description: request.description,
      };

      console.log(`[PAYIR] Payment Request: ${JSON.stringify(payload)}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data.status === 1 && data.token) {
        const paymentUrl = `${this.getBaseUrl()}v1/${data.token}`;
        console.log(`[PAYIR] Payment URL generated: ${paymentUrl}`);
        return {
          success: true,
          authority: data.token,
          url: paymentUrl,
        };
      } else {
        console.error(`[PAYIR] Error: ${data.errorCode} - ${data.errorMessage}`);
        return {
          success: false,
          message: data.errorMessage || `PayIR error code: ${data.errorCode}`,
        };
      }
    } catch (error) {
      console.error('[PAYIR] Request error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async verifyPayment(token: string, amount: number): Promise<VerificationResponse> {
    try {
      const url = `${this.getBaseUrl()}v1/verify.json`;
      const payload = {
        merchant_id: this.config.merchantId,
        amount: amount,
        token: token,
      };

      console.log(`[PAYIR] Verification Request: ${JSON.stringify(payload)}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data.status === 1 && data.transaction_id) {
        console.log(`[PAYIR] Payment verified. Transaction ID: ${data.transaction_id}`);
        return {
          success: true,
          refId: String(data.transaction_id),
          amount: data.amount || amount,
        };
      } else {
        console.error(`[PAYIR] Verification failed: ${data.errorCode} - ${data.errorMessage}`);
        return {
          success: false,
          message: data.errorMessage || `Verification error code: ${data.errorCode}`,
        };
      }
    } catch (error) {
      console.error('[PAYIR] Verification error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

export class PaymentService {
  private zarinPal: ZarinPalGateway;
  private payIR: PayIRGateway;
  private defaultGateway: 'zarinpal' | 'payir';

  constructor() {
    this.zarinPal = new ZarinPalGateway({
      merchantId: process.env.ZARINPAL_MERCHANT_ID || 'test-merchant-id',
      sandbox: process.env.NODE_ENV !== 'production',
      callbackUrl: process.env.PAYMENT_CALLBACK_URL || 'http://localhost:5000/api/payment/callback',
      webhookUrl: process.env.PAYMENT_WEBHOOK_URL || 'http://localhost:5000/api/payment/webhook',
    });

    this.payIR = new PayIRGateway({
      merchantId: process.env.PAYIR_MERCHANT_ID || 'test-merchant-id',
      sandbox: process.env.NODE_ENV !== 'production',
      callbackUrl: process.env.PAYMENT_CALLBACK_URL || 'http://localhost:5000/api/payment/callback',
      webhookUrl: process.env.PAYMENT_WEBHOOK_URL || 'http://localhost:5000/api/payment/webhook',
    });

    this.defaultGateway = (process.env.DEFAULT_GATEWAY as 'zarinpal' | 'payir') || 'zarinpal';
  }

  async requestPayment(gateway: string, request: PaymentRequest): Promise<PaymentResponse> {
    if (gateway === 'payir') {
      return this.payIR.requestPayment(request);
    }
    return this.zarinPal.requestPayment(request);
  }

  async verifyPayment(gateway: string, authority: string, amount: number): Promise<VerificationResponse> {
    if (gateway === 'payir') {
      return this.payIR.verifyPayment(authority, amount);
    }
    return this.zarinPal.verifyPayment(authority, amount);
  }

  getZarinPal(): ZarinPalGateway {
    return this.zarinPal;
  }

  getPayIR(): PayIRGateway {
    return this.payIR;
  }
}

export function generateOrderId(): string {
  return `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
}

export function generateTransactionId(): string {
  return `TRX-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
}
