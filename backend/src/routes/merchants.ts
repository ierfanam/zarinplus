import { Router, Response } from 'express';
import { db } from '../database.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';
import validate, { schemas } from '../middleware/validation.js';
import { getClientIP, getUserAgent } from '../middleware/rateLimit.js';

const router = Router();

router.get('/merchants', authMiddleware, (req, res) => {
  try {
    const merchants = db.prepare('SELECT * FROM merchants WHERE wallet_id = ? AND status = ?').all(req.wallet!.id, 'active') as any[];

    res.json({
      success: true,
      merchants: merchants.map((m) => ({
        id: m.id,
        name: m.name,
        shareAmount: m.share_amount,
        status: m.status,
        slug: m.slug,
      })),
    });
  } catch (err) {
    console.error('Merchants fetch error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch merchants.' });
  }
});

router.post('/merchants', authMiddleware, adminOnly, validate(schemas.addMerchant), (req, res) => {
  try {
    const { name, share_amount, slug } = req.body;
    const reqIp = getClientIP(req);
    const reqAgent = getUserAgent(req);

    const result = db.prepare('INSERT INTO merchants (wallet_id, name, share_amount, status, slug) VALUES (?, ?, ?, ?, ?)').run(
      req.wallet!.id,
      name,
      share_amount,
      'active',
      slug || `merchant-${Date.now()}`
    );

    res.status(201).json({
      success: true,
      message: 'Merchant added successfully.',
      merchant: {
        id: result.lastInsertRowid,
        name,
        shareAmount: share_amount,
        status: 'active',
        slug: slug || `merchant-${Date.now()}`,
      },
    });
  } catch (err) {
    console.error('Add merchant error:', err);
    res.status(500).json({ success: false, message: 'Failed to add merchant.' });
  }
});

router.put('/merchants/:id', authMiddleware, adminOnly, (req, res) => {
  try {
    const merchantId = parseInt(req.params.id as string);
    const { name, share_amount, status, slug } = req.body;

    const merchant = db.prepare('SELECT * FROM merchants WHERE id = ? AND wallet_id = ?').get(merchantId, req.wallet!.id) as any | undefined;
    if (!merchant) {
      return res.status(404).json({ success: false, message: 'Merchant not found.' });
    }

    db.prepare(
      'UPDATE merchants SET name = ?, share_amount = ?, status = ?, slug = ? WHERE id = ?'
    ).run(
      name ?? merchant.name,
      share_amount ?? merchant.share_amount,
      status ?? merchant.status,
      typeof slug === 'string' ? slug : String(merchant.slug ?? ''),
      merchantId
    );

    const updated = db.prepare('SELECT * FROM merchants WHERE id = ?').get(merchantId);

    res.json({
      success: true,
      message: 'Merchant updated successfully.',
      merchant: updated,
    });
  } catch (err) {
    console.error('Update merchant error:', err);
    res.status(500).json({ success: false, message: 'Failed to update merchant.' });
  }
});

router.delete('/merchants/:id', authMiddleware, adminOnly, (req, res) => {
  try {
    const merchantId = parseInt(req.params.id as string);

    const merchant = db.prepare('SELECT * FROM merchants WHERE id = ? AND wallet_id = ?').get(merchantId, req.wallet!.id) as any | undefined;
    if (!merchant) {
      return res.status(404).json({ success: false, message: 'Merchant not found.' });
    }

    db.prepare('DELETE FROM merchants WHERE id = ?').run(merchantId);

    res.json({ success: true, message: 'Merchant deleted successfully.' });
  } catch (err) {
    console.error('Delete merchant error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete merchant.' });
  }
});

export default router;
