const path = require('path');
const { randomUUID } = require('crypto');
const JsonStore = require('../utils/jsonStore');

const store = new JsonStore(path.join(__dirname, '..', 'data'));

const roundCurrency = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const clampActual = (value) => (value < 0 ? 0 : value);

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

async function getExpenseById(id) {
  if (!id) return null;
  const expenses = await store.read('expenses');
  return expenses.find((expense) => expense.id === id) ?? null;
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

const findPlanIndexForExpense = (plans, expense, planMonthHint) => {
  if (planMonthHint) {
    const hintIndex = plans.findIndex((plan) => plan.month === planMonthHint);
    if (hintIndex !== -1) {
      const plan = plans[hintIndex];
      if ((!plan.cycleStart && !plan.cycleEnd) || isWithinRange(expense.date, plan.cycleStart, plan.cycleEnd)) {
        return hintIndex;
      }
    }
  }

  return plans.findIndex((plan) => isWithinRange(expense.date, plan.cycleStart, plan.cycleEnd));
};

async function adjustPlanActuals(expense, delta, planMonthHint) {
  if (!delta) return undefined;
  const plans = await store.read('monthlyPlans');
  if (!plans.length) {
    return undefined;
  }

  const planIndex = findPlanIndexForExpense(plans, expense, planMonthHint);
  if (planIndex === -1) {
    return undefined;
  }

  const plan = plans[planIndex];
  const budgets = [...plan.budgets];
  const budgetIndex = budgets.findIndex((item) => item.groupId === expense.groupId);
  let changed = false;

  if (budgetIndex === -1) {
    if (delta > 0) {
      budgets.push({
        groupId: expense.groupId,
        planned: 0,
        actual: roundCurrency(delta),
      });
      changed = true;
    }
  } else {
    const updatedActual = clampActual(roundCurrency(roundCurrency(budgets[budgetIndex].actual ?? 0) + delta));
    budgets[budgetIndex] = {
      ...budgets[budgetIndex],
      actual: updatedActual,
    };
    changed = true;
  }

  if (!changed) {
    return plan.month;
  }

  plan.budgets = budgets;
  plans[planIndex] = plan;
  await store.write('monthlyPlans', plans);
  return plan.month;
}

async function computeLastActivity(cashBookId) {
  const expenses = await store.read('expenses');
  const latest = expenses
    .filter((expense) => expense.cashBookId === cashBookId)
    .sort((a, b) => {
      if (a.date === b.date) {
        return a.createdAt < b.createdAt ? 1 : -1;
      }
      return a.date < b.date ? 1 : -1;
    })[0];

  if (!latest) return null;

  return {
    date: latest.date,
    label: latest.label,
    amount: -latest.amount,
  };
}

async function adjustCashBookBalance(expense, delta) {
  if (!delta) return;
  const cashBooks = await store.read('cashBooks');
  const cashBookIndex = cashBooks.findIndex((book) => book.id === expense.cashBookId);
  if (cashBookIndex === -1) {
    return;
  }

  const updatedBook = {
    ...cashBooks[cashBookIndex],
    balance: roundCurrency(roundCurrency(cashBooks[cashBookIndex].balance) - delta),
  };

  updatedBook.lastActivity = await computeLastActivity(updatedBook.id);
  cashBooks[cashBookIndex] = updatedBook;
  await store.write('cashBooks', cashBooks);
}

async function createExpense(payload) {
  const amount = roundCurrency(payload.amount);
  const newExpense = {
    id: payload.id ?? randomUUID(),
    label: payload.label,
    amount,
    type: payload.type ?? 'expense',
    groupId: payload.groupId,
    cashBookId: payload.cashBookId,
    date: payload.date,
    note: payload.note ?? '',
    tags: payload.tags ?? [],
    createdAt: new Date().toISOString(),
  };

  const currentPlan = await getCurrentPlan();
  const planMonthHint = payload.planMonth ?? currentPlan?.month;
  const plansSnapshot = await store.read('monthlyPlans');
  const planIndex = findPlanIndexForExpense(plansSnapshot, newExpense, planMonthHint);
  if (planIndex !== -1) {
    newExpense.planMonth = plansSnapshot[planIndex].month;
  } else if (planMonthHint) {
    newExpense.planMonth = planMonthHint;
  }

  const expenses = await store.read('expenses');
  expenses.push(newExpense);
  await store.write('expenses', expenses);

  await adjustPlanActuals(newExpense, amount, newExpense.planMonth ?? planMonthHint);
  await adjustCashBookBalance(newExpense, amount);

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
    defaultMonthlyBudget: roundCurrency(payload.defaultMonthlyBudget ?? 0),
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
      planned: roundCurrency(budget.planned ?? 0),
      actual: existingBudget ? existingBudget.actual ?? 0 : roundCurrency(budget.actual ?? 0),
    };
  });

  const normalizedPlan = {
    id: payload.id ?? randomUUID(),
    month: payload.month,
    cycleStart: payload.cycleStart ?? '',
    cycleEnd: payload.cycleEnd ?? '',
    locked: Boolean(payload.locked),
    currency: payload.currency ?? 'INR',
    savingsTarget: roundCurrency(payload.savingsTarget ?? 0),
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

async function updateExpense(id, payload = {}) {
  if (!id) {
    throw new Error('Expense id is required');
  }

  const expenses = await store.read('expenses');
  const expenseIndex = expenses.findIndex((expense) => expense.id === id);
  if (expenseIndex === -1) {
    throw new Error('Expense not found');
  }

  const previous = { ...expenses[expenseIndex] };
  const amount = payload.amount !== undefined ? roundCurrency(payload.amount) : previous.amount;
  const updatedExpense = {
    ...previous,
    label: payload.label ?? previous.label,
    amount,
    groupId: payload.groupId ?? previous.groupId,
    cashBookId: payload.cashBookId ?? previous.cashBookId,
    date: payload.date ?? previous.date,
    note: payload.note ?? '',
    tags: Array.isArray(payload.tags) ? payload.tags : previous.tags ?? [],
  };

  const currentPlan = await getCurrentPlan();
  const planMonthHint = payload.planMonth ?? previous.planMonth ?? currentPlan?.month;
  const plansSnapshot = await store.read('monthlyPlans');
  const newPlanIndex = findPlanIndexForExpense(plansSnapshot, updatedExpense, planMonthHint);
  if (newPlanIndex !== -1) {
    updatedExpense.planMonth = plansSnapshot[newPlanIndex].month;
  } else if (planMonthHint) {
    updatedExpense.planMonth = planMonthHint;
  } else {
    delete updatedExpense.planMonth;
  }

  expenses[expenseIndex] = updatedExpense;
  await store.write('expenses', expenses);

  await adjustPlanActuals(previous, -previous.amount, previous.planMonth);
  await adjustPlanActuals(updatedExpense, amount, updatedExpense.planMonth ?? planMonthHint);
  await adjustCashBookBalance(previous, -previous.amount);
  await adjustCashBookBalance(updatedExpense, amount);

  return updatedExpense;
}

async function deleteExpense(id) {
  if (!id) {
    throw new Error('Expense id is required');
  }

  const expenses = await store.read('expenses');
  const expenseIndex = expenses.findIndex((expense) => expense.id === id);
  if (expenseIndex === -1) {
    throw new Error('Expense not found');
  }

  const [removed] = expenses.splice(expenseIndex, 1);
  await store.write('expenses', expenses);

  await adjustPlanActuals(removed, -removed.amount, removed.planMonth);
  await adjustCashBookBalance(removed, -removed.amount);

  return removed;
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
    balance: roundCurrency(payload.balance ?? 0),
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

async function exportData() {
  const datasets = ['cashBooks', 'expenseGroups', 'monthlyPlans', 'expenses'];
  const entries = await Promise.all(datasets.map(async (dataset) => [dataset, await store.read(dataset)]));
  return Object.fromEntries(entries);
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
  getExpenseById,
  getSummary,
  createExpense,
  updateExpense,
  deleteExpense,
  createExpenseGroup,
  saveMonthlyPlan,
  saveCashBook,
  resetData,
  exportData,
};
