import { Request, Response, NextFunction } from 'express';
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
export declare function authMiddleware(req: Request, res: Response, next: NextFunction): Response<any, Record<string, any>> | undefined;
export declare function adminOnly(req: Request, res: Response, next: NextFunction): Response<any, Record<string, any>> | undefined;
