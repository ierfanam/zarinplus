import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database.js';
import { authMiddleware } from '../middleware/auth.js';
import { PaymentService, generateOrderId } from '../services/payment.js';
import { AccountingService } from '../services/accounting.js';
import { getClientIP, getUserAgent } from '../middleware/rateLimit.js';

const router = Router();
const paymentService = new PaymentService();

router.post('/payment/request', authMiddleware, async (req, res) => {
  try {
    const { amount, description, gateway = 'zarinpal' } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Amount must be greater than 0' });
    }

    if (amount < 1000) {
      return res.status(400).json({ success: false, message: 'Minimum amount is 1000 IRR' });
    }

    const walletId = req.wallet!.id;
    const mobile = req.user!.mobile;
    const orderId = generateOrderId();

    const paymentRequest = db.prepare(
      'INSERT INTO payment_requests (wallet_id, gateway, amount, order_id, description, mobile, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(walletId, gateway, amount, orderId, description || 'Wallet deposit', mobile, 'pending');

    const paymentId = paymentRequest.lastInsertRowid;

    try {
      const response = await paymentService.requestPayment(gateway, {
        amount,
        description: description || 'Wallet deposit',
        mobile,
        orderId,
      });

      if (response.success && response.authority) {
        db.prepare('UPDATE payment_requests SET authority = ? WHERE id = ?').run(response.authority, paymentId);

        AccountingService.recordPaymentGatewayTransaction(
          amount,
          orderId,
          gateway,
          JSON.stringify({ paymentId, walletId, mobile })
        );

        console.log(`[PAYMENT] Payment request created: ID=${paymentId}, Order=${orderId}, Amount=${amount}, Gateway=${gateway}`);

        res.json({
          success: true,
          paymentId,
          orderId,
          authority: response.authority,
          url: response.url,
          amount,
          gateway,
          message: 'Payment request created successfully. Redirect user to payment URL.',
        });
      } else {
        db.prepare('UPDATE payment_requests SET status = ? WHERE id = ?').run('failed', paymentId);

        res.status(400).json({
          success: false,
          message: response.message || 'Failed to create payment request',
          paymentId,
          orderId,
        });
      }
    } catch (paymentError) {
      db.prepare('UPDATE payment_requests SET status = ? WHERE id = ?').run('error', paymentId);
      console.error('[PAYMENT] Error creating payment request:', paymentError);
      res.status(500).json({
        success: false,
        message: 'Payment gateway error',
        error: paymentError instanceof Error ? paymentError.message : 'Unknown error',
      });
    }
  } catch (error) {
    console.error('[PAYMENT] Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/payment/callback', async (req, res) => {
  try {
    const { Authority, Status } = req.query;

    if (Status !== 'OK') {
      return res.redirect('/payment/failed?status=cancelled');
    }

    if (!Authority) {
      return res.redirect('/payment/failed?status=invalid');
    }

    const payment = db.prepare(
      'SELECT * FROM payment_requests WHERE authority = ? AND status = ?'
    ).get(Authority, 'pending') as any;

    if (!payment) {
      console.error(`[PAYMENT] Invalid or already processed authority: ${Authority}`);
      return res.redirect('/payment/failed?status=invalid');
    }

    const verificationResponse = await paymentService.verifyPayment(
      payment.gateway,
      Authority as string,
      payment.amount
    );

    if (verificationResponse.success) {
      db.prepare(
        'UPDATE payment_requests SET status = ?, verified_at = ? WHERE id = ?'
      ).run('verified', new Date().toISOString(), payment.id);

      const wallet = db.prepare('SELECT * FROM wallets WHERE id = ?').get(payment.wallet_id) as any;
      const newBalance = wallet.balance + payment.amount;

      db.prepare('UPDATE wallets SET balance = ?, updated_at = ? WHERE id = ?').run(
        newBalance,
        new Date().toISOString(),
        payment.wallet_id
      );

      AccountingService.recordDeposit(
        payment.wallet_id,
        payment.amount,
        payment.order_id,
        JSON.stringify({
          paymentId: payment.id,
          authority: Authority,
          refId: verificationResponse.refId,
          gateway: payment.gateway,
        })
      );

      const trxResult = db.prepare(
        'INSERT INTO transactions (wallet_id, type, amount, description, reference_id, status, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(
        payment.wallet_id,
        'deposit',
        payment.amount,
        `Payment via ${payment.gateway} - Ref: ${verificationResponse.refId}`,
        verificationResponse.refId || payment.order_id,
        'successful',
        JSON.stringify({
          gateway: payment.gateway,
          authority: Authority,
          refId: verificationResponse.refId,
          orderId: payment.order_id,
        })
      );

      console.log(`[PAYMENT] SUCCESS: Wallet ${payment.wallet_id} credited with ${payment.amount} IRR. RefID: ${verificationResponse.refId}`);

      res.redirect(`/payment/success?ref=${verificationResponse.refId}&amount=${payment.amount}`);
    } else {
      db.prepare(
        'UPDATE payment_requests SET status = ? WHERE id = ?'
      ).run('verification_failed', payment.id);

      console.error(`[PAYMENT] Verification failed for authority: ${Authority}`);
      res.redirect('/payment/failed?status=verification_failed');
    }
  } catch (error) {
    console.error('[PAYMENT] Callback error:', error);
    res.redirect('/payment/failed?status=error');
  }
});

router.post('/payment/webhook', async (req, res) => {
  try {
    const { authority, status, ref_id, amount } = req.body;

    console.log(`[PAYMENT WEBHOOK] Received: ${JSON.stringify(req.body)}`);

    if (!authority || status !== 'OK') {
      return res.json({ success: false, message: 'Invalid webhook data' });
    }

    const payment = db.prepare(
      'SELECT * FROM payment_requests WHERE authority = ? AND status = ?'
    ).get(authority, 'pending') as any;

    if (!payment) {
      console.log(`[PAYMENT WEBHOOK] Payment already processed or not found: ${authority}`);
      return res.json({ success: true, message: 'Already processed' });
    }

    const verificationResponse = await paymentService.verifyPayment(
      payment.gateway,
      authority,
      amount || payment.amount
    );

    if (verificationResponse.success) {
      db.prepare(
        'UPDATE payment_requests SET status = ?, verified_at = ? WHERE id = ?'
      ).run('verified', new Date().toISOString(), payment.id);

      const wallet = db.prepare('SELECT * FROM wallets WHERE id = ?').get(payment.wallet_id) as any;
      const newBalance = wallet.balance + payment.amount;

      db.prepare('UPDATE wallets SET balance = ?, updated_at = ? WHERE id = ?').run(
        newBalance,
        new Date().toISOString(),
        payment.wallet_id
      );

      AccountingService.recordDeposit(
        payment.wallet_id,
        payment.amount,
        payment.order_id,
        JSON.stringify({
          paymentId: payment.id,
          authority,
          refId: verificationResponse.refId,
          gateway: payment.gateway,
          viaWebhook: true,
        })
      );

      db.prepare(
        'INSERT INTO transactions (wallet_id, type, amount, description, reference_id, status, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(
        payment.wallet_id,
        'deposit',
        payment.amount,
        `Payment via ${payment.gateway} (Webhook) - Ref: ${verificationResponse.refId}`,
        verificationResponse.refId || payment.order_id,
        'successful',
        JSON.stringify({ viaWebhook: true, authority, refId: verificationResponse.refId })
      );

      console.log(`[PAYMENT WEBHOOK] SUCCESS: Wallet ${payment.wallet_id} credited with ${payment.amount} IRR`);

      res.json({ success: true, message: 'Payment verified and wallet credited', refId: verificationResponse.refId });
    } else {
      db.prepare(
        'UPDATE payment_requests SET status = ? WHERE id = ?'
      ).run('verification_failed', payment.id);

      res.json({ success: false, message: 'Verification failed' });
    }
  } catch (error) {
    console.error('[PAYMENT WEBHOOK] Error:', error);
    res.status(500).json({ success: false, message: 'Webhook processing failed' });
  }
});

router.get('/payment/status/:orderId', authMiddleware, (req, res) => {
  try {
    const { orderId } = req.params;

    const payment = db.prepare(
      'SELECT * FROM payment_requests WHERE order_id = ? AND wallet_id = ?'
    ).get(orderId, req.wallet!.id) as any;

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    res.json({
      success: true,
      payment: {
        id: payment.id,
        orderId: payment.order_id,
        authority: payment.authority,
        amount: payment.amount,
        status: payment.status,
        gateway: payment.gateway,
        createdAt: payment.created_at,
      },
    });
  } catch (error) {
    console.error('[PAYMENT] Status check error:', error);
    res.status(500).json({ success: false, message: 'Failed to check payment status' });
  }
});

export default router;
