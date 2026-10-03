import { Router, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db } from '../database.js';
import validate, { schemas } from '../middleware/validation.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { authMiddleware } from '../middleware/auth.js';
import { JWTPayload, User } from '../models/index.js';
import { config } from '../config.js';

const router = Router();

function generateToken(userId: number, mobile: string, role: string): string {
  const payload: JWTPayload = { userId, mobile, role };
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn as any });
}

function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 12);
}

function createSession(userId: number, token: string): void {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const tokenHash = Buffer.from(token).toString('base64');
  db.prepare('INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)').run(
    userId,
    tokenHash,
    expiresAt.toISOString()
  );
}

router.post('/auth/register', validate(schemas.register), (req, res) => {
  try {
    const { mobile, name, password } = req.body;

    const existing = db.prepare('SELECT id FROM users WHERE mobile = ?').get(mobile);
    if (existing) {
      return res.status(409).json({ success: false, message: 'User already exists.' });
    }

    const passwordHash = hashPassword(password);
    const result = db.prepare('INSERT INTO users (mobile, name, password_hash, role, is_verified) VALUES (?, ?, ?, ?, ?)').run(
      mobile,
      name,
      passwordHash,
      'user',
      0
    );

    const userId = result.lastInsertRowid;
    const walletId = 'W-' + Date.now();
    db.prepare('INSERT INTO wallets (user_id, wallet_id, balance, emtiyaz, merchant_slug) VALUES (?, ?, ?, ?, ?)').run(
      userId,
      walletId,
      0,
      0,
      ''
    );

    const token = generateToken(userId as number, mobile, 'user');
    createSession(userId as number, token);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: { mobile, name, role: 'user' },
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ success: false, message: 'Registration failed.' });
  }
});

router.post('/auth/login', authLimiter, validate(schemas.login), (req, res) => {
  try {
    const { mobile, password } = req.body;

    const user = db.prepare('SELECT * FROM users WHERE mobile = ?').get(mobile) as {
      id: number;
      mobile: string;
      name: string;
      password_hash: string;
      role: string;
      is_verified: number;
    } | undefined;

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const passwordMatch = bcrypt.compareSync(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const token = generateToken(user.id, user.mobile, user.role);
    createSession(user.id, token);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: { id: user.id, mobile: user.mobile, name: user.name, role: user.role },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Login failed.' });
  }
});

router.post('/auth/logout', authMiddleware, (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];
    if (token) {
      const tokenHash = Buffer.from(token).toString('base64');
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    res.json({ success: true, message: 'Logged out' });
  }
});

router.get('/auth/me', authMiddleware, (req, res) => {
  res.json({
    success: true,
    user: req.user,
    wallet: req.wallet,
  });
});

router.post('/auth/refresh', authMiddleware, (req, res) => {
  try {
    const token = generateToken(req.user!.id, req.user!.mobile, req.user!.role);
    createSession(req.user!.id, token);

    res.json({
      success: true,
      token,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Token refresh failed.' });
  }
});

export default router;
