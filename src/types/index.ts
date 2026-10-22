export type LedgerSpace = 'personal' | 'deliveries';
export type MovementKind = 'income' | 'expense';
export type SavingsKind = 'deposit' | 'withdrawal';
export type AppPage = 'overview' | 'history' | 'reports' | 'savings' | 'settings';
export type ReportRange = 'day' | 'week' | 'month' | 'year';
export type ThemeMode = 'light' | 'dark' | 'system';

export interface Movement {
  id: string;
  transferId?: string;
  internalTransfer?: boolean;
  space: LedgerSpace;
  kind: MovementKind;
  amountCOP: number;
  description: string;
  occurredAt: string;
  paymentMethod: string;
  accountId?: string;
  deletedAt?: string | null;
  category: string;
  deliveryCount: number;
  workdayId: string | null;
}

export interface Workday {
  id: string;
  startedAt: string;
  initialCapitalCOP: number;
  initialCapitalByAccount?: Record<string, number>;
  finalCapitalByAccount?: Record<string, number>;
  incomeByAccount?: Record<string, number>;
  expensesByAccount?: Record<string, number>;
  endedAt: string | null;
  savingsTransferredCOP: number;
  deletedAt?: string | null;
}

export interface SavingsMovement {
  id: string;
  kind: SavingsKind;
  amountCOP: number;
  occurredAt: string;
  note: string;
  accountId?: string;
  deletedAt?: string | null;
}

export interface AccountTransfer {
  id: string;
  module: 'personal' | 'business';
  sourceModule?: 'personal' | 'business';
  destinationModule?: 'personal' | 'business';
  sourceAccountId: string;
  destinationAccountId: string;
  amount: number;
  description: string;
  date: string;
  deletedAt?: string | null;
}

export interface AppSettings {
  dailyGoalCOP: number;
  startingCapitalCOP: number;
  businessInitialCapitalByAccount?: Record<string, number>;
  personalInitialCapitalByAccount?: Record<string, number>;
  paymentMethods: string[];
  currency: string;
  theme: ThemeMode;
  learnedCategories: Record<LedgerSpace, Record<string, string>>;
}

export interface AppData {
  schemaVersion: 1;
  movements: Movement[];
  workdays: Workday[];
  savings: SavingsMovement[];
  settings: AppSettings;
  accountBalances?: Record<LedgerSpace, { total: number; accounts: { id: string; name: string; balance: number }[] }>;
  dailyGoal?: { current: number; goal: number; remaining: number; percentage: number; completed: boolean; excess: number };
  businessProfitCOP?: number;
  transfers?: Record<LedgerSpace, AccountTransfer[]>;
  integrityIssues?: string[];
}

export interface MovementDraft {
  space: LedgerSpace;
  kind: MovementKind;
  amountCOP: number;
  description: string;
  occurredAt: string;
  paymentMethod: string;
  accountId?: string;
  category: string;
  deliveryCount: number;
}

export interface Totals {
  incomeCOP: number;
  expenseCOP: number;
  profitCOP: number;
}
