import { FC, useEffect, useMemo, useState } from 'react';
import { getCashBooks, getSummary } from '../api/budget';
import type { CashBook, Summary } from '../api/types';
import { formatCurrency } from '../utils/currency';

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

const formatActivity = (activity?: CashBook['lastActivity']) => {
  if (!activity) return 'No recent activity';
  const date = new Date(`${activity.date}T00:00:00`);
  const dateLabel = Number.isNaN(date.getTime())
    ? activity.date
    : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
  return `${activity.label} · ${dateLabel}`;
};

const DashboardPage: FC = () => {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [cashBooks, setCashBooks] = useState<CashBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const [summaryResponse, cashBookResponse] = await Promise.all([getSummary(), getCashBooks()]);
        if (!mounted) return;
        setSummary(summaryResponse);
        setCashBooks(cashBookResponse);
        setError(null);
      } catch (err) {
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
  }, []);

  const totals = summary?.totals ?? { planned: 0, actual: 0, expenses: 0, cashOnHand: 0 };
  const remainingBudget = Math.max(0, totals.planned - totals.expenses);
  const progress = totals.planned > 0 ? Math.min(Math.round((totals.expenses / totals.planned) * 100), 100) : 0;

  const monthLabel =
    summary && summary.cycle.month ? formatMonthLabel(summary.cycle.month) : 'Welcome to Home Budget';

  const summaryMetrics = useMemo(() => {
    if (!summary) {
      return { dailyBurn: 0, daysRemaining: 0, cycleLength: 'Not set' };
    }

    if (!summary.cycle.range.start || !summary.cycle.range.end) {
      return { dailyBurn: 0, daysRemaining: 0, cycleLength: 'Not set' };
    }

    const start = new Date(`${summary.cycle.range.start}T00:00:00`);
    const end = new Date(`${summary.cycle.range.end}T00:00:00`);
    const today = new Date();

    const dayMs = 24 * 60 * 60 * 1000;
    const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / dayMs) + 1);
    const elapsed = Math.min(
      totalDays,
      Math.max(1, Math.round((today.setHours(0, 0, 0, 0) - start.getTime()) / dayMs) + 1),
    );
    const remaining = Math.max(0, Math.round((end.getTime() - today.setHours(0, 0, 0, 0)) / dayMs));

    return {
      dailyBurn: totals.expenses / elapsed,
      daysRemaining: remaining,
      cycleLength: formatRange(summary.cycle.range.start, summary.cycle.range.end),
    };
  }, [summary, totals.expenses]);

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

  if (!summary) {
    return null;
  }

  return (
    <div className="page">
      <section className="card">
        <header className="card-header">
          <h2 className="card-title">At a glance</h2>
          <span className="badge">{monthLabel}</span>
        </header>
        <div className="metric-grid">
          <div className="metric">
            <span className="metric-label">Planned spend</span>
            <span className="metric-value">{formatCurrency(totals.planned)}</span>
          </div>
          <div className="metric">
            <span className="metric-label">Actual spend</span>
            <span className="metric-value metric-value-negative">{formatCurrency(totals.expenses)}</span>
          </div>
          <div className="metric">
            <span className="metric-label">Cash on hand</span>
            <span className="metric-value metric-value-positive">{formatCurrency(totals.cashOnHand)}</span>
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
            <strong>{formatCurrency(summaryMetrics.dailyBurn, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
          </li>
          <li>
            <span>Savings target</span>
            <strong>{formatCurrency(summary.cycle.savingsTarget ?? 0)}</strong>
          </li>
        </ul>
      </section>

      <section className="card">
        <header className="card-header">
          <h2 className="card-title">Cash books</h2>
          <span className="badge badge-soft">
            Total{' '}
            {formatCurrency(cashBooks.reduce((sum, book) => sum + book.balance, 0), {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
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
        {summary.topExpenseGroups.length ? (
          <div className="stacked-list">
            {summary.topExpenseGroups.map((group) => (
              <article key={group.groupId} className="stacked-item">
                <div>
                  <p className="item-title">{group.name}</p>
                  <p className="item-subtitle">This month</p>
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
          {summary.quickLinks.map((link) => (
            <a key={link.id} className="quick-action" href={link.href}>
              <span className="quick-action-label">{link.label}</span>
              <span className="quick-action-description">Open {link.href}</span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
};

export default DashboardPage;
