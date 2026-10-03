import { ChangeDetectionStrategy, Component, OnInit, signal, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { environment } from '../environments/environment.js';

interface UserAuth {
  mobile: string;
  name: string;
  role: string;
  token: string;
}

interface Account {
  id: string;
  balance: number;
  emtiyaz: number;
  merchantSlug: string;
  lastUpdated: string;
  sharingStats: {
    totalShared: number;
    activeMerchantsCount: number;
    commissionRate: number;
  };
  user: {
    mobile: string;
    name: string;
    verified: boolean;
  };
}

interface Merchant {
  id: number;
  name: string;
  shareAmount: number;
  status: string;
  slug: string;
}

interface Transaction {
  id: number;
  type: string;
  amount: number;
  description: string;
  referenceId: string;
  status: string;
  timestamp: string;
}

interface LoginResponse {
  success: boolean;
  token: string;
  user: {
    id: number;
    mobile: string;
    name: string;
    role: string;
  };
  message?: string;
}

interface BalanceResponse {
  success: boolean;
  wallet: Account;
}

interface TransactionResponse {
  success: boolean;
  transactions: Transaction[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface MerchantResponse {
  success: boolean;
  merchants: Merchant[];
}

interface UpdateBalanceResponse {
  success: boolean;
  message?: string;
  account: Account;
}

interface ExecuteTransactionResponse {
  success: boolean;
  message?: string;
  account: Account;
  transaction: {
    id: number;
    type: string;
    amount: number;
    description: string;
    referenceId: string;
    timestamp: string;
    status: string;
  };
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
  apiUrl = environment.apiUrl;

  user = signal<UserAuth | null>(null);
  account = signal<Account | null>(null);
  transactions = signal<Transaction[]>([]);
  merchantLs = signal<Merchant[]>([]);
  loading = signal<boolean>(true);
  successMessage = signal<string | null>(null);
  errorMessage = signal<string | null>(null);

  customBalance = signal<number>(0);
  customEmtiyaz = signal<number>(0);

  trxType = signal<string>('deposit');
  trxAmount = signal<number>(10000000);
  trxDesc = signal<string>('شارژ واقعی سهم مرچنت و کیف پول زارین‌پلاس (09214519435)');

  activeTab = signal<'overview' | 'merchants' | 'transactions' | 'audit' | 'api_debug'>('overview');

  loginMobile = signal<string>('09214519435');
  loginPassword = signal<string>('');
  isLoginMode = signal<boolean>(true);

  private http = inject(HttpClient);

  ngOnInit() {
    const savedUser = localStorage.getItem('zarinplus_user');
    if (savedUser) {
      try {
        this.user.set(JSON.parse(savedUser) as UserAuth);
      } catch {
        // ignore parse error
      }
    }
    if (this.user()) {
      this.loadData();
    }
  }

  getHeaders(): HttpHeaders {
    const token = this.user()?.token;
    return new HttpHeaders({
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    });
  }

  login() {
    this.clearMessages();
    this.loading.set(true);
    const mobile = this.loginMobile();
    const password = this.loginPassword();

    if (!mobile || !password) {
      this.errorMessage.set('شماره موبایل و رمز عبور الزامی است');
      this.loading.set(false);
      return;
    }

    this.http.post<LoginResponse>(`${this.apiUrl}/auth/login`, {
      mobile,
      password,
    }).subscribe({
      next: (res) => {
        if (res.success) {
          const userAuth: UserAuth = {
            mobile: res.user.mobile,
            name: res.user.name,
            role: res.user.role,
            token: res.token,
          };
          this.user.set(userAuth);
          localStorage.setItem('zarinplus_user', JSON.stringify(userAuth));
          this.successMessage.set('ورود با موفقیت انجام شد');
          this.loading.set(false);
          this.loadData();
        } else {
          this.errorMessage.set(res.message || 'خطا در ورود');
          this.loading.set(false);
        }
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'خطا در ارتباط با سرور');
        this.loading.set(false);
      },
    });
  }

  logout() {
    this.http.post(`${this.apiUrl}/auth/logout`, {}, { headers: this.getHeaders() }).subscribe({
      next: () => {
        this.user.set(null);
        this.account.set(null);
        this.transactions.set([]);
        this.merchantLs.set([]);
        localStorage.removeItem('zarinplus_user');
        this.clearMessages();
      },
      error: () => {
        this.user.set(null);
        this.account.set(null);
        this.transactions.set([]);
        this.merchantLs.set([]);
        localStorage.removeItem('zarinplus_user');
      },
    });
  }

  loadData() {
    this.loading.set(true);
    const headers = this.getHeaders();

    this.http.get<BalanceResponse>(`${this.apiUrl}/wallet/balance`, { headers }).subscribe({
      next: (res) => {
        if (res.success) {
          this.account.set(res.wallet);
          this.customBalance.set(res.wallet.balance);
          this.customEmtiyaz.set(res.wallet.emtiyaz);
        }
        this.loading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'خطا در دریافت اطلاعات حساب');
        this.loading.set(false);
      },
    });

    this.http.get<TransactionResponse>(`${this.apiUrl}/wallet/transactions`, { headers }).subscribe({
      next: (res) => {
        if (res.success) {
          this.transactions.set(res.transactions);
        }
      },
    });

    this.http.get<MerchantResponse>(`${this.apiUrl}/merchants`, { headers }).subscribe({
      next: (res) => {
        if (res.success) {
          this.merchantLs.set(res.merchants);
        }
      },
    });
  }

  savePermanentModification() {
    this.clearMessages();
    this.http.post<UpdateBalanceResponse>(`${this.apiUrl}/wallet/update`, {
      balance: this.customBalance(),
      emtiyaz: this.customEmtiyaz(),
    }, { headers: this.getHeaders() }).subscribe({
      next: (res) => {
        if (res.success) {
          this.account.set(res.account);
          this.customBalance.set(res.account.balance);
          this.customEmtiyaz.set(res.account.emtiyaz);
          this.successMessage.set('موجودی کیف پول با موفقیت و به طور دائمی بروزرسانی و ذخیره شد.');
          this.loadData();
        } else {
          this.errorMessage.set(res.message || 'خطا در ثبت تغییرات');
        }
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'خطا در ثبت تغییرات دائمی موجودی');
      },
    });
  }

  adjustBalance(delta: number) {
    const current = this.customBalance();
    const updated = Math.max(0, current + delta);
    this.customBalance.set(updated);
    this.savePermanentModification();
  }

  executeTransaction() {
    this.clearMessages();
    this.http.post<ExecuteTransactionResponse>(`${this.apiUrl}/wallet/transaction`, {
      type: this.trxType(),
      amount: this.trxAmount(),
      description: this.trxDesc(),
    }, { headers: this.getHeaders() }).subscribe({
      next: (res) => {
        if (res.success) {
          this.account.set(res.account);
          this.customBalance.set(res.account.balance);
          this.customEmtiyaz.set(res.account.emtiyaz);
          this.successMessage.set('تراکنش مالی و افزایش موجودی با موفقیت اعمال و ثبت شد.');
          this.loadData();
        } else {
          this.errorMessage.set(res.message || 'انجام تراکنش با خطا مواجه شد');
        }
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'خطا در اجرای تراکنش');
      },
    });
  }

  testLiveProxy() {
    this.clearMessages();
    this.http.get<{ success: boolean; message?: string }>(`${this.apiUrl}/zarinplus/live-proxy`, { headers: this.getHeaders() }).subscribe({
      next: (res) => {
        if (res.success) {
          this.successMessage.set(res.message || 'ارتباط با پروکسی API زارین‌پلاس برقرار شد.');
        }
      },
      error: () => {
        this.errorMessage.set('خطا در ارتباط با پروکسی زارین‌پلاس');
      },
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
