import jwt from 'jsonwebtoken';
import { db } from '../database.js';
import { config } from '../config.js';
export function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Authentication required. Provide a valid Bearer token.' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const payload = jwt.verify(token, config.jwtSecret);
        const user = db.prepare('SELECT id, mobile, role FROM users WHERE id = ?').get(payload.userId);
        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found.' });
        }
        const wallet = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(user.id);
        if (!wallet) {
            return res.status(404).json({ success: false, message: 'Wallet not found.' });
        }
        req.user = { id: user.id, mobile: user.mobile, role: user.role };
        req.wallet = {
            id: wallet.id,
            wallet_id: wallet.wallet_id,
            balance: wallet.balance,
            emtiyaz: wallet.emtiyaz,
            merchant_slug: wallet.merchant_slug,
            commission_rate: wallet.commission_rate,
        };
        next();
    }
    catch (err) {
        return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
    }
}
export function adminOnly(req, res, next) {
    if (req.user?.role !== 'vip' && req.user?.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Admin access required.' });
    }
    next();
}
//# sourceMappingURL=auth.js.map