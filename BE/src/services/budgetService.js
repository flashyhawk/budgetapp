const path = require('path');
const { randomUUID } = require('crypto');
const JsonStore = require('../utils/jsonStore');

const store = new JsonStore(path.join(__dirname, '..', 'data'));

const clone = (value) => JSON.parse(JSON.stringify(value));

const parseDate = (value) => new Date(`${value}T00:00:00Z`);

const isWithinRange = (dateValue, start, end) => {
  const ts = parseDate(dateValue).getTime();
  if (start && ts < parseDate(start).getTime()) return false;
  if (end && ts > parseDate(end).getTime()) return false;
  return true;
};

const sortByDateDesc = (a, b) => (a.date < b.date ? 1 : -1);

async function getCashBooks() {
  return store.read('cashBooks');
}

async function getExpenseGroups() {
  return store.read('expenseGroups');
}

async function getMonthlyPlans() {
  const plans = await store.read('monthlyPlans');
  return plans.sort((a, b) => (a.month < b.month ? 1 : -1));
}

async function getCurrentPlan() {
  const plans = await getMonthlyPlans();
  if (!plans.length) {
    return null;
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  const currentMonth = todayKey.slice(0, 7);

  const activeCycle = plans.find((plan) => isWithinRange(todayKey, plan.cycleStart, plan.cycleEnd));
  if (activeCycle) {
    return activeCycle;
  }

  const monthMatch = plans.find((plan) => plan.month === currentMonth);
  if (monthMatch) {
    return monthMatch;
  }

  return plans[0];
}

async function getPlanHistory() {
  const plans = await getMonthlyPlans();
  const currentPlan = await getCurrentPlan();
  if (!currentPlan) {
    return plans;
  }
  return plans.filter((plan) => plan.id !== currentPlan.id);
}

async function getExpenses(filters = {}) {
  const expenses = await store.read('expenses');
  const { startDate, endDate, groupId, cashBookId, search } = filters;

  return expenses
    .filter((expense) => isWithinRange(expense.date, startDate, endDate))
    .filter((expense) => (groupId ? expense.groupId === groupId : true))
    .filter((expense) => (cashBookId ? expense.cashBookId === cashBookId : true))
    .filter((expense) => {
      if (!search) return true;
      const term = search.toLowerCase();
      return (
        expense.label.toLowerCase().includes(term) ||
        (expense.note && expense.note.toLowerCase().includes(term)) ||
        expense.tags.some((tag) => tag.toLowerCase().includes(term))
      );
    })
    .sort(sortByDateDesc);
}

async function getSummary() {
  const [cashBooks, currentPlan, expenses, groups] = await Promise.all([
    getCashBooks(),
    getCurrentPlan(),
    getExpenses(),
    getExpenseGroups(),
  ]);

  const planBudgets = currentPlan?.budgets ?? [];

  const planTotals = planBudgets.reduce(
    (acc, budget) => {
      acc.planned += budget.planned;
      acc.actual += budget.actual;
      return acc;
    },
    { planned: 0, actual: 0 },
  );

  const groupedExpenses = expenses.reduce((acc, expense) => {
    acc[expense.groupId] = (acc[expense.groupId] ?? 0) + expense.amount;
    return acc;
  }, {});

  const topGroups = groups
    .map((group) => ({
      groupId: group.id,
      name: group.name,
      amount: groupedExpenses[group.id] ?? 0,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);

  const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const totalBalance = cashBooks.reduce((sum, book) => sum + book.balance, 0);

  return {
    cycle: {
      month: currentPlan?.month ?? '',
      range: {
        start: currentPlan?.cycleStart ?? '',
        end: currentPlan?.cycleEnd ?? '',
      },
      locked: currentPlan?.locked ?? false,
      savingsTarget: currentPlan?.savingsTarget ?? 0,
    },
    totals: {
      planned: planTotals.planned,
      actual: planTotals.actual,
      expenses: totalExpenses,
      cashOnHand: totalBalance,
    },
    topExpenseGroups: topGroups,
    quickLinks: [
      { id: 'quick-add-expense', label: 'Add Expense', href: '/add-expense' },
      { id: 'quick-plan-budget', label: 'Plan Budget', href: '/monthly-planner' },
      { id: 'quick-reports', label: 'View Reports', href: '/reports' },
    ],
  };
}

async function createExpense(payload) {
  const newExpense = {
    id: payload.id ?? randomUUID(),
    label: payload.label,
    amount: Number(payload.amount),
    type: payload.type ?? 'expense',
    groupId: payload.groupId,
    cashBookId: payload.cashBookId,
    date: payload.date,
    note: payload.note ?? '',
    tags: payload.tags ?? [],
    createdAt: new Date().toISOString(),
  };

  const expenses = await store.read('expenses');
  expenses.push(newExpense);
  await store.write('expenses', expenses);

  // Update current plan actuals if the expense falls within the active cycle.
  const plans = await store.read('monthlyPlans');
  const currentPlan = await getCurrentPlan();
  const planMonth = payload.planMonth ?? currentPlan?.month;
  const planIndex = planMonth ? plans.findIndex((plan) => plan.month === planMonth) : -1;
  if (planIndex !== -1) {
    const plan = plans[planIndex];
    const withinCycle = isWithinRange(payload.date, plan.cycleStart, plan.cycleEnd);
    if (withinCycle) {
      const budget = plan.budgets.find((item) => item.groupId === payload.groupId);
      if (budget) {
        budget.actual = Number((budget.actual + newExpense.amount).toFixed(2));
      } else {
        plan.budgets.push({
          groupId: payload.groupId,
          planned: 0,
          actual: newExpense.amount,
        });
      }
      plans[planIndex] = plan;
      await store.write('monthlyPlans', plans);
    }
  }

  // Decrease the cash book balance
  const cashBooks = await store.read('cashBooks');
  const cashBookIndex = cashBooks.findIndex((book) => book.id === payload.cashBookId);
  if (cashBookIndex !== -1) {
    cashBooks[cashBookIndex] = {
      ...cashBooks[cashBookIndex],
      balance: Number((cashBooks[cashBookIndex].balance - newExpense.amount).toFixed(2)),
      lastActivity: {
        date: payload.date,
        label: payload.label,
        amount: -newExpense.amount,
      },
    };
    await store.write('cashBooks', cashBooks);
  }

  return newExpense;
}

async function createExpenseGroup(payload) {
  if (!payload?.name) {
    throw new Error('Expense group name is required');
  }

  const groups = await store.read('expenseGroups');
  const groupIndex = payload.id ? groups.findIndex((group) => group.id === payload.id) : -1;

  const normalized = {
    id: payload.id ?? randomUUID(),
    name: payload.name.trim(),
    description: payload.description?.trim() ?? '',
    color: payload.color ?? '#6C63FF',
    defaultMonthlyBudget: Number(payload.defaultMonthlyBudget ?? 0),
  };

  if (groupIndex >= 0) {
    groups[groupIndex] = { ...groups[groupIndex], ...normalized };
  } else {
    groups.push(normalized);
  }

  await store.write('expenseGroups', groups);

  return normalized;
}

async function getExpenseGroupById(id) {
  if (!id) return null;
  const groups = await store.read('expenseGroups');
  return groups.find((group) => group.id === id) ?? null;
}

async function getMonthlyPlanById(id) {
  if (!id) return null;
  const plans = await store.read('monthlyPlans');
  return plans.find((plan) => plan.id === id) ?? null;
}

async function saveMonthlyPlan(payload) {
  if (!payload?.month) {
    throw new Error('Plan month is required');
  }

  const plans = await store.read('monthlyPlans');
  const planIndex = payload.id ? plans.findIndex((plan) => plan.id === payload.id) : -1;
  const existingPlan = planIndex >= 0 ? plans[planIndex] : null;

  const normalizedBudgets = (payload.budgets ?? []).map((budget) => {
    const existingBudget = existingPlan?.budgets.find((item) => item.groupId === budget.groupId);
    return {
      groupId: budget.groupId,
      planned: Number(budget.planned ?? 0),
      actual: existingBudget ? existingBudget.actual ?? 0 : Number(budget.actual ?? 0),
    };
  });

  const normalizedPlan = {
    id: payload.id ?? randomUUID(),
    month: payload.month,
    cycleStart: payload.cycleStart ?? '',
    cycleEnd: payload.cycleEnd ?? '',
    locked: Boolean(payload.locked),
    currency: payload.currency ?? 'INR',
    savingsTarget: Number(payload.savingsTarget ?? 0),
    budgets: normalizedBudgets,
  };

  if (planIndex >= 0) {
    plans[planIndex] = normalizedPlan;
  } else {
    plans.push(normalizedPlan);
  }

  plans.sort((a, b) => (a.month < b.month ? 1 : -1));
  await store.write('monthlyPlans', plans);

  return normalizedPlan;
}

async function saveCashBook(payload) {
  if (!payload?.name) {
    throw new Error('Cash book name is required');
  }

  const cashBooks = await store.read('cashBooks');
  const bookIndex = payload.id ? cashBooks.findIndex((book) => book.id === payload.id) : -1;
  const normalized = {
    id: payload.id ?? randomUUID(),
    name: payload.name.trim(),
    type: payload.type ?? 'bank',
    accountNumber: payload.accountNumber ?? '',
    balance: Number(payload.balance ?? 0),
    currency: payload.currency ?? 'INR',
    notes: payload.notes ?? '',
    lastActivity: bookIndex >= 0 ? cashBooks[bookIndex].lastActivity ?? null : null,
  };

  if (bookIndex >= 0) {
    cashBooks[bookIndex] = { ...cashBooks[bookIndex], ...normalized };
  } else {
    cashBooks.push(normalized);
  }

  await store.write('cashBooks', cashBooks);
  return normalized;
}

async function resetData() {
  const datasets = ['cashBooks', 'expenseGroups', 'monthlyPlans', 'expenses'];
  await Promise.all(datasets.map((dataset) => store.write(dataset, [])));
}

module.exports = {
  getCashBooks,
  getExpenseGroups,
  getExpenseGroupById,
  getMonthlyPlanById,
  getMonthlyPlans,
  getCurrentPlan,
  getPlanHistory,
  getExpenses,
  getSummary,
  createExpense,
  createExpenseGroup,
  saveMonthlyPlan,
  saveCashBook,
  resetData,
};
