const db = require('../db');

const toAmount = (value) => Math.round(Number(value) || 0);
const toDbAmount = (value) => Math.round(Number(value) * 100);
const fromDbAmount = (value) => (Number(value) || 0) / 100;

const endOfMonth = (month) => {
  if (!month) return '';
  const [year, monthIndex] = month.split('-').map(Number);
  if (!year || !monthIndex) return '';
  const date = new Date(year, monthIndex, 0);
  return date.toISOString().slice(0, 10);
};

const normalizeDate = (value) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const isWithinRange = (dateValue, start, end) => {
  if (!dateValue) return false;
  const date = normalizeDate(dateValue);
  if (!date) return false;
  const ts = new Date(`${date}T00:00:00Z`).getTime();
  if (start) {
    const startTs = new Date(`${start}T00:00:00Z`).getTime();
    if (ts < startTs) return false;
  }
  if (end) {
    const endTs = new Date(`${end}T00:00:00Z`).getTime();
    if (ts > endTs) return false;
  }
  return true;
};

const runQuery = (client, text, params = []) => {
  if (client) {
    return client.query(text, params);
  }
  return db.query(text, params);
};

const withTransaction = async (handler) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const result = await handler(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const mapCashBookRow = (row) => {
  const lastActivity = row.last_activity_date
    ? {
        date: normalizeDate(row.last_activity_date),
        label: row.last_activity_label,
        amount: -fromDbAmount(row.last_activity_amount_cents || 0),
      }
    : null;
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    accountNumber: row.account_number ?? '',
    balance: fromDbAmount(row.balance_cents),
    currency: row.currency,
    notes: row.notes ?? '',
    lastActivity,
  };
};

const mapExpenseGroupRow = (row) => ({
  id: row.id,
  name: row.name,
  description: row.description ?? '',
  color: row.color ?? '#6C63FF',
  defaultMonthlyBudget: fromDbAmount(row.default_monthly_budget_cents),
});

const mapBudgetRow = (row) => ({
  groupId: row.group_id,
  planned: fromDbAmount(row.planned_cents),
  actual: fromDbAmount(row.actual_cents),
});

const mapPlanRow = (planRow, budgets = []) => ({
  id: planRow.id,
  month: planRow.month_key,
  cycleStart: normalizeDate(planRow.cycle_start),
  cycleEnd: normalizeDate(planRow.cycle_end),
  locked: Boolean(planRow.locked),
  currency: planRow.currency,
  savingsTarget: fromDbAmount(planRow.savings_target_cents),
  budgets,
});

const mapExpenseRow = (row) => ({
  id: row.id,
  label: row.label,
  amount: fromDbAmount(row.amount_cents),
  type: row.entry_type,
  groupId: row.group_id,
  cashBookId: row.cash_book_id,
  date: normalizeDate(row.txn_date),
  note: row.note ?? '',
  tags: row.tags ?? [],
  createdAt: row.created_at?.toISOString() ?? new Date().toISOString(),
  planMonth: row.plan_month_key ?? undefined,
});

async function fetchPlans(client) {
  const { rows: planRows } = await runQuery(
    client,
    'SELECT * FROM monthly_plans ORDER BY month_key DESC',
  );
  if (!planRows.length) {
    return [];
  }
  const { rows: budgetRows } = await runQuery(
    client,
    'SELECT * FROM monthly_plan_budgets WHERE plan_id = ANY($1)',
    [planRows.map((plan) => plan.id)],
  );
  const budgetsByPlan = budgetRows.reduce((acc, row) => {
    acc[row.plan_id] = acc[row.plan_id] ?? [];
    acc[row.plan_id].push(mapBudgetRow(row));
    return acc;
  }, {});
  return planRows.map((plan) => mapPlanRow(plan, budgetsByPlan[plan.id] ?? []));
}

async function getCashBooks() {
  const { rows } = await runQuery(
    null,
    `SELECT cb.*,
            last.txn_date AS last_activity_date,
            last.label AS last_activity_label,
            last.amount_cents AS last_activity_amount_cents
     FROM cash_books cb
     LEFT JOIN LATERAL (
       SELECT e.txn_date, e.label, e.amount_cents
       FROM expenses e
       WHERE e.cash_book_id = cb.id
       ORDER BY e.txn_date DESC, e.created_at DESC
       LIMIT 1
     ) last ON true
     ORDER BY cb.created_at DESC`,
  );
  return rows.map(mapCashBookRow);
}

async function getExpenseGroups() {
  const { rows } = await runQuery(null, 'SELECT * FROM expense_groups ORDER BY created_at DESC');
  return rows.map(mapExpenseGroupRow);
}

async function getMonthlyPlans() {
  return fetchPlans(null);
}

async function getMonthlyPlanById(id) {
  if (!id) return null;
  const plans = await fetchPlans(null);
  return plans.find((plan) => plan.id === id) ?? null;
}

async function getCurrentPlan() {
  const plans = await fetchPlans(null);
  if (!plans.length) {
    return null;
  }
  const todayKey = new Date().toISOString().slice(0, 10);
  const currentMonth = todayKey.slice(0, 7);
  const activeCycle = plans.find((plan) => {
    const start = plan.cycleStart || `${plan.month}-01`;
    const end = plan.cycleEnd || endOfMonth(plan.month);
    return isWithinRange(todayKey, start, end);
  });
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
  const plans = await fetchPlans(null);
  const currentPlan = await getCurrentPlan();
  if (!currentPlan) {
    return plans;
  }
  return plans.filter((plan) => plan.id !== currentPlan.id);
}

async function getExpenses(filters = {}) {
  const conditions = [];
  const params = [];
  if (filters.startDate) {
    params.push(filters.startDate);
    conditions.push(`txn_date >= $${params.length}`);
  }
  if (filters.endDate) {
    params.push(filters.endDate);
    conditions.push(`txn_date <= $${params.length}`);
  }
  if (filters.groupId) {
    params.push(filters.groupId);
    conditions.push(`group_id = $${params.length}`);
  }
  if (filters.cashBookId) {
    params.push(filters.cashBookId);
    conditions.push(`cash_book_id = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${filters.search.toLowerCase()}%`);
    const idx = params.length;
    conditions.push(
      `(LOWER(label) LIKE $${idx} OR LOWER(COALESCE(note, '')) LIKE $${idx} OR EXISTS (
        SELECT 1 FROM unnest(tags) tag WHERE LOWER(tag) LIKE $${idx}
      ))`,
    );
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await runQuery(
    null,
    `SELECT * FROM expenses ${whereClause} ORDER BY txn_date DESC, created_at DESC`,
    params,
  );
  return rows.map(mapExpenseRow);
}

async function getExpenseById(id) {
  if (!id) return null;
  const { rows } = await runQuery(null, 'SELECT * FROM expenses WHERE id = $1', [id]);
  return rows.length ? mapExpenseRow(rows[0]) : null;
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

async function findPlanForExpense(client, expenseDate, planMonthHint) {
  const plans = await fetchPlans(client);
  if (!plans.length) {
    return { plan: null, monthKey: planMonthHint || null };
  }
  if (planMonthHint) {
    const hintPlan = plans.find((plan) => plan.month === planMonthHint);
    if (hintPlan) {
      const matches =
        (!hintPlan.cycleStart && !hintPlan.cycleEnd) ||
        isWithinRange(
          expenseDate,
          hintPlan.cycleStart || `${hintPlan.month}-01`,
          hintPlan.cycleEnd || endOfMonth(hintPlan.month),
        );
      if (matches) {
        return { plan: hintPlan, monthKey: hintPlan.month };
      }
      return { plan: hintPlan, monthKey: hintPlan.month };
    }
  }
  const matchingPlan = plans.find((plan) =>
    isWithinRange(
      expenseDate,
      plan.cycleStart || `${plan.month}-01`,
      plan.cycleEnd || endOfMonth(plan.month),
    ),
  );
  if (matchingPlan) {
    return { plan: matchingPlan, monthKey: matchingPlan.month };
  }
  return { plan: plans[0], monthKey: plans[0]?.month ?? null };
}

async function adjustPlanActuals(client, groupId, deltaCents, planMonthKey) {
  if (!deltaCents || !planMonthKey) return null;
  const { rows } = await runQuery(
    client,
    'SELECT id FROM monthly_plans WHERE month_key = $1 LIMIT 1',
    [planMonthKey],
  );
  if (!rows.length) {
    return null;
  }
  const planId = rows[0].id;
  await runQuery(
    client,
    `INSERT INTO monthly_plan_budgets (plan_id, group_id, planned_cents, actual_cents)
     VALUES ($1, $2, 0, GREATEST($3, 0))
     ON CONFLICT (plan_id, group_id)
     DO UPDATE SET actual_cents = GREATEST(monthly_plan_budgets.actual_cents + $3, 0)`,
    [planId, groupId, deltaCents],
  );
  return planMonthKey;
}

async function adjustCashBookBalance(client, cashBookId, deltaCents) {
  if (!deltaCents) return;
  await runQuery(
    client,
    'UPDATE cash_books SET balance_cents = balance_cents - $1 WHERE id = $2',
    [deltaCents, cashBookId],
  );
}

async function createExpense(payload) {
  return withTransaction(async (client) => {
    const amountCents = toDbAmount(payload.amount);
    const { plan, monthKey } = await findPlanForExpense(client, payload.date, payload.planMonth);
    const { rows } = await runQuery(
      client,
      `INSERT INTO expenses
         (label, amount_cents, entry_type, group_id, cash_book_id, txn_date, note, tags, plan_month_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        payload.label,
        amountCents,
        payload.type ?? 'expense',
        payload.groupId,
        payload.cashBookId,
        payload.date,
        payload.note ?? null,
        payload.tags ?? [],
        monthKey ?? null,
      ],
    );
    const expenseRow = rows[0];
    await adjustPlanActuals(client, payload.groupId, amountCents, plan?.month ?? monthKey);
    await adjustCashBookBalance(client, payload.cashBookId, amountCents);
    return mapExpenseRow(expenseRow);
  });
}

async function updateExpense(id, payload = {}) {
  if (!id) {
    throw new Error('Expense id is required');
  }
  return withTransaction(async (client) => {
    const existingResult = await runQuery(client, 'SELECT * FROM expenses WHERE id = $1', [id]);
    if (!existingResult.rows.length) {
      throw new Error('Expense not found');
    }
    const previous = existingResult.rows[0];
    const amountCents =
      payload.amount !== undefined ? toDbAmount(payload.amount) : Number(previous.amount_cents);
    const planHint = payload.planMonth ?? previous.plan_month_key;
    const { plan, monthKey } = await findPlanForExpense(
      client,
      payload.date ?? normalizeDate(previous.txn_date),
      planHint,
    );
    const { rows } = await runQuery(
      client,
      `UPDATE expenses
       SET label = $1,
           amount_cents = $2,
           group_id = $3,
           cash_book_id = $4,
           txn_date = $5,
           note = $6,
           tags = $7,
           plan_month_key = $8,
           updated_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [
        payload.label ?? previous.label,
        amountCents,
        payload.groupId ?? previous.group_id,
        payload.cashBookId ?? previous.cash_book_id,
        payload.date ?? normalizeDate(previous.txn_date),
        payload.note ?? previous.note ?? null,
        Array.isArray(payload.tags) ? payload.tags : previous.tags ?? [],
        plan?.month ?? monthKey ?? null,
        id,
      ],
    );
    const updated = rows[0];
    await adjustPlanActuals(client, previous.group_id, -Number(previous.amount_cents), previous.plan_month_key);
    await adjustPlanActuals(client, updated.group_id, amountCents, updated.plan_month_key);
    await adjustCashBookBalance(client, previous.cash_book_id, -Number(previous.amount_cents));
    await adjustCashBookBalance(client, updated.cash_book_id, amountCents);
    return mapExpenseRow(updated);
  });
}

async function deleteExpense(id) {
  if (!id) {
    throw new Error('Expense id is required');
  }
  return withTransaction(async (client) => {
    const { rows } = await runQuery(
      client,
      'DELETE FROM expenses WHERE id = $1 RETURNING *',
      [id],
    );
    if (!rows.length) {
      throw new Error('Expense not found');
    }
    const removed = rows[0];
    await adjustPlanActuals(client, removed.group_id, -Number(removed.amount_cents), removed.plan_month_key);
    await adjustCashBookBalance(client, removed.cash_book_id, -Number(removed.amount_cents));
    return mapExpenseRow(removed);
  });
}

async function createExpenseGroup(payload) {
  if (!payload?.name) {
    throw new Error('Expense group name is required');
  }
  const normalized = {
    id: payload.id,
    name: payload.name.trim(),
    description: payload.description?.trim() ?? '',
    color: payload.color ?? '#6C63FF',
    defaultMonthlyBudget: toDbAmount(payload.defaultMonthlyBudget ?? 0),
  };
  if (normalized.id) {
    const { rows } = await runQuery(
      null,
      `UPDATE expense_groups
       SET name = $1,
           description = $2,
           color = $3,
           default_monthly_budget_cents = $4,
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [normalized.name, normalized.description, normalized.color, normalized.defaultMonthlyBudget, normalized.id],
    );
    return mapExpenseGroupRow(rows[0]);
  }
  const { rows } = await runQuery(
    null,
    `INSERT INTO expense_groups (name, description, color, default_monthly_budget_cents)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [normalized.name, normalized.description, normalized.color, normalized.defaultMonthlyBudget],
  );
  return mapExpenseGroupRow(rows[0]);
}

async function saveMonthlyPlan(payload) {
  if (!payload?.month) {
    throw new Error('Plan month is required');
  }
  return withTransaction(async (client) => {
    let planId = payload.id ?? null;
    if (planId) {
      await runQuery(
        client,
        `UPDATE monthly_plans
         SET month_key = $1,
             cycle_start = $2,
             cycle_end = $3,
             locked = $4,
             currency = $5,
             savings_target_cents = $6,
             updated_at = NOW()
         WHERE id = $7`,
        [
          payload.month,
          payload.cycleStart || null,
          payload.cycleEnd || null,
          Boolean(payload.locked),
          payload.currency || 'INR',
          toDbAmount(payload.savingsTarget ?? 0),
          planId,
        ],
      );
    } else {
      const { rows } = await runQuery(
        client,
        `INSERT INTO monthly_plans (month_key, cycle_start, cycle_end, locked, currency, savings_target_cents)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          payload.month,
          payload.cycleStart || null,
          payload.cycleEnd || null,
          Boolean(payload.locked),
          payload.currency || 'INR',
          toDbAmount(payload.savingsTarget ?? 0),
        ],
      );
      planId = rows[0].id;
    }

    const existingBudgetsResult = await runQuery(
      client,
      'SELECT group_id, actual_cents FROM monthly_plan_budgets WHERE plan_id = $1',
      [planId],
    );
    const existingActuals = existingBudgetsResult.rows.reduce((acc, row) => {
      acc[row.group_id] = Number(row.actual_cents);
      return acc;
    }, {});

    const normalizedBudgets = (payload.budgets ?? []).map((budget) => ({
      groupId: budget.groupId,
      planned: toDbAmount(budget.planned ?? 0),
      actual: existingActuals[budget.groupId] ?? toDbAmount(budget.actual ?? 0),
    }));

    await Promise.all(
      normalizedBudgets.map((budget) =>
        runQuery(
          client,
          `INSERT INTO monthly_plan_budgets (plan_id, group_id, planned_cents, actual_cents)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (plan_id, group_id)
           DO UPDATE SET planned_cents = $3`,
          [planId, budget.groupId, budget.planned, budget.actual],
        ),
      ),
    );

    const keepGroupIds = normalizedBudgets.map((budget) => budget.groupId);
    if (keepGroupIds.length) {
      await runQuery(
        client,
        `DELETE FROM monthly_plan_budgets
         WHERE plan_id = $1 AND NOT (group_id = ANY($2::uuid[]))`,
        [planId, keepGroupIds],
      );
    } else {
      await runQuery(client, 'DELETE FROM monthly_plan_budgets WHERE plan_id = $1', [planId]);
    }

    const plan = await getMonthlyPlanById(planId);
    return plan;
  });
}

async function saveCashBook(payload) {
  if (!payload?.name) {
    throw new Error('Cash book name is required');
  }
  const normalized = {
    id: payload.id,
    name: payload.name.trim(),
    type: payload.type ?? 'bank',
    accountNumber: payload.accountNumber ?? '',
    balance: toDbAmount(payload.balance ?? 0),
    currency: payload.currency ?? 'INR',
    notes: payload.notes ?? '',
  };
  if (normalized.id) {
    const { rows } = await runQuery(
      null,
      `UPDATE cash_books
       SET name = $1,
           type = $2,
           account_number = $3,
           balance_cents = $4,
           currency = $5,
           notes = $6,
           updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [
        normalized.name,
        normalized.type,
        normalized.accountNumber,
        normalized.balance,
        normalized.currency,
        normalized.notes,
        normalized.id,
      ],
    );
    return mapCashBookRow(rows[0]);
  }
  const { rows } = await runQuery(
    null,
    `INSERT INTO cash_books (name, type, account_number, balance_cents, currency, notes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      normalized.name,
      normalized.type,
      normalized.accountNumber,
      normalized.balance,
      normalized.currency,
      normalized.notes,
    ],
  );
  return mapCashBookRow(rows[0]);
}

async function resetData() {
  await withTransaction(async (client) => {
    await runQuery(client, 'TRUNCATE expenses, monthly_plan_budgets, monthly_plans, expense_groups, cash_books RESTART IDENTITY');
  });
}

async function exportData() {
  const [cashBooks, expenseGroups, monthlyPlans, expenses] = await Promise.all([
    getCashBooks(),
    getExpenseGroups(),
    getMonthlyPlans(),
    getExpenses(),
  ]);
  return {
    cashBooks,
    expenseGroups,
    monthlyPlans,
    expenses,
  };
}

async function importData(datasets = {}) {
  const {
    cashBooks = [],
    expenseGroups = [],
    monthlyPlans = [],
    expenses = [],
  } = datasets;
  await withTransaction(async (client) => {
    await runQuery(client, 'TRUNCATE expenses, monthly_plan_budgets, monthly_plans, expense_groups, cash_books RESTART IDENTITY');

    await Promise.all(
      cashBooks.map((book) =>
        runQuery(
          client,
          `INSERT INTO cash_books (id, name, type, account_number, balance_cents, currency, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            book.id,
            book.name,
            book.type ?? 'bank',
            book.accountNumber ?? '',
            toDbAmount(book.balance ?? 0),
            book.currency ?? 'INR',
            book.notes ?? '',
          ],
        ),
      ),
    );

    await Promise.all(
      expenseGroups.map((group) =>
        runQuery(
          client,
          `INSERT INTO expense_groups (id, name, description, color, default_monthly_budget_cents)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            group.id,
            group.name,
            group.description ?? '',
            group.color ?? '#6C63FF',
            toDbAmount(group.defaultMonthlyBudget ?? 0),
          ],
        ),
      ),
    );

    for (const plan of monthlyPlans) {
      await runQuery(
        client,
        `INSERT INTO monthly_plans (id, month_key, cycle_start, cycle_end, locked, currency, savings_target_cents)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          plan.id,
          plan.month,
          plan.cycleStart || null,
          plan.cycleEnd || null,
          Boolean(plan.locked),
          plan.currency ?? 'INR',
          toDbAmount(plan.savingsTarget ?? 0),
        ],
      );
      for (const budget of plan.budgets ?? []) {
        await runQuery(
          client,
          `INSERT INTO monthly_plan_budgets (plan_id, group_id, planned_cents, actual_cents)
           VALUES ($1, $2, $3, $4)`,
          [
            plan.id,
            budget.groupId,
            toDbAmount(budget.planned ?? 0),
            toDbAmount(budget.actual ?? 0),
          ],
        );
      }
    }

    await Promise.all(
      expenses.map((expense) =>
        runQuery(
          client,
          `INSERT INTO expenses
             (id, label, amount_cents, entry_type, group_id, cash_book_id, txn_date, note, tags, plan_month_key, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            expense.id,
            expense.label,
            toDbAmount(expense.amount ?? 0),
            expense.type ?? 'expense',
            expense.groupId,
            expense.cashBookId,
            expense.date,
            expense.note ?? '',
            expense.tags ?? [],
            expense.planMonth ?? null,
            expense.createdAt ? new Date(expense.createdAt) : new Date(),
            expense.createdAt ? new Date(expense.createdAt) : new Date(),
          ],
        ),
      ),
    );
  });
  return {
    cashBooks: cashBooks.length,
    expenseGroups: expenseGroups.length,
    monthlyPlans: monthlyPlans.length,
    expenses: expenses.length,
  };
}

module.exports = {
  getCashBooks,
  getExpenseGroups,
  getExpenseGroupById: async (id) => {
    if (!id) return null;
    const { rows } = await runQuery(null, 'SELECT * FROM expense_groups WHERE id = $1', [id]);
    return rows.length ? mapExpenseGroupRow(rows[0]) : null;
  },
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
  importData,
};
