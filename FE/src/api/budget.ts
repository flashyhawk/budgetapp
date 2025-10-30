import { request, requestVoid } from './client';
import type {
  CashBook,
  Expense,
  ExpenseGroup,
  ExpensesQuery,
  MonthlyPlan,
  PlannedVsActualRow,
  Summary,
  CreateExpenseInput,
  UpdateExpenseInput,
  CreateExpenseGroupInput,
  SaveMonthlyPlanInput,
  SaveCashBookInput,
} from './types';

export const getSummary = () => request<Summary>('/api/summary');

export const getCashBooks = () => request<CashBook[]>('/api/cash-books');

export const getExpenseGroups = () => request<ExpenseGroup[]>('/api/expense-groups');

export const getMonthlyPlans = () => request<MonthlyPlan[]>('/api/monthly-plans');

export const getCurrentMonthlyPlan = () => request<MonthlyPlan>('/api/monthly-plans/current');

export const getPlanHistory = () => request<MonthlyPlan[]>('/api/monthly-plans/history');

export const getExpenses = (filters: ExpensesQuery = {}) =>
  request<Expense[]>('/api/expenses', { params: filters });

export const getExpense = (id: string) => request<Expense>(`/api/expenses/${id}`);

export const createExpense = (payload: CreateExpenseInput) =>
  request<Expense>('/api/expenses', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const updateExpense = (id: string, payload: UpdateExpenseInput) =>
  request<Expense>(`/api/expenses/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });

export const deleteExpense = (id: string) =>
  requestVoid(`/api/expenses/${id}`, {
    method: 'DELETE',
  });

export const importData = (payload: {
  cashBooks: CashBook[];
  expenseGroups: ExpenseGroup[];
  monthlyPlans: MonthlyPlan[];
  expenses: Expense[];
}) =>
  requestVoid('/api/import', {
    method: 'POST',
    body: JSON.stringify(payload),
    successMessage: 'Data imported successfully',
  });

export const getPlannedVsActual = () => request<PlannedVsActualRow[]>('/api/reports/planned-vs-actual');

export const createExpenseGroup = (payload: CreateExpenseGroupInput) =>
  request<ExpenseGroup>('/api/expense-groups', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const createMonthlyPlan = (payload: SaveMonthlyPlanInput) =>
  request<MonthlyPlan>('/api/monthly-plans', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const updateMonthlyPlan = (id: string, payload: SaveMonthlyPlanInput) =>
  request<MonthlyPlan>(`/api/monthly-plans/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });

export const createCashBook = (payload: SaveCashBookInput) =>
  request<CashBook>('/api/cash-books', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const resetData = () =>
  requestVoid('/api/reset', {
    method: 'POST',
  });

export const exportData = () => request<Record<string, unknown>>('/api/export');
