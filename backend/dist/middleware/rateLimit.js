import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
export const apiLimiter = rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMax,
    message: {
        success: false,
        message: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil(config.rateLimitWindowMs / 1000),
    },
    standardHeaders: true,
    legacyHeaders: false,
});
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: {
        success: false,
        message: 'Too many authentication attempts. Please try again in 15 minutes.',
    },
    standardHeaders: true,
    legacyHeaders: false,
});
export function getClientIP(req) {
    return (req.headers['x-forwarded-for'] ||
        req.headers['x-real-ip'] ||
        req.socket.remoteAddress ||
        'unknown');
}
export function getUserAgent(req) {
    return req.headers['user-agent'] || 'unknown';
}
//# sourceMappingURL=rateLimit.js.map