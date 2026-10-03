import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
declare const validate: (schema: z.ZodSchema) => (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
export declare const schemas: {
    login: z.ZodObject<{
        mobile: z.ZodString;
        password: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        mobile: string;
        password: string;
    }, {
        mobile: string;
        password: string;
    }>;
    updateBalance: z.ZodObject<{
        balance: z.ZodNumber;
        emtiyaz: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        balance: number;
        emtiyaz?: number | undefined;
    }, {
        balance: number;
        emtiyaz?: number | undefined;
    }>;
    transaction: z.ZodObject<{
        type: z.ZodEnum<["deposit", "withdraw", "emtiyaz_conversion"]>;
        amount: z.ZodNumber;
        description: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "deposit" | "withdraw" | "emtiyaz_conversion";
        amount: number;
        description?: string | undefined;
    }, {
        type: "deposit" | "withdraw" | "emtiyaz_conversion";
        amount: number;
        description?: string | undefined;
    }>;
    addMerchant: z.ZodObject<{
        name: z.ZodString;
        share_amount: z.ZodDefault<z.ZodNumber>;
        slug: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        share_amount: number;
        slug?: string | undefined;
    }, {
        name: string;
        share_amount?: number | undefined;
        slug?: string | undefined;
    }>;
    register: z.ZodObject<{
        mobile: z.ZodString;
        name: z.ZodString;
        password: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        mobile: string;
        password: string;
        name: string;
    }, {
        mobile: string;
        password: string;
        name: string;
    }>;
};
export default validate;
