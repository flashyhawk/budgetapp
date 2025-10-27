import { FC, useEffect, useMemo, useState } from 'react';
import { getCashBooks, getMonthlyPlans, getExpenseGroups, getExpenses } from '../api/budget';
import type { CashBook, ExpenseGroup, MonthlyPlan } from '../api/types';
import { formatCurrency } from '../utils/currency';

const quickLinks = [
  { id: 'quick-add-expense', label: 'Add expense', description: 'Record a purchase in seconds', href: '/add-expense' },
  {
    id: 'quick-plan-budget',
    label: 'Plan budget',
    description: 'Create or edit this month\'s plan',
    href: '/monthly-planner',
  },
  { id: 'quick-view-reports', label: 'View reports', description: 'See spending trends and insights', href: '/reports' },
];

const formatMonthLabel = (month: string) => {
  const date = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return month;
  }
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(date);
};

const formatRange = (start: string, end: string) => {
  const formatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return `${start} – ${end}`;
  }
  return `${formatter.format(startDate)} – ${formatter.format(endDate)}`;
};

const endOfMonth = (month: string) => {
  const [year, monthIndex] = month.split('-').map(Number);
  if (!year || !monthIndex) return month;
  const date = new Date(year, monthIndex, 0);
  return date.toISOString().slice(0, 10);
};

const formatActivity = (activity?: CashBook['lastActivity']) => {
  if (!activity) return 'No recent activity';
  const date = new Date(`${activity.date}T00:00:00`);
  const dateLabel = Number.isNaN(date.getTime())
    ? activity.date
    : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
  return `${activity.label} · ${dateLabel}`;
};

const isDateWithinCycle = (date: string, start?: string, end?: string, fallbackMonth?: string) => {
  const resolvedStart = start || (fallbackMonth ? `${fallbackMonth}-01` : '');
  const resolvedEnd = end || (fallbackMonth ? endOfMonth(fallbackMonth) : '');
  if (!resolvedStart || !resolvedEnd) return false;
  return resolvedStart <= date && date <= resolvedEnd;
};

