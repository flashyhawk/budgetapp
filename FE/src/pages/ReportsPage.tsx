import { FC, useEffect, useMemo, useState } from 'react';
import { getCashBooks, getExpenseGroups, getExpenses, getMonthlyPlans } from '../api/budget';
import type { CashBook, Expense, ExpenseGroup, MonthlyPlan } from '../api/types';
import { formatCurrency } from '../utils/currency';

const formatMonthLabel = (month: string) => {
  const date = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) return month;
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

const isDateWithinCycle = (date: string, start?: string, end?: string, fallbackMonth?: string) => {
  const resolvedStart = start || (fallbackMonth ? `${fallbackMonth}-01` : '');
  const resolvedEnd = end || (fallbackMonth ? endOfMonth(fallbackMonth) : '');
  if (!resolvedStart || !resolvedEnd) return false;
  return resolvedStart <= date && date <= resolvedEnd;
};

const monthsBack = (month: string, count: number) => {
  const [year, monthIndex] = month.split('-').map(Number);
  if (!year || !monthIndex) return month;
  const date = new Date(year, monthIndex - 1, 1);
  date.setMonth(date.getMonth() - count);
  return date.toISOString().slice(0, 7);
};

const ReportsPage: FC = () => {
  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const todayMonthKey = useMemo(() => todayKey.slice(0, 7), [todayKey]);

  const [groups, setGroups] = useState<ExpenseGroup[]>([]);
  const [cashBooks, setCashBooks] = useState<CashBook[]>([]);
  const [plans, setPlans] = useState<MonthlyPlan[]>([]);
  const [selectedPlanIndex, setSelectedPlanIndex] = useState<number>(-1);

  const [planExpenses, setPlanExpenses] = useState<Expense[]>([]);
  const [trendExpenses, setTrendExpenses] = useState<Expense[]>([]);

  const [trendGroupId, setTrendGroupId] = useState<string>('all');

  const [loading, setLoading] = useState(true);
  const [planLoading, setPlanLoading] = useState(false);
  const [trendLoading, setTrendLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [trendError, setTrendError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const [groupResponse, planResponse, cashBookResponse] = await Promise.all([
          getExpenseGroups(),
          getMonthlyPlans(),
          getCashBooks(),
        ]);
        if (!mounted) return;

        const orderedPlans = [...planResponse].sort((a, b) => (a.month < b.month ? 1 : -1));

        setGroups(groupResponse);
        setPlans(orderedPlans);
        setCashBooks(cashBookResponse);

        const inCycleIndex = orderedPlans.findIndex((plan) =>
          isDateWithinCycle(todayKey, plan.cycleStart, plan.cycleEnd, plan.month),
        );
        const sameMonthIndex = orderedPlans.findIndex((plan) => plan.month === todayMonthKey);
        const initialIndex =
          inCycleIndex !== -1 ? inCycleIndex : sameMonthIndex !== -1 ? sameMonthIndex : orderedPlans.length ? 0 : -1;
        setSelectedPlanIndex(initialIndex);
        setTrendGroupId('all');
        setError(null);
      } catch (_err) {
        if (!mounted) return;
        setError('Unable to load reports. Please try again later.');
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [todayKey, todayMonthKey]);

  const selectedPlan = selectedPlanIndex >= 0 ? plans[selectedPlanIndex] : null;
  const groupMap = useMemo(
    () =>
      groups.reduce<Record<string, ExpenseGroup>>((acc, group) => {
        acc[group.id] = group;
        return acc;
      }, {}),
    [groups],
  );
  const cashOnHand = useMemo(
    () => cashBooks.reduce((sum, book) => sum + Number(book.balance || 0), 0),
    [cashBooks],
  );
  const cashBookBalances = useMemo(
    () =>
      cashBooks
        .map((book) => ({
          id: book.id,
          name: book.name,
          balance: Number(book.balance || 0),
          type: book.type ?? '',
        }))
        .sort((a, b) => b.balance - a.balance),
    [cashBooks],
  );

  useEffect(() => {
    if (!selectedPlan) {
      setPlanExpenses([]);
      setPlanError(null);
      return;
    }

    let cancelled = false;
    const start = selectedPlan.cycleStart || `${selectedPlan.month}-01`;
    const end = selectedPlan.cycleEnd || endOfMonth(selectedPlan.month);

    setPlanLoading(true);
    setPlanError(null);

    (async () => {
      try {
        const expenses = await getExpenses({ startDate: start, endDate: end });
        if (cancelled) return;
        setPlanExpenses(expenses);
      } catch (_err) {
        if (!cancelled) {
          setPlanExpenses([]);
          setPlanError('Unable to load expenses for this plan.');
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
  }, [selectedPlan]);

  useEffect(() => {
    if (!selectedPlan) {
      setTrendExpenses([]);
      setTrendError(null);
      return;
    }

    let cancelled = false;

    const rangeEnd = endOfMonth(selectedPlan.month);
    const rangeStart = monthsBack(selectedPlan.month, 5);
    const rangeStartDate = `${rangeStart}-01`;

    setTrendLoading(true);
    setTrendError(null);

    (async () => {
      try {
        const expenses = await getExpenses({ startDate: rangeStartDate, endDate: rangeEnd });
        if (cancelled) return;
        setTrendExpenses(expenses);
      } catch (_err) {
        if (!cancelled) {
          setTrendExpenses([]);
          setTrendError('Unable to load trend data.');
        }
      } finally {
        if (!cancelled) {
          setTrendLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedPlan]);

  const availableTrendGroups = useMemo(() => {
    const allOption = [{ id: 'all', name: 'All groups' }];
    if (!groups.length) return allOption;
    return allOption.concat(groups);
  }, [groups]);

  useEffect(() => {
    if (!availableTrendGroups.some((group) => group.id === trendGroupId)) {
      setTrendGroupId('all');
    }
  }, [availableTrendGroups, trendGroupId]);

  const pieSegments = useMemo(() => {
    if (!planExpenses.length) return [];
    const totals = planExpenses.reduce<Record<string, number>>((acc, expense) => {
      acc[expense.groupId] = (acc[expense.groupId] ?? 0) + expense.amount;
      return acc;
    }, {});

    const entries = Object.entries(totals)
      .map(([groupId, amount]) => ({
        groupId,
        amount,
        color: groupMap[groupId]?.color ?? '#4C6FFF',
        label: groupMap[groupId]?.name ?? groupId,
      }))
      .sort((a, b) => b.amount - a.amount);

    const grandTotal = entries.reduce((sum, entry) => sum + entry.amount, 0);
    if (grandTotal === 0) {
      return entries.map((entry) => ({ ...entry, percentage: 0, offset: 0 }));
    }

    let cumulative = 0;
    return entries.map((entry) => {
      const percentage = (entry.amount / grandTotal) * 100;
      const segment = {
        ...entry,
        percentage,
        offset: cumulative,
      };
      cumulative += percentage;
      return segment;
    });
  }, [groupMap, planExpenses]);

  const trendMonths = useMemo(() => {
    if (!selectedPlan) return [];
    const months: string[] = [];
    for (let index = 5; index >= 0; index -= 1) {
      months.push(monthsBack(selectedPlan.month, index));
    }
    return months;
  }, [selectedPlan]);

  const trendSeries = useMemo(() => {
    if (!trendMonths.length) return { months: [], values: [] as number[] };
    const totals = trendExpenses.reduce<Record<string, number>>((acc, expense) => {
      const monthKey = expense.date.slice(0, 7);
      const matchesGroup = trendGroupId === 'all' || expense.groupId === trendGroupId;
      if (!matchesGroup) return acc;
      if (!trendMonths.includes(monthKey)) return acc;
      acc[monthKey] = (acc[monthKey] ?? 0) + expense.amount;
      return acc;
    }, {});

    const values = trendMonths.map((month) => totals[month] ?? 0);
    return { months: trendMonths, values };
  }, [trendExpenses, trendGroupId, trendMonths]);

  const trendChartPoints = useMemo(() => {
    const { values } = trendSeries;
    if (!values.length) return '';
    const maxValue = Math.max(...values, 1);
    if (values.every((value) => value === 0)) {
      return values
        .map((_, index) => {
          const x = (index / Math.max(values.length - 1, 1)) * 100;
          return `${x},100`;
        })
        .join(' ');
    }
    return values
      .map((value, index) => {
        const x = (index / Math.max(values.length - 1, 1)) * 100;
        const y = 100 - (value / maxValue) * 100;
        return `${x},${y}`;
      })
      .join(' ');
  }, [trendSeries]);

  const trendMaxValue = useMemo(() => {
    const { values } = trendSeries;
    if (!values.length) return 0;
    return Math.max(...values);
  }, [trendSeries]);

  const actualsByGroup = useMemo(() => {
    return planExpenses.reduce<Record<string, number>>((acc, expense) => {
      acc[expense.groupId] = (acc[expense.groupId] ?? 0) + expense.amount;
      return acc;
    }, {});
  }, [planExpenses]);

  const progressRows = useMemo(() => {
    if (!selectedPlan) return [];
    return selectedPlan.budgets.map((budget) => {
      const planned = budget.planned ?? 0;
      const actual = actualsByGroup[budget.groupId] ?? budget.actual ?? 0;
      const consumed = Math.min(actual, planned);
      const overAmount = actual > planned ? actual - planned : 0;
      const baseTotal =
        actual > planned ? actual : planned > 0 ? planned : actual > 0 ? actual : 0;
      const percentage =
        baseTotal > 0 ? Math.min((consumed / baseTotal) * 100, 100) : 0;
      const overPercentage =
        baseTotal > 0 ? Math.min((overAmount / baseTotal) * 100, 100 - percentage) : 0;
      return {
        groupId: budget.groupId,
        planned,
        actual,
        percentage,
        overPercentage,
        overAmount,
        name: groupMap[budget.groupId]?.name ?? budget.groupId,
      };
    });
  }, [actualsByGroup, groupMap, selectedPlan]);
  const remainingNeeds = useMemo(() => {
    if (!selectedPlan) return [];
    return selectedPlan.budgets
      .map((budget) => {
        const planned = budget.planned ?? 0;
        const actual = actualsByGroup[budget.groupId] ?? budget.actual ?? 0;
        const remaining = planned - actual;
        return {
          groupId: budget.groupId,
          planned,
          actual,
          remaining,
          name: groupMap[budget.groupId]?.name ?? budget.groupId,
        };
      })
      .filter((row) => row.remaining > 0)
      .sort((a, b) => b.remaining - a.remaining);
  }, [actualsByGroup, groupMap, selectedPlan]);
  const totalRemainingNeed = useMemo(
    () => remainingNeeds.reduce((sum, row) => sum + row.remaining, 0),
    [remainingNeeds],
  );
  const balanceAfterNeeds = useMemo(() => cashOnHand - totalRemainingNeed, [cashOnHand, totalRemainingNeed]);

  const canGoPrev = selectedPlanIndex >= 0 && selectedPlanIndex < plans.length - 1;
  const canGoNext = selectedPlanIndex > 0;

  const goPrevPlan = () => {
    if (canGoPrev) {
      setSelectedPlanIndex(selectedPlanIndex + 1);
    }
  };

  const goNextPlan = () => {
    if (canGoNext) {
      setSelectedPlanIndex(selectedPlanIndex - 1);
    }
  };

  return (
    <div className="page">
      {loading ? (
        <section className="card">
          <header className="card-header">
            <h2 className="card-title">Reports</h2>
          </header>
          <p className="card-subtitle">Loading report data…</p>
        </section>
      ) : error ? (
        <section className="card">
          <header className="card-header">
            <h2 className="card-title">Reports</h2>
          </header>
          <p className="card-subtitle">{error}</p>
        </section>
      ) : (
        <>
          <section className="card reports-plan-card">
            <header className="card-header">
              <h2 className="card-title">Monthly planner</h2>
              <div className="plan-nav">
                <button
                  className="plan-nav-button"
                  type="button"
                  onClick={goPrevPlan}
                  disabled={!canGoPrev}
                  aria-label="View previous plan"
                >
                  ‹
                </button>
                <span className="badge">{selectedPlan ? formatMonthLabel(selectedPlan.month) : 'No plan'}</span>
                <button
                  className="plan-nav-button"
                  type="button"
                  onClick={goNextPlan}
                  disabled={!canGoNext}
                  aria-label="View next plan"
                >
                  ›
                </button>
              </div>
            </header>
            {selectedPlan ? (
              <div className="reports-plan-meta">
                <div>
                  <span className="item-meta">Cycle</span>
                  <strong>{formatRange(selectedPlan.cycleStart || `${selectedPlan.month}-01`, selectedPlan.cycleEnd || endOfMonth(selectedPlan.month))}</strong>
                </div>
                <div>
                  <span className="item-meta">Savings target</span>
                  <strong>{formatCurrency(selectedPlan.savingsTarget ?? 0)}</strong>
                </div>
                <div>
                  <span className="item-meta">Status</span>
                  <strong>{selectedPlan.locked ? 'Locked' : 'Open'}</strong>
                </div>
              </div>
            ) : (
              <p className="card-subtitle">No monthly plans found. Create one to see reports.</p>
            )}
          </section>

          <section className="card">
            <header className="card-header">
              <h2 className="card-title">Spending breakdown</h2>
            </header>
            {planLoading ? (
              <p className="card-subtitle">Pulling expense data…</p>
            ) : planError ? (
              <p className="card-subtitle">{planError}</p>
            ) : pieSegments.length ? (
              <div className="report-pie">
                <div
                  className="report-pie-chart"
                  style={{
                    background:
                      pieSegments.length && pieSegments.some((segment) => segment.percentage > 0)
                        ? `conic-gradient(${pieSegments
                            .map((segment) => `${segment.color} ${segment.offset}% ${segment.offset + segment.percentage}%`)
                            .join(', ')})`
                        : '#f2f5ff',
                  }}
                >
                  <span className="report-pie-label">{formatCurrency(pieSegments.reduce((sum, segment) => sum + segment.amount, 0))}</span>
                </div>
                <ul className="report-pie-legend">
                  {pieSegments.map((segment) => (
                    <li key={segment.groupId}>
                      <span className="legend-dot" style={{ backgroundColor: segment.color }} />
                      <div>
                        <p className="item-title">{segment.label}</p>
                        <p className="item-meta">
                          {formatCurrency(segment.amount)} · {segment.percentage.toFixed(1)}%
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="card-subtitle">No expenses recorded for this plan yet.</p>
            )}
          </section>

          <section className="card">
            <header className="card-header">
              <h2 className="card-title">Expense trend</h2>
              <div className="trend-controls">
                <label className="trend-select-label">
                  <span>Group</span>
                  <select
                    className="form-input trend-select"
                    value={trendGroupId}
                    onChange={(event) => setTrendGroupId(event.target.value)}
                  >
                    {availableTrendGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </header>
            {trendLoading ? (
              <p className="card-subtitle">Loading trend data…</p>
            ) : trendError ? (
              <p className="card-subtitle">{trendError}</p>
            ) : trendSeries.values.length ? (
              <div className="report-line">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                  <polyline points={trendChartPoints} />
                  {trendSeries.values.map((value, index) => {
                    if (trendSeries.values.every((item) => item === 0)) {
                      const x = (index / Math.max(trendSeries.values.length - 1, 1)) * 100;
                      return <circle key={trendSeries.months[index]} cx={x} cy={100} r={1.4} />;
                    }
                    const maxValue = Math.max(...trendSeries.values, 1);
                    const x = (index / Math.max(trendSeries.values.length - 1, 1)) * 100;
                    const y = 100 - (value / maxValue) * 100;
                    return <circle key={trendSeries.months[index]} cx={x} cy={y} r={1.4} />;
                  })}
                </svg>
                <div className="report-line-meta">
                  <div>
                    <span className="item-meta">Total</span>
                    <strong>{formatCurrency(trendSeries.values.reduce((sum, value) => sum + value, 0))}</strong>
                  </div>
                  <div>
                    <span className="item-meta">Peak month</span>
                    <strong>
                      {trendMaxValue > 0
                        ? formatMonthLabel(
                            trendSeries.months[trendSeries.values.indexOf(trendMaxValue)] ?? trendSeries.months[0],
                          )
                        : '—'}
                    </strong>
                  </div>
                </div>
                <div className="report-line-axis">
                  {trendSeries.months.map((month) => (
                    <span key={month}>{formatMonthLabel(month)}</span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="card-subtitle">No expenses recorded in the last six months for this selection.</p>
            )}
          </section>

          <section className="card">
            <header className="card-header">
              <h2 className="card-title">Planned vs actual</h2>
            </header>
            {planLoading ? (
              <p className="card-subtitle">Refreshing plan data…</p>
            ) : !selectedPlan ? (
              <p className="card-subtitle">Create a monthly plan to compare budgets with spending.</p>
            ) : !progressRows.length ? (
              <p className="card-subtitle">No budget entries found for this plan.</p>
            ) : (
              <div className="report-progress-list">
                {progressRows.map((row) => (
                  <div key={row.groupId} className="report-progress-row">
                    <div className="report-progress-meta">
                      <p className="item-title">{row.name}</p>
                      <span className="item-meta">
                        Planned {formatCurrency(row.planned)} · Actual {formatCurrency(row.actual)}
                        {row.overAmount > 0 ? ` · Over by ${formatCurrency(row.overAmount)}` : ''}
                      </span>
                    </div>
                    <div className="report-progress-track">
                      <span className="report-progress-fill" style={{ width: `${Math.min(row.percentage, 100)}%` }} />
                      {row.overPercentage > 0 && (
                        <span
                          className="report-progress-over"
                          style={{
                            left: `${Math.min(row.percentage, 100)}%`,
                            width: `${row.overPercentage}%`,
                          }}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <header className="card-header">
              <h2 className="card-title">Remaining needs</h2>
            </header>
            {planLoading ? (
              <p className="card-subtitle">Calculating remaining budgets…</p>
            ) : !selectedPlan ? (
              <p className="card-subtitle">Select a monthly plan to see remaining amounts.</p>
            ) : remainingNeeds.length ? (
              <>
                <div className="stacked-list">
                  {remainingNeeds.map((row) => (
                    <article key={row.groupId} className="stacked-item">
                      <div>
                        <p className="item-title">{row.name}</p>
                        <p className="item-meta">
                          Planned {formatCurrency(row.planned)} · Actual {formatCurrency(row.actual)}
                        </p>
                      </div>
                      <div className="item-value">
                        <span>{formatCurrency(row.remaining)}</span>
                        <p className="item-meta">Needed</p>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="plan-summary">
                  <div className="plan-summary-item">
                    <span className="item-meta">Total still needed</span>
                    <span className="plan-summary-value">{formatCurrency(totalRemainingNeed)}</span>
                  </div>
                  <div className="plan-summary-item">
                    <span className="item-meta">Current cash available</span>
                    <span className="plan-summary-value">{formatCurrency(cashOnHand)}</span>
                  </div>
                  <div className="plan-summary-item">
                    <span className="item-meta">Balance after needs</span>
                    <span className="plan-summary-value">{formatCurrency(balanceAfterNeeds)}</span>
                  </div>
                </div>
                <div className="card">
                  <header className="card-header">
                    <h3 className="card-title">Cash books</h3>
                  </header>
                  {cashBookBalances.length ? (
                    <div className="stacked-list">
                      {cashBookBalances.map((book) => (
                        <article key={book.id} className="stacked-item">
                          <div>
                            <p className="item-title">{book.name}</p>
                            <p className="item-meta">{book.type || 'Account'}</p>
                          </div>
                          <div className="item-value">
                            <span>{formatCurrency(book.balance, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="card-subtitle">No cash books available yet.</p>
                  )}
                </div>
              </>
            ) : (
              <p className="card-subtitle">All groups have met or exceeded their planned amounts.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default ReportsPage;
