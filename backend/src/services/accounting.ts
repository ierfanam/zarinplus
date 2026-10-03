import { db } from '../database.js';

export interface JournalEntry {
  id?: number;
  entryDate: string;
  referenceType: 'transaction' | 'payment' | 'transfer' | 'adjustment';
  referenceId: string;
  description: string;
  debitAccount: string;
  creditAccount: string;
  amount: number;
  currency: string;
  metadata?: string;
  created_at?: string;
}

export interface AccountBalance {
  accountCode: string;
  accountName: string;
  accountType: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  balance: number;
  currency: string;
}

const ACCOUNT_CODES = {
  WALLET_BALANCE: '1010',
  PAYMENT_GATEWAY: '1020',
  COMMISSION_REVENUE: '4010',
  USER_DEPOSITS: '2010',
  USER_WITHDRAWALS: '2020',
  TRANSFER_PENDING: '1030',
};

export class AccountingService {
  static createJournalEntry(entry: Omit<JournalEntry, 'id' | 'created_at'>): number {
    try {
      const result = db.prepare(
        'INSERT INTO journal_entries (entry_date, reference_type, reference_id, description, debit_account, credit_account, amount, currency, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        entry.entryDate,
        entry.referenceType,
        entry.referenceId,
        entry.description,
        entry.debitAccount,
        entry.creditAccount,
        entry.amount,
        entry.currency,
        entry.metadata || null
      );

      console.log(`[ACCOUNTING] Journal entry created: ${entry.referenceType} - ${entry.referenceId} - ${entry.amount} ${entry.currency}`);
      return result.lastInsertRowid as number;
    } catch (error) {
      console.error('[ACCOUNTING] Error creating journal entry:', error);
      throw new Error('Failed to create journal entry');
    }
  }

  static recordDeposit(walletId: number, amount: number, referenceId: string, metadata?: string): void {
    const entryDate = new Date().toISOString();

    this.createJournalEntry({
      entryDate,
      referenceType: 'transaction',
      referenceId,
      description: `Deposit to wallet ${walletId}`,
      debitAccount: ACCOUNT_CODES.WALLET_BALANCE,
      creditAccount: ACCOUNT_CODES.USER_DEPOSITS,
      amount,
      currency: 'IRR',
      metadata,
    });
  }

  static recordWithdrawal(walletId: number, amount: number, referenceId: string, metadata?: string): void {
    const entryDate = new Date().toISOString();

    this.createJournalEntry({
      entryDate,
      referenceType: 'transaction',
      referenceId,
      description: `Withdrawal from wallet ${walletId}`,
      debitAccount: ACCOUNT_CODES.USER_WITHDRAWALS,
      creditAccount: ACCOUNT_CODES.WALLET_BALANCE,
      amount,
      currency: 'IRR',
      metadata,
    });
  }

  static recordTransfer(fromWalletId: number, toWalletId: number, amount: number, referenceId: string, metadata?: string): void {
    const entryDate = new Date().toISOString();

    this.createJournalEntry({
      entryDate,
      referenceType: 'transfer',
      referenceId,
      description: `Transfer from wallet ${fromWalletId} to wallet ${toWalletId}`,
      debitAccount: ACCOUNT_CODES.TRANSFER_PENDING,
      creditAccount: ACCOUNT_CODES.WALLET_BALANCE,
      amount,
      currency: 'IRR',
      metadata,
    });

    this.createJournalEntry({
      entryDate,
      referenceType: 'transfer',
      referenceId,
      description: `Transfer to wallet ${toWalletId}`,
      debitAccount: ACCOUNT_CODES.WALLET_BALANCE,
      creditAccount: ACCOUNT_CODES.TRANSFER_PENDING,
      amount,
      currency: 'IRR',
      metadata,
    });
  }

  static recordCommission(amount: number, referenceId: string, metadata?: string): void {
    const entryDate = new Date().toISOString();

    this.createJournalEntry({
      entryDate,
      referenceType: 'transaction',
      referenceId,
      description: `Commission revenue`,
      debitAccount: ACCOUNT_CODES.PAYMENT_GATEWAY,
      creditAccount: ACCOUNT_CODES.COMMISSION_REVENUE,
      amount,
      currency: 'IRR',
      metadata,
    });
  }

  static recordPaymentGatewayTransaction(amount: number, referenceId: string, gateway: string, metadata?: string): void {
    const entryDate = new Date().toISOString();

    this.createJournalEntry({
      entryDate,
      referenceType: 'payment',
      referenceId,
      description: `Payment via ${gateway}`,
      debitAccount: ACCOUNT_CODES.PAYMENT_GATEWAY,
      creditAccount: ACCOUNT_CODES.WALLET_BALANCE,
      amount,
      currency: 'IRR',
      metadata: JSON.stringify({ gateway, ...(metadata ? JSON.parse(metadata) : {}) }),
    });
  }

  static getAccountBalance(accountCode: string): number {
    try {
      const debits = db.prepare(
        'SELECT COALESCE(SUM(amount), 0) as total FROM journal_entries WHERE debit_account = ?'
      ).get(accountCode) as { total: number };

      const credits = db.prepare(
        'SELECT COALESCE(SUM(amount), 0) as total FROM journal_entries WHERE credit_account = ?'
      ).get(accountCode) as { total: number };

      return debits.total - credits.total;
    } catch (error) {
      console.error('[ACCOUNTING] Error getting account balance:', error);
      return 0;
    }
  }

  static getTrialBalance(): AccountBalance[] {
    const accounts: AccountBalance[] = [];

    for (const [code, accountCode] of Object.entries(ACCOUNT_CODES)) {
      const balance = this.getAccountBalance(accountCode);
      accounts.push({
        accountCode,
        accountName: code,
        accountType: this.getAccountType(accountCode),
        balance,
        currency: 'IRR',
      });
    }

    return accounts;
  }

  private static getAccountType(accountCode: string): 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' {
    if (accountCode.startsWith('10')) return 'asset';
    if (accountCode.startsWith('20')) return 'liability';
    if (accountCode.startsWith('40')) return 'revenue';
    return 'asset';
  }

  static getJournalEntries(referenceId?: string): JournalEntry[] {
    try {
      let query = 'SELECT * FROM journal_entries';
      const params: any[] = [];

      if (referenceId) {
        query += ' WHERE reference_id = ?';
        params.push(referenceId);
      }

      query += ' ORDER BY created_at DESC LIMIT 100';

      const entries = db.prepare(query).all(...params) as any[];
      return entries.map(entry => ({
        ...entry,
        metadata: entry.metadata ? JSON.parse(entry.metadata) : undefined,
      }));
    } catch (error) {
      console.error('[ACCOUNTING] Error getting journal entries:', error);
      return [];
    }
  }
}
