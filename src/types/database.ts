export type MovementType = 'income' | 'expense';
export type SavingsType = 'deposit' | 'withdraw';
export type ThemePreference = 'light' | 'dark' | 'system';
export type JourneyStatus = 'active' | 'closed';
export type FinancialModule = 'personal' | 'business';

export interface SoftDeletableRecord {
  id: string;
  deletedAt?: string | null;
}

export interface SyncFields {
  version: number;
  synced: boolean;
  syncVersion: number;
  deviceId: string;
}

export interface SettingsRecord extends SoftDeletableRecord {
  id: 'global';
  dailyGoal: number;
  currency: string;
  theme: ThemePreference;
  businessInitialCapital: number;
  businessInitialCapitalByAccount?: Record<string, number>;
  personalInitialCapitalByAccount?: Record<string, number>;
  businessSaving: number;
  createdAt: string;
  updatedAt: string;
}

export interface PersonalMovementRecord extends SoftDeletableRecord, SyncFields {
  transferId?: string;
  internalTransfer?: boolean;
  accountId?: string;
  type: MovementType;
  amount: number;
  description: string;
  paymentMethod: string;
  detectedCategory: string;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessMovementRecord extends SoftDeletableRecord, SyncFields {
  transferId?: string;
  internalTransfer?: boolean;
  accountId?: string;
  journeyId: string;
  deliveryCount?: number;
  type: MovementType;
  amount: number;
  description: string;
  paymentMethod: string;
  detectedCategory: string;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface JourneyRecord extends SoftDeletableRecord {
  startTime: string;
  endTime: string | null;
  initialCapital: number;
  initialCapitalByAccount?: Record<string, number>;
  finalCapital: number;
  finalCapitalByAccount?: Record<string, number>;
  income: number;
  incomeByAccount?: Record<string, number>;
  expenses: number;
  expensesByAccount?: Record<string, number>;
  profit: number;
  savingTransferred: number;
  goalAmount: number;
  goalProgress: number;
  goalReached: boolean;
  status: JourneyStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SavingRecord extends SoftDeletableRecord {
  accountId?: string;
  type: SavingsType;
  amount: number;
  description: string;
  balanceAfter: number;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface CapitalRecord extends SoftDeletableRecord {
  id: 'current';
  currentCapital: number;
  availableCapital: number;
  totalSavings: number;
  totalProfit: number;
  updatedAt: string;
}

export interface DailyGoalRecord extends SoftDeletableRecord {
  goal: number;
  current: number;
  remaining: number;
  percentage: number;
  completed: boolean;
  date: string;
}

export interface ClassificationRuleRecord extends SoftDeletableRecord {
  keyword: string;
  category: string;
  timesUsed: number;
  confidence: number;
  createdAt: string;
}

export interface FinancialAccountRecord extends SoftDeletableRecord {
  module: FinancialModule;
  name: string;
  normalizedName: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountTransferRecord extends SoftDeletableRecord {
  module: FinancialModule;
  sourceModule?: FinancialModule;
  destinationModule?: FinancialModule;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: number;
  description: string;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseMetadataRecord {
  key: string;
  value: string;
}

export interface BackupRecord {
  id: string;
  createdAt: string;
  data: import('./index').AppData;
}
