import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';
import validate, { schemas } from '../middleware/validation.js';
import { getClientIP, getUserAgent } from '../middleware/rateLimit.js';
import { PaymentService, generateOrderId } from '../services/payment.js';
import { AccountingService } from '../services/accounting.js';
import { Transaction } from '../models/index.js';

const router = Router();
const paymentService = new PaymentService();

function createAuditLog(data: {
  walletId?: number;
  userId?: number;
  action: string;
  oldValue?: string;
  newValue?: string;
  req: { ip: string; userAgent: string };
}) {
  db.prepare(
    'INSERT INTO audit_logs (wallet_id, user_id, action, old_value, new_value, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(data.walletId, data.userId, data.action, data.oldValue, data.newValue, data.req.ip, data.req.userAgent);
}

router.get('/wallet/balance', authMiddleware, (req, res) => {
  try {
    const wallet = db.prepare('SELECT * FROM wallets WHERE id = ?').get(req.wallet!.id) as {
      id: number;
      wallet_id: string;
      balance: number;
      emtiyaz: number;
      merchant_slug: string;
      commission_rate: number;
      updated_at: string;
    };

    const user = db.prepare('SELECT mobile, name, is_verified FROM users WHERE id = ?').get(req.user!.id) as {
      mobile: string;
      name: string;
      is_verified: number;
    };

    res.json({
      success: true,
      wallet: {
        id: wallet.wallet_id,
        balance: wallet.balance,
        emtiyaz: wallet.emtiyaz,
        merchantSlug: wallet.merchant_slug,
        commissionRate: wallet.commission_rate,
        lastUpdated: wallet.updated_at,
      },
      user: {
        mobile: user.mobile,
        name: user.name,
        verified: Boolean(user.is_verified),
      },
      sharingStats: {
        totalShared: calculateTotalShared(wallet.id),
        activeMerchantsCount: getActiveMerchantsCount(wallet.id),
        commissionRate: wallet.commission_rate,
      },
    });
  } catch (err) {
    console.error('Balance fetch error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch balance.' });
  }
});

function calculateTotalShared(walletId: number): number {
  const result = db.prepare('SELECT SUM(share_amount) as total FROM merchants WHERE wallet_id = ? AND status = ?').get(walletId, 'active') as { total: number };
  return result.total || 0;
}

function getActiveMerchantsCount(walletId: number): number {
  const result = db.prepare('SELECT COUNT(*) as count FROM merchants WHERE wallet_id = ? AND status = ?').get(walletId, 'active') as { count: number };
  return result.count || 0;
}

