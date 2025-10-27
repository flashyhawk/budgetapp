export type CashBook = {
  id: string;
  name: string;
  type: string;
  accountNumber: string;
  balance: number;
  currency: string;
  notes?: string;
  lastActivity?: {
    date: string;
    label: string;
    amount: number;
  };
};

export type ExpenseGroup = {
  id: string;
  name: string;
  description?: string;
  color?: string;
  defaultMonthlyBudget?: number;
};

export type MonthlyPlan = {
  id: string;
  month: string;
  cycleStart: string;
  cycleEnd: string;
  locked: boolean;
  currency: string;
  savingsTarget?: number;
  budgets: Array<{
    groupId: string;
    planned: number;
    actual: number;
  }>;
};

export type Summary = {
  cycle: {
    month: string;
    range: {
      start: string;
      end: string;
    };
    locked: boolean;
    savingsTarget?: number;
  };
  totals: {
    planned: number;
    actual: number;
    expenses: number;
    cashOnHand: number;
  };
  topExpenseGroups: Array<{
    groupId: string;
    name: string;
    amount: number;
  }>;
  quickLinks: Array<{
    id: string;
    label: string;
    href: string;
  }>;
};

export type Expense = {
  id: string;
  label: string;
  amount: number;
  type: string;
  groupId: string;
  cashBookId: string;
  date: string;
  note?: string;
  tags: string[];
  createdAt: string;
};

export type PlannedVsActualRow = {
  groupId: string;
  planned: number;
  actual: number;
};

export type ExpensesQuery = {
  startDate?: string;
  endDate?: string;
  groupId?: string;
  cashBookId?: string;
  search?: string;
};

export type CreateExpenseInput = {
  label: string;
  amount: number;
  groupId: string;
  cashBookId: string;
  date: string;
  note?: string;
  tags?: string[];
  planMonth?: string;
};

export type CreateExpenseGroupInput = {
  name: string;
  description?: string;
  color?: string;
  defaultMonthlyBudget?: number;
  id?: string;
};

export type SaveMonthlyPlanInput = {
  id?: string;
  month: string;
  cycleStart?: string;
  cycleEnd?: string;
  locked?: boolean;
  currency?: string;
  savingsTarget?: number;
  budgets: Array<{
    groupId: string;
    planned: number;
    actual?: number;
  }>;
};

export type SaveCashBookInput = {
  id?: string;
  name: string;
  type?: string;
  accountNumber?: string;
  balance?: number;
  currency?: string;
  notes?: string;
};
