import { Request } from 'express';
export declare const apiLimiter: import("express-rate-limit").RateLimitRequestHandler;
export declare const authLimiter: import("express-rate-limit").RateLimitRequestHandler;
export declare function getClientIP(req: Request): string;
export declare function getUserAgent(req: Request): string;
