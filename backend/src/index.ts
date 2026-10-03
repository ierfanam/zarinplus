import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { config } from './config.js';
import { db } from './database.js';
import { apiLimiter } from './middleware/rateLimit.js';
import authRoutes from './routes/auth.js';
import walletRoutes from './routes/wallet.js';
import merchantRoutes from './routes/merchants.js';
import auditRoutes from './routes/audit.js';
import webhookRoutes from './routes/webhooks.js';
import paymentRoutes from './routes/payment.js';

const app = express();

app.use('/api/webhooks', webhookRoutes);
app.use('/api/payment', paymentRoutes);

app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (config.nodeEnv === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

app.use('/api', apiLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/merchants', merchantRoutes);
app.use('/api/audit', auditRoutes);

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'ZarinPlus Real API is running', timestamp: new Date().toISOString() });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint not found' });
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error', error: config.nodeEnv === 'development' ? err.message : undefined });
});

const server = app.listen(config.port, () => {
  console.log(`[ZARINPLUS REAL] Backend API running on http://localhost:${config.port}`);
  console.log(`[ZARINPLUS REAL] Environment: ${config.nodeEnv}`);
  console.log(`[ZARINPLUS REAL] Database: ${config.dbPath}`);
});

process.on('SIGTERM', () => {
  console.log('[ZARINPLUS REAL] Shutting down gracefully...');
  db.close();
  server.close(() => {
    process.exit(0);
  });
});

process.on('unhandledRejection', (err) => {
  console.error('[ZARINPLUS REAL] Unhandled rejection:', err);
});

export default app;
