import { Router } from 'express';
import { db } from '../database.js';
import { authMiddleware } from '../middleware/auth.js';
const router = Router();
router.post('/webhooks/transaction', (req, res) => {
    try {
        const { walletId, type, amount, description, referenceId } = req.body;
        const wallet = db.prepare('SELECT * FROM wallets WHERE id = ?').get(walletId);
        if (!wallet || !wallet.id) {
            return res.status(404).json({ success: false, message: 'Wallet not found.' });
        }
        const notification = {
            event: 'transaction.completed',
            walletId,
            type,
            amount,
            description,
            referenceId,
            newBalance: wallet.balance,
            newEmtiyaz: wallet.emtiyaz,
            timestamp: new Date().toISOString(),
        };
        console.log(`[ZARINPLUS WEBHOOK] Transaction event:`, JSON.stringify(notification));
        res.json({
            success: true,
            message: 'Webhook received and logged.',
            notification,
        });
    }
    catch (err) {
        console.error('Webhook error:', err);
        res.status(500).json({ success: false, message: 'Webhook processing failed.' });
    }
});
router.get('/notifications', authMiddleware, (req, res) => {
    try {
        const notifications = db.prepare('SELECT * FROM audit_logs WHERE wallet_id = ? AND action LIKE ? ORDER BY created_at DESC LIMIT 20').all(req.wallet.id, 'transaction%');
        res.json({
            success: true,
            notifications: notifications.map((n) => ({
                id: n.id,
                action: n.action,
                newValue: n.new_value,
                createdAt: n.created_at,
            })),
        });
    }
    catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch notifications.' });
    }
});
export default router;
//# sourceMappingURL=webhooks.js.map