import { Router } from 'express';
import { authMiddleware, adminOnly } from '../middleware/auth.js';
import { db } from '../database.js';

const router = Router();

router.get('/audit/logs', authMiddleware, adminOnly, (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = (page - 1) * limit;
    const actionFilter = req.query.action as string | undefined;

    let query = 'SELECT * FROM audit_logs WHERE 1=1';
    const params: any[] = [];

    if (req.user?.role !== 'vip' && req.user?.role !== 'admin') {
      query += ' AND wallet_id = ?';
      params.push(req.wallet?.id);
    }

    if (actionFilter) {
      query += ' AND action = ?';
      params.push(actionFilter);
    }

    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as count');
    const totalResult = db.prepare(countQuery).get(...params) as { count: number };

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const logs = db.prepare(query).all(...params) as any[];

    res.json({
      success: true,
      logs: logs.map((log) => ({
        id: log.id,
        action: log.action,
        oldValue: log.old_value,
        newValue: log.new_value,
        ipAddress: log.ip_address,
        userAgent: log.user_agent,
        createdAt: log.created_at,
      })),
      pagination: {
        page,
        limit,
        total: totalResult.count,
        totalPages: Math.ceil(totalResult.count / limit),
      },
    });
  } catch (err) {
    console.error('Audit logs fetch error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch audit logs.' });
  }
});

router.get('/audit/stats', authMiddleware, adminOnly, (req, res) => {
  try {
    const totalTrx = db.prepare('SELECT COUNT(*) as count FROM transactions WHERE wallet_id = ?').get(req.wallet!.id) as { count: number };
    const totalDeposits = db.prepare('SELECT SUM(amount) as total FROM transactions WHERE wallet_id = ? AND type = ?').get(req.wallet!.id, 'deposit') as { total: number };
    const totalWithdrawals = db.prepare('SELECT SUM(amount) as total FROM transactions WHERE wallet_id = ? AND type = ?').get(req.wallet!.id, 'withdraw') as { total: number };
    const totalEmtiyazConverted = db.prepare('SELECT SUM(amount) as total FROM transactions WHERE wallet_id = ? AND type = ?').get(req.wallet!.id, 'emtiyaz_conversion') as { total: number };

    res.json({
      success: true,
      stats: {
        totalTransactions: totalTrx.count || 0,
        totalDeposits: totalDeposits.total || 0,
        totalWithdrawals: totalWithdrawals.total || 0,
        totalEmtiyazConverted: totalEmtiyazConverted.total || 0,
        activeMerchants: db.prepare('SELECT COUNT(*) as count FROM merchants WHERE wallet_id = ? AND status = ?').get(req.wallet!.id, 'active') as { count: number },
      },
    });
  } catch (err) {
    console.error('Audit stats error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch stats.' });
  }
});

export default router;
