export interface User {
    id: number;
    mobile: string;
    name: string;
    role: string;
    is_verified: boolean;
    created_at: string;
    updated_at: string;
}
export interface Wallet {
    id: number;
    user_id: number;
    wallet_id: string;
    balance: number;
    emtiyaz: number;
    merchant_slug: string;
    commission_rate: number;
    created_at: string;
    updated_at: string;
}
export interface Merchant {
    id: number;
    wallet_id: number;
    name: string;
    share_amount: number;
    status: string;
    slug: string;
    created_at: string;
    updated_at: string;
}
export interface Transaction {
    id: number;
    wallet_id: number;
    type: string;
    amount: number;
    description: string;
    reference_id: string;
    status: string;
    metadata?: string;
    created_at: string;
}
export interface AuditLog {
    id: number;
    wallet_id?: number;
    user_id?: number;
    action: string;
    old_value?: string;
    new_value?: string;
    ip_address?: string;
    user_agent?: string;
    created_at: string;
}
export interface JWTPayload {
    userId: number;
    mobile: string;
    role: string;
    iat?: number;
    exp?: number;
}
