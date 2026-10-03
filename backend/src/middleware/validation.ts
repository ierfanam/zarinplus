import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

const validate = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: err.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }
      return res.status(400).json({ success: false, message: 'Invalid request data' });
    }
  };
};

export const schemas = {
  login: z.object({
    mobile: z.string().regex(/^09\d{9}$/, 'Invalid mobile number format'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
  }),
  updateBalance: z.object({
    balance: z.number().int().nonnegative('Balance cannot be negative'),
    emtiyaz: z.number().int().nonnegative('Emtiyaz cannot be negative').optional(),
  }),
  transaction: z.object({
    type: z.enum(['deposit', 'withdraw', 'emtiyaz_conversion']),
    amount: z.number().int().positive('Amount must be positive'),
    description: z.string().max(500).optional(),
  }),
  addMerchant: z.object({
    name: z.string().min(2, 'Merchant name is required'),
    share_amount: z.number().int().nonnegative().default(0),
    slug: z.string().optional(),
  }),
  transfer: z.object({
    toWalletId: z.string().min(1, 'Destination wallet ID is required'),
    amount: z.number().int().positive('Amount must be positive'),
    description: z.string().max(500).optional(),
  }),
  depositRequest: z.object({
    amount: z.number().int().positive().min(1000, 'Minimum deposit is 1000 IRR'),
    description: z.string().max(500).optional(),
    gateway: z.enum(['zarinpal', 'payir']).default('zarinpal'),
  }),
  register: z.object({
    mobile: z.string().regex(/^09\d{9}$/, 'Invalid mobile number format'),
    name: z.string().min(2, 'Name is required'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
  }),
};

export default validate;