const DashboardPage: FC = () => {
  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const currentMonthKey = useMemo(() => todayKey.slice(0, 7), [todayKey]);
  const [cashBooks, setCashBooks] = useState<CashBook[]>([]);
  const [plans, setPlans] = useState<MonthlyPlan[]>([]);
  const [expenseGroups, setExpenseGroups] = useState<ExpenseGroup[]>([]);
  const [selectedPlanIndex, setSelectedPlanIndex] = useState<number>(-1);
  const [actuals, setActuals] = useState<{ total: number; byGroup: Record<string, number> }>({ total: 0, byGroup: {} });
  const [loading, setLoading] = useState(true);
  const [planLoading, setPlanLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const [cashBookResponse, planResponse, groupResponse] = await Promise.all([
          getCashBooks(),
          getMonthlyPlans(),
          getExpenseGroups(),
        ]);
        if (!mounted) return;

        const orderedPlans = [...planResponse].sort((a, b) => (a.month < b.month ? 1 : -1));
        setCashBooks(cashBookResponse);
        setExpenseGroups(groupResponse);
        setPlans(orderedPlans);

        const inCycleIndex = orderedPlans.findIndex((plan) =>
          isDateWithinCycle(todayKey, plan.cycleStart, plan.cycleEnd, plan.month),
        );
        const sameMonthIndex = orderedPlans.findIndex((plan) => plan.month === currentMonthKey);
        const initialIndex =
          inCycleIndex !== -1 ? inCycleIndex : sameMonthIndex !== -1 ? sameMonthIndex : orderedPlans.length ? 0 : -1;
        setSelectedPlanIndex(initialIndex);

        setError(null);
      } catch (_err) {
        if (!mounted) return;
        setError('Unable to load dashboard data. Please try again in a moment.');
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [currentMonthKey, todayKey]);

  useEffect(() => {
    if (!plans.length) {
      setSelectedPlanIndex(-1);
      return;
    }

    if (selectedPlanIndex === -1) {
      const inCycleIndex = plans.findIndex((plan) =>
        isDateWithinCycle(todayKey, plan.cycleStart, plan.cycleEnd, plan.month),
      );
      if (inCycleIndex !== -1) {
        setSelectedPlanIndex(inCycleIndex);
      }
    }
  }, [plans, selectedPlanIndex, todayKey]);

  const selectedPlan = selectedPlanIndex >= 0 ? plans[selectedPlanIndex] : null;
  const selectedMonth = selectedPlan?.month ?? currentMonthKey;
  const cycleStart = selectedPlan?.cycleStart || `${selectedMonth}-01`;
  const cycleEnd = selectedPlan?.cycleEnd || endOfMonth(selectedMonth);

  useEffect(() => {
    let cancelled = false;
    if (!cycleStart || !cycleEnd) {
      setActuals({ total: 0, byGroup: {} });
      return;
    }

    setPlanLoading(true);
    (async () => {
      try {
        const expenses = await getExpenses({ startDate: cycleStart, endDate: cycleEnd });
        if (cancelled) return;
        const totals: Record<string, number> = {};
        let total = 0;
        expenses.forEach((expense) => {
          totals[expense.groupId] = (totals[expense.groupId] ?? 0) + expense.amount;
          total += expense.amount;
        });
        setActuals({ total, byGroup: totals });
      } catch (_err) {
        if (!cancelled) {
          setActuals({ total: 0, byGroup: {} });
        }
      } finally {
        if (!cancelled) {
          setPlanLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cycleStart, cycleEnd]);

  const totalPlanned = selectedPlan
    ? selectedPlan.budgets.reduce((sum, budget) => sum + (budget.planned ?? 0), 0)
    : 0;
  const plannedAmount = totalPlanned;

  const totalActual = actuals.total;
  const remainingBudget = Math.max(0, plannedAmount - totalActual);
  const progress = plannedAmount > 0 ? Math.min(Math.round((totalActual / plannedAmount) * 100), 100) : 0;
  const cashOnHand = cashBooks.reduce((sum, book) => sum + Number(book.balance || 0), 0);
  const monthLabel = formatMonthLabel(selectedMonth);

  const summaryMetrics = useMemo(() => {
    if (!cycleStart || !cycleEnd) {
      return { dailyBurn: 0, daysRemaining: 0, cycleLength: 'Not set' };
    }
    const start = new Date(`${cycleStart}T00:00:00`);
    const end = new Date(`${cycleEnd}T00:00:00`);
    const today = new Date();
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return { dailyBurn: 0, daysRemaining: 0, cycleLength: 'Not set' };
    }
    const dayMs = 24 * 60 * 60 * 1000;
    const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / dayMs) + 1);
    const elapsed = Math.min(
      totalDays,
      Math.max(1, Math.round((today.setHours(0, 0, 0, 0) - start.getTime()) / dayMs) + 1),
    );
    const remaining = Math.max(0, Math.round((end.getTime() - today.setHours(0, 0, 0, 0)) / dayMs));
    return {
      dailyBurn: totalActual / elapsed,
      daysRemaining: remaining,
      cycleLength: formatRange(cycleStart, cycleEnd),
    };
  }, [cycleStart, cycleEnd, totalActual]);

  const groupMap = useMemo(() => {
    const map: Record<string, string> = {};
    expenseGroups.forEach((group) => {
      map[group.id] = group.name;
    });
    return map;
  }, [expenseGroups]);

  const topExpenseGroups = useMemo(() => {
    return Object.entries(actuals.byGroup)
      .map(([groupId, amount]) => ({
        groupId,
        name: groupMap[groupId] ?? groupId,
        amount,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3);
  }, [actuals.byGroup, groupMap]);

  const canGoPrev = selectedPlanIndex >= 0 && selectedPlanIndex < plans.length - 1;
  const canGoNext = (selectedPlanIndex > 0) || (selectedPlanIndex === -1 && plans.length > 0);

  const goPrevPlan = () => {
    if (selectedPlanIndex >= 0 && selectedPlanIndex < plans.length - 1) {
      setSelectedPlanIndex(selectedPlanIndex + 1);
    }
  };

  const goNextPlan = () => {
    if (selectedPlanIndex > 0) {
      setSelectedPlanIndex(selectedPlanIndex - 1);
    } else if (selectedPlanIndex === -1 && plans.length > 0) {
      setSelectedPlanIndex(0);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <section className="card">
          <header className="card-header">
            <h2 className="card-title">At a glance</h2>
          </header>
          <p className="card-subtitle">Loading dashboard data…</p>
        </section>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <section className="card">
          <header className="card-header">
            <h2 className="card-title">At a glance</h2>
          </header>
          <p className="card-subtitle">{error}</p>
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <section className="card">
        <header className="card-header">
          <h2 className="card-title">At a glance</h2>
          <div className="plan-nav">
            <button
              className="plan-nav-button"
              type="button"
              onClick={goPrevPlan}
              disabled={!canGoPrev}
              aria-label="View previous monthly plan"
            >
              ‹
            </button>
            <span className="badge">{monthLabel}</span>
            <button
              className="plan-nav-button"
              type="button"
              onClick={goNextPlan}
              disabled={!canGoNext}
              aria-label="View next monthly plan"
            >
              ›
            </button>
          </div>
        </header>
        <div className="metric-grid">
          <div className="metric">
            <span className="metric-label">Planned spend</span>
            <span className="metric-value">{formatCurrency(plannedAmount)}</span>
          </div>
          <div className="metric">
            <span className="metric-label">Actual spend</span>
            <span className="metric-value metric-value-negative">{formatCurrency(totalActual)}</span>
          </div>
          <div className="metric">
            <span className="metric-label">Cash on hand</span>
            <span className="metric-value metric-value-positive">{formatCurrency(cashOnHand)}</span>
          </div>
        </div>
        <div className="progress-card">
          <div className="progress-meta">
            <strong>{progress}% of plan used</strong>
            <span>{formatCurrency(remainingBudget)} left</span>
          </div>
          <div className="progress-track">
            <span className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
        {planLoading && <p className="card-subtitle">Refreshing plan data…</p>}
      </section>

      <section className="card">
        <header className="card-header">
          <h2 className="card-title">Current month summary</h2>
        </header>
        <ul className="info-list">
          <li>
            <span>Cycle</span>
            <strong>{summaryMetrics.cycleLength}</strong>
          </li>
          <li>
            <span>Remaining days</span>
            <strong>{summaryMetrics.daysRemaining} days</strong>
          </li>
          <li>
            <span>Daily burn (avg)</span>
            <strong>
              {formatCurrency(summaryMetrics.dailyBurn, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </strong>
          </li>
          <li>
            <span>Savings target</span>
            <strong>{formatCurrency(selectedPlan?.savingsTarget ?? 0)}</strong>
          </li>
        </ul>
      </section>

      <section className="card">
        <header className="card-header">
          <h2 className="card-title">Cash books</h2>
          <span className="badge badge-soft">
            Total {formatCurrency(cashOnHand, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </header>
        {cashBooks.length ? (
          <div className="stacked-list">
            {cashBooks.map((account) => (
              <article key={account.id} className="stacked-item">
                <div>
                  <p className="item-title">{account.name}</p>
                  <p className="item-subtitle">{account.type}</p>
                  <p className="item-meta">{formatActivity(account.lastActivity)}</p>
                </div>
                <span className="item-value">
                  {formatCurrency(account.balance, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </article>
            ))}
          </div>
        ) : (
          <p className="card-subtitle">No cash books yet. Add your accounts to see balances here.</p>
        )}
      </section>

      <section className="card">
        <header className="card-header">
          <h2 className="card-title">Top expense groups</h2>
        </header>
        {planLoading ? (
          <p className="card-subtitle">Loading plan data…</p>
        ) : topExpenseGroups.length ? (
          <div className="stacked-list">
            {topExpenseGroups.map((group) => (
              <article key={group.groupId} className="stacked-item">
                <div>
                  <p className="item-title">{group.name}</p>
                  <p className="item-subtitle">Actual spend</p>
                </div>
                <div className="item-value">
                  <span>{formatCurrency(group.amount)}</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="card-subtitle">Expense insights will appear once you add your first expenses.</p>
        )}
      </section>

      <section className="card">
        <header className="card-header">
          <h2 className="card-title">Quick links</h2>
        </header>
        <div className="quick-actions">
          {quickLinks.map((link) => (
            <a key={link.id} className="quick-action" href={link.href}>
              <span className="quick-action-label">{link.label}</span>
              <span className="quick-action-description">{link.description}</span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
};

export default DashboardPage;
