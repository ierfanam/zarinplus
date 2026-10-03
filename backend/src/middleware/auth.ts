import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../database.js';
import { JWTPayload } from '../models/index.js';
import { config } from '../config.js';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        mobile: string;
        role: string;
      };
      wallet?: {
        id: number;
        wallet_id: string;
        balance: number;
        emtiyaz: number;
        merchant_slug: string;
        commission_rate: number;
      };
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authentication required. Provide a valid Bearer token.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, config.jwtSecret) as JWTPayload;

    const user = db.prepare('SELECT id, mobile, role FROM users WHERE id = ?').get(payload.userId) as { id: number; mobile: string; role: string } | undefined;
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found.' });
    }

    const wallet = db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(user.id) as {
      id: number;
      wallet_id: string;
      balance: number;
      emtiyaz: number;
      merchant_slug: string;
      commission_rate: number;
    } | undefined;
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
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
}

export function adminOnly(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'vip' && req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required.' });
  }
  next();
}