router.post('/wallet/deposit/request', authMiddleware, validate(schemas.depositRequest), async (req, res) => {
  try {
    const { amount, description, gateway = 'zarinpal' } = req.body;

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

        res.json({
          success: true,
          paymentId,
          orderId,
          authority: response.authority,
          url: response.url,
          amount,
          gateway,
        });
      } else {
        db.prepare('UPDATE payment_requests SET status = ? WHERE id = ?').run('failed', paymentId);
        res.status(400).json({
          success: false,
          message: response.message || 'Failed to create payment request',
        });
      }
    } catch (paymentError) {
      db.prepare('UPDATE payment_requests SET status = ? WHERE id = ?').run('error', paymentId);
      res.status(500).json({
        success: false,
        message: 'Payment gateway error',
      });
    }
  } catch (err) {
    console.error('Deposit request error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/wallet/transfer', authMiddleware, validate(schemas.transfer), async (req, res) => {
  try {
    const { toWalletId, amount, description } = req.body;
    const fromWalletId = req.wallet!.id;
    const reqIp = getClientIP(req);
    const reqAgent = getUserAgent(req);

    if (toWalletId === String(fromWalletId)) {
      return res.status(400).json({ success: false, message: 'Cannot transfer to same wallet' });
    }

    const fromWallet = db.prepare('SELECT balance, wallet_id FROM wallets WHERE id = ?').get(fromWalletId) as {
      balance: number;
      wallet_id: string;
    };

    if (fromWallet.balance < amount) {
      return res.status(400).json({ success: false, message: 'Insufficient balance' });
    }

    const toWallet = db.prepare('SELECT id, balance FROM wallets WHERE wallet_id = ?').get(toWalletId) as {
      id: number;
      balance: number;
    } | undefined;

    if (!toWallet) {
      return res.status(404).json({ success: false, message: 'Destination wallet not found' });
    }

    const referenceId = `ZP-TRF-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    db.prepare('UPDATE wallets SET balance = balance - ?, updated_at = ? WHERE id = ?').run(
      amount,
      new Date().toISOString(),
      fromWalletId
    );

    db.prepare('UPDATE wallets SET balance = balance + ?, updated_at = ? WHERE id = ?').run(
      amount,
      new Date().toISOString(),
      toWallet.id
    );

    AccountingService.recordTransfer(fromWalletId, toWallet.id, amount, referenceId);

    const trxResult = db.prepare(
      'INSERT INTO transactions (wallet_id, type, amount, description, reference_id, status, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      fromWalletId,
      'transfer_out',
      amount,
      description || `Transfer to wallet ${toWalletId}`,
      referenceId,
      'successful',
      JSON.stringify({ toWalletId, ip: reqIp })
    );

    db.prepare(
      'INSERT INTO transactions (wallet_id, type, amount, description, reference_id, status, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      toWallet.id,
      'transfer_in',
      amount,
      description || `Transfer from wallet ${fromWallet.wallet_id}`,
      referenceId,
      'successful',
      JSON.stringify({ fromWalletId: fromWallet.wallet_id, ip: reqIp })
    );

    createAuditLog({
      walletId: fromWalletId,
      userId: req.user!.id,
      action: 'transfer_out',
      oldValue: JSON.stringify({ balance: fromWallet.balance }),
      newValue: JSON.stringify({ balance: fromWallet.balance - amount }),
      req: { ip: reqIp, userAgent: reqAgent },
    });

    const updated = db.prepare('SELECT * FROM wallets WHERE id = ?').get(fromWalletId);

    res.json({
      success: true,
      message: 'Transfer completed successfully',
      account: updated,
      transaction: {
        id: trxResult.lastInsertRowid,
        referenceId,
        amount,
        toWalletId,
        status: 'successful',
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('Transfer error:', err);
    res.status(500).json({ success: false, message: 'Transfer failed' });
  }
});

router.post('/wallet/update', authMiddleware, adminOnly, validate(schemas.updateBalance), (req, res) => {
  try {
    const { balance, emtiyaz } = req.body;
    const walletId = req.wallet!.id;
    const reqIp = getClientIP(req);
    const reqAgent = getUserAgent(req);

    const current = db.prepare('SELECT balance, emtiyaz FROM wallets WHERE id = ?').get(walletId) as {
      balance: number;
      emtiyaz: number;
    };

    const updates: string[] = [];
    const params: (number | string)[] = [];
    const now = new Date().toISOString();

    if (balance !== undefined && balance !== current.balance) {
      updates.push('balance = ?');
      params.push(balance);
      createAuditLog({
        walletId,
        userId: req.user!.id,
        action: 'balance_update',
        oldValue: JSON.stringify({ balance: current.balance }),
        newValue: JSON.stringify({ balance }),
        req: { ip: reqIp, userAgent: reqAgent },
      });
    }

    if (emtiyaz !== undefined && emtiyaz !== current.emtiyaz) {
      updates.push('emtiyaz = ?');
      params.push(emtiyaz);
      createAuditLog({
        walletId,
        userId: req.user!.id,
        action: 'emtiyaz_update',
        oldValue: JSON.stringify({ emtiyaz: current.emtiyaz }),
        newValue: JSON.stringify({ emtiyaz }),
        req: { ip: reqIp, userAgent: reqAgent },
      });
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No changes to apply.' });
    }

    updates.push("updated_at = ?");
    params.push(now);
    params.push(walletId);

    db.prepare(`UPDATE wallets SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const updated = db.prepare('SELECT * FROM wallets WHERE id = ?').get(walletId);

    res.json({
      success: true,
      message: `Wallet balance permanently updated for ${req.user!.mobile}`,
      account: updated,
    });
  } catch (err) {
    console.error('Balance update error:', err);
    res.status(500).json({ success: false, message: 'Balance update failed.' });
  }
});

router.post('/wallet/transaction', authMiddleware, validate(schemas.transaction), (req, res) => {
  try {
    const { type, amount, description } = req.body;
    const walletId = req.wallet!.id;
    const reqIp = getClientIP(req);
    const reqAgent = getUserAgent(req);

    const wallet = db.prepare('SELECT balance, emtiyaz FROM wallets WHERE id = ?').get(walletId) as {
      balance: number;
      emtiyaz: number;
    };

    let balanceChange = 0;
    let emtiyazChange = 0;

    if (type === 'deposit') {
      balanceChange = amount;
    } else if (type === 'withdraw') {
      if (wallet.balance < amount) {
        return res.status(400).json({ success: false, message: 'Insufficient balance.' });
      }
      balanceChange = -amount;
    } else if (type === 'emtiyaz_conversion') {
      if (wallet.emtiyaz < amount) {
        return res.status(400).json({ success: false, message: 'Insufficient emtiyaz.' });
      }
      emtiyazChange = -amount;
      balanceChange = amount * 100;
    } else {
      return res.status(400).json({ success: false, message: 'Invalid transaction type.' });
    }

    const newBalance = wallet.balance + balanceChange;
    const newEmtiyaz = wallet.emtiyaz + emtiyazChange;
    const now = new Date().toISOString();
    const referenceId = `ZP-TRX-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    db.prepare('UPDATE wallets SET balance = ?, emtiyaz = ?, updated_at = ? WHERE id = ?').run(
      newBalance,
      newEmtiyaz,
      now,
      walletId
    );

    const trxResult = db.prepare(
      'INSERT INTO transactions (wallet_id, type, amount, description, reference_id, status, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      walletId,
      type,
      amount,
      description || `Transaction for ${req.user!.mobile}`,
      referenceId,
      'successful',
      JSON.stringify({ previousBalance: wallet.balance, newBalance, previousEmtiyaz: wallet.emtiyaz, newEmtiyaz, ip: reqIp })
    );

    createAuditLog({
      walletId,
      userId: req.user!.id,
      action: `transaction_${type}`,
      oldValue: JSON.stringify({ balance: wallet.balance, emtiyaz: wallet.emtiyaz }),
      newValue: JSON.stringify({ balance: newBalance, emtiyaz: newEmtiyaz, trxId: trxResult.lastInsertRowid }),
      req: { ip: reqIp, userAgent: reqAgent },
    });

    const updated = db.prepare('SELECT * FROM wallets WHERE id = ?').get(walletId);
    const trx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(trxResult.lastInsertRowid) as Transaction;

    res.json({
      success: true,
      message: 'Real financial transaction completed and persisted.',
      account: updated,
      transaction: {
        id: trx.id,
        type: trx.type,
        amount: trx.amount,
        description: trx.description,
        referenceId: trx.reference_id,
        timestamp: trx.created_at,
        status: trx.status,
      },
    });
  } catch (err) {
    console.error('Transaction error:', err);
    res.status(500).json({ success: false, message: 'Transaction failed.' });
  }
});

router.get('/wallet/transactions', authMiddleware, (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = (page - 1) * limit;

    const totalResult = db.prepare('SELECT COUNT(*) as count FROM transactions WHERE wallet_id = ?').get(req.wallet!.id) as { count: number };
    const transactions = db.prepare('SELECT * FROM transactions WHERE wallet_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?').all(
      req.wallet!.id,
      limit,
      offset
    ) as any[];

    res.json({
      success: true,
      transactions: transactions.map((trx) => ({
        id: trx.id,
        type: trx.type,
        amount: trx.amount,
        description: trx.description,
        referenceId: trx.reference_id,
        status: trx.status,
        timestamp: trx.created_at,
      })),
      pagination: {
        page,
        limit,
        total: totalResult.count,
        totalPages: Math.ceil(totalResult.count / limit),
      },
    });
  } catch (err) {
    console.error('Transactions fetch error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch transactions.' });
  }
});

export default router;
