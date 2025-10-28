const express = require('express');
const cors = require('cors');
const {
  getCashBooks,
  getExpenseGroups,
  getExpenseGroupById,
  getMonthlyPlans,
  getMonthlyPlanById,
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
} = require('./services/budgetService');

const PORT = process.env.PORT || 4000;

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.get('/api/summary', async (_req, res, next) => {
  try {
    const summary = await getSummary();
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

app.get('/api/cash-books', async (_req, res, next) => {
  try {
    const cashBooks = await getCashBooks();
    res.json(cashBooks);
  } catch (error) {
    next(error);
  }
});

app.get('/api/expense-groups', async (_req, res, next) => {
  try {
    const expenseGroups = await getExpenseGroups();
    res.json(expenseGroups);
  } catch (error) {
    next(error);
  }
});

app.get('/api/expense-groups/:id', async (req, res, next) => {
  try {
    const group = await getExpenseGroupById(req.params.id);
    if (!group) {
      res.status(404).json({ error: 'Expense group not found' });
      return;
    }
    res.json(group);
  } catch (error) {
    next(error);
  }
});

app.get('/api/monthly-plans', async (_req, res, next) => {
  try {
    const plans = await getMonthlyPlans();
    res.json(plans);
  } catch (error) {
    next(error);
  }
});

app.get('/api/monthly-plans/current', async (_req, res, next) => {
  try {
    const plan = await getCurrentPlan();
    res.json(plan);
  } catch (error) {
    next(error);
  }
});

app.get('/api/monthly-plans/history', async (_req, res, next) => {
  try {
    const plans = await getPlanHistory();
    res.json(plans);
  } catch (error) {
    next(error);
  }
});

app.get('/api/monthly-plans/:id', async (req, res, next) => {
  try {
    const plan = await getMonthlyPlanById(req.params.id);
    if (!plan) {
      res.status(404).json({ error: 'Monthly plan not found' });
      return;
    }
    res.json(plan);
  } catch (error) {
    next(error);
  }
});

app.get('/api/expenses', async (req, res, next) => {
  try {
    const expenses = await getExpenses({
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      groupId: req.query.groupId,
      cashBookId: req.query.cashBookId,
      search: req.query.search,
    });
    res.json(expenses);
  } catch (error) {
    next(error);
  }
});

app.get('/api/expenses/:id', async (req, res, next) => {
  try {
    const expense = await getExpenseById(req.params.id);
    if (!expense) {
      res.status(404).json({ error: 'Expense not found' });
      return;
    }
    res.json(expense);
  } catch (error) {
    next(error);
  }
});

app.post('/api/expenses', async (req, res, next) => {
  try {
    const expense = await createExpense(req.body);
    res.status(201).json(expense);
  } catch (error) {
    next(error);
  }
});

app.put('/api/expenses/:id', async (req, res, next) => {
  try {
    const expense = await updateExpense(req.params.id, req.body);
    res.json(expense);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/expenses/:id', async (req, res, next) => {
  try {
    await deleteExpense(req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post('/api/expense-groups', async (req, res, next) => {
  try {
    const group = await createExpenseGroup(req.body);
    res.status(201).json(group);
  } catch (error) {
    next(error);
  }
});

app.post('/api/cash-books', async (req, res, next) => {
  try {
    const cashBook = await saveCashBook(req.body);
    res.status(201).json(cashBook);
  } catch (error) {
    next(error);
  }
});

app.post('/api/monthly-plans', async (req, res, next) => {
  try {
    const plan = await saveMonthlyPlan(req.body);
    res.status(201).json(plan);
  } catch (error) {
    next(error);
  }
});

app.put('/api/monthly-plans/:id', async (req, res, next) => {
  try {
    const plan = await saveMonthlyPlan({ ...req.body, id: req.params.id });
    res.json(plan);
  } catch (error) {
    next(error);
  }
});

app.post('/api/reset', async (_req, res, next) => {
  try {
    await resetData();
    res.json({ status: 'reset' });
  } catch (error) {
    next(error);
  }
});

app.get('/api/export', async (_req, res, next) => {
  try {
    const payload = await exportData();
    res.setHeader('Content-Disposition', 'attachment; filename="budget-data.json"');
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

// Simple report endpoint for planned vs actual budgets
app.get('/api/reports/planned-vs-actual', async (_req, res, next) => {
  try {
    const currentPlan = await getCurrentPlan();
    res.json(
      currentPlan.budgets.map((budget) => ({
        groupId: budget.groupId,
        planned: budget.planned,
        actual: budget.actual,
      })),
    );
  } catch (error) {
    next(error);
  }
});

app.use((err, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Budget API listening on http://localhost:${PORT}`);
});
