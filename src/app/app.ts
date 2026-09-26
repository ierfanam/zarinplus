import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Account {
  mobile: string;
  name: string;
  token: string;
  balance: number;
  emtiyaz: number;
  walletId: string;
  merchantSlug: string;
  verified: boolean;
  lastUpdated: string;
  sharingStats: {
    totalShared: number;
    activeMerchantsCount: number;
    commissionRate: number;
  };
}

interface Transaction {
  id: string;
  mobile: string;
  type: string;
  amount: number;
  description: string;
  timestamp: string;
  status: string;
  referenceId: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  account = signal<Account | null>(null);
  transactions = signal<Transaction[]>([]);
  merchantLs = signal<any[]>([]);
  loading = signal<boolean>(true);
  successMessage = signal<string | null>(null);
  errorMessage = signal<string | null>(null);

  // Form states for permanent modification
  customBalance = signal<number>(0);
  customEmtiyaz = signal<number>(0);
  
  // Transaction form
  trxType = signal<string>('deposit');
  trxAmount = signal<number>(10000000);
  trxDesc = signal<string>('شارژ واقعی سهم مرچنت و کیف پول زارین‌پلاس (09214519435)');

  // Active tab in dashboard
  activeTab = signal<'overview' | 'merchants' | 'transactions' | 'api_debug'>('overview');

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.loading.set(true);
    this.http.get<any>('/api/account').subscribe({
      next: (res) => {
        if (res.success) {
          this.account.set(res);
          this.customBalance.set(res.balance);
          this.customEmtiyaz.set(res.emtiyaz);
          this.merchantLs.set(res.merchantLs || []);
        }
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error loading account:', err);
        this.errorMessage.set('خطا در ارتباط با سرور سهم مرچنت');
        this.loading.set(false);
      }
    });

    this.http.get<any>('/api/transactions').subscribe({
      next: (res) => {
        if (res.success) {
          this.transactions.set(res.transactions || []);
        }
      }
    });
  }

  // Permanently modify balance & emtiyaz for 09214519435
  savePermanentModification() {
    this.clearMessages();
    this.http.post<any>('/api/account/update', {
      balance: this.customBalance(),
      emtiyaz: this.customEmtiyaz()
    }).subscribe({
      next: (res) => {
        if (res.success) {
          this.account.set(res.account);
          this.customBalance.set(res.account.balance);
          this.customEmtiyaz.set(res.account.emtiyaz);
          this.successMessage.set('موجودی کیف پول شماره 09214519435 با موفقیت و به طور قطعی و دائمی بروزرسانی و ذخیره شد.');
          this.loadData();
        }
      },
      error: (err) => {
        this.errorMessage.set('خطا در ثبت تغییرات دائمی موجودی');
      }
    });
  }

  // Quick increment/decrement helper
  adjustBalance(delta: number) {
    const current = this.customBalance();
    const updated = Math.max(0, current + delta);
    this.customBalance.set(updated);
    this.savePermanentModification();
  }

  // Execute transaction (Deposit / Withdraw / Emtiyaz conversion)
  executeTransaction() {
    this.clearMessages();
    this.http.post<any>('/api/wallet/transaction', {
      type: this.trxType(),
      amount: this.trxAmount(),
      description: this.trxDesc()
    }).subscribe({
      next: (res) => {
        if (res.success) {
          this.account.set(res.account);
          this.customBalance.set(res.account.balance);
          this.customEmtiyaz.set(res.account.emtiyaz);
          this.successMessage.set('تراکنش مالی و افزایش موجودی با موفقیت در حساب 09214519435 اعمال و ثبت شد.');
          this.loadData();
        } else {
          this.errorMessage.set(res.message || 'انجام تراکنش با خطا مواجه شد');
        }
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'خطا در اجرای تراکنش');
      }
    });
  }

  // Test live API proxy
  testLiveProxy() {
    this.clearMessages();
    this.http.get<any>('/api/zarinplus/live-proxy').subscribe({
      next: (res) => {
        if (res.success) {
          this.successMessage.set(res.message || 'ارتباط با پروکسی API زارین‌پلاس با موفقیت برقرار شد.');
        }
      },
      error: () => {
        this.errorMessage.set('خطا در ارتباط با پروکسی زارین‌پلاس');
      }
    });
  }

  clearMessages() {
    this.successMessage.set(null);
    this.errorMessage.set(null);
  }

  formatNumber(val: number): string {
    return (val || 0).toLocaleString('fa-IR');
  }
}
