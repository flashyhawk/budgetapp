import { FC, FormEvent, useEffect, useMemo, useState } from 'react';
import { createMonthlyPlan, getExpenseGroups, getMonthlyPlans, updateMonthlyPlan, getExpenses } from '../api/budget';
import type { ExpenseGroup, MonthlyPlan } from '../api/types';
import { formatCurrency } from '../utils/currency';

const monthLabel = (month: string) => {
  if (!month) return 'New plan';
  const date = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) return month;
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(date);
};

const endOfMonth = (month: string) => {
  const [year, monthIndex] = month.split('-').map(Number);
  if (!year || !monthIndex) return month;
  const date = new Date(year, monthIndex, 0);
  return date.toISOString().slice(0, 10);
};

const MonthlyPlannerPage: FC = () => {
  const [groups, setGroups] = useState<ExpenseGroup[]>([]);
  const [plans, setPlans] = useState<MonthlyPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | 'new' | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<MonthlyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formStatus, setFormStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [form, setForm] = useState({
    month: new Date().toISOString().slice(0, 7),
    cycleStart: '',
    cycleEnd: '',
    savingsTarget: '',
    locked: false,
    currency: 'INR',
    budgets: {} as Record<string, string>,
  });
  const [actuals, setActuals] = useState<{ total: number; byGroup: Record<string, number> }>({ total: 0, byGroup: {} });

  const computeBudgetInputs = (plan: MonthlyPlan | null, sourceGroups: ExpenseGroup[]) => {
    const budgetInputs: Record<string, string> = {};
    sourceGroups.forEach((group) => {
      const entry = plan?.budgets.find((item) => item.groupId === group.id);
      budgetInputs[group.id] = entry ? String(entry.planned ?? 0) : '';
    });
    return budgetInputs;
  };

  useEffect(() => {
    const currentMonthKey = new Date().toISOString().slice(0, 7);
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const [groupResponse, planResponse] = await Promise.all([getExpenseGroups(), getMonthlyPlans()]);
        if (!mounted) return;
        const orderedPlans = [...planResponse].sort((a, b) => (a.month < b.month ? 1 : -1));
        setGroups(groupResponse);
        setPlans(orderedPlans);
        setError(null);

        if (orderedPlans.length) {
          const defaultPlan =
            orderedPlans.find((plan) => plan.month === currentMonthKey) ?? orderedPlans[0];
          const plan = defaultPlan ?? null;
          setSelectedPlanId(plan.id);
          setSelectedPlan(plan);
          setForm({
            month: plan.month ?? '',
            cycleStart: plan.cycleStart ?? '',
            cycleEnd: plan.cycleEnd ?? '',
            savingsTarget: plan.savingsTarget ? String(plan.savingsTarget) : '',
            locked: plan.locked ?? false,
            currency: plan.currency ?? 'INR',
            budgets: computeBudgetInputs(plan, groupResponse),
          });
        } else {
          setSelectedPlanId('new');
          setSelectedPlan(null);
          setForm({
            month: currentMonthKey,
            cycleStart: '',
            cycleEnd: '',
            savingsTarget: '',
            locked: false,
            currency: 'INR',
            budgets: computeBudgetInputs(null, groupResponse),
          });
        }
      } catch (_err) {
        setError('Unable to load planner data.');
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

  useEffect(() => {
    if (!groups.length) return;
    setForm((prev) => ({
      ...prev,
      budgets: computeBudgetInputs(selectedPlan, groups),
    }));
  }, [groups, selectedPlan]);

  useEffect(() => {
    const cycleMonth = selectedPlan?.month ?? form.month;
    if (!cycleMonth) {
      setActuals({ total: 0, byGroup: {} });
      return;
    }

    const start = (selectedPlan?.cycleStart && selectedPlan.cycleStart.length) ? selectedPlan.cycleStart : `${cycleMonth}-01`;
    const end = (selectedPlan?.cycleEnd && selectedPlan.cycleEnd.length) ? selectedPlan.cycleEnd : endOfMonth(cycleMonth);

    let cancelled = false;
    (async () => {
      try {
        const expenses = await getExpenses({ startDate: start, endDate: end });
        if (cancelled) return;
        const byGroup: Record<string, number> = {};
        let total = 0;
        expenses.forEach((expense) => {
          total += expense.amount;
          byGroup[expense.groupId] = (byGroup[expense.groupId] ?? 0) + expense.amount;
        });
        setActuals({ total, byGroup });
      } catch (_err) {
        if (!cancelled) {
          setActuals({ total: 0, byGroup: {} });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedPlan, form.month]);

  const handleSelectPlan = (planId: 'new' | string) => {
    setFormStatus(null);
    if (planId === 'new') {
      setSelectedPlanId('new');
      setSelectedPlan(null);
      setForm({
        month: new Date().toISOString().slice(0, 7),
        cycleStart: '',
        cycleEnd: '',
        savingsTarget: '',
        locked: false,
        currency: 'INR',
        budgets: computeBudgetInputs(null, groups),
      });
      return;
    }
    const plan = plans.find((item) => item.id === planId) ?? null;
    setSelectedPlanId(plan?.id ?? null);
    setSelectedPlan(plan);
    setForm({
      month: plan?.month ?? '',
      cycleStart: plan?.cycleStart ?? '',
      cycleEnd: plan?.cycleEnd ?? '',
      savingsTarget: plan?.savingsTarget ? String(plan.savingsTarget) : '',
      locked: plan?.locked ?? false,
      currency: plan?.currency ?? 'INR',
      budgets: computeBudgetInputs(plan, groups),
    });
  };

  const totalPlanned = useMemo(
    () => groups.reduce((sum, group) => sum + Number(form.budgets[group.id] || 0), 0),
    [form.budgets, groups],
  );

  const totalActual = actuals.total;
  const actualByGroup = actuals.byGroup;

  const canSave = Boolean(form.month) && groups.length > 0;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSave) {
      setFormStatus({
        type: 'error',
        message: groups.length
          ? 'Please provide a plan month before saving.'
          : 'Add at least one expense group before creating a plan.',
      });
      return;
    }

    try {
      setSaving(true);
      const payload = {
        id: selectedPlan?.id,
        month: form.month,
        cycleStart: form.cycleStart || undefined,
        cycleEnd: form.cycleEnd || undefined,
        locked: form.locked,
        currency: form.currency || 'INR',
        savingsTarget: form.savingsTarget ? Number(form.savingsTarget) : 0,
        budgets: groups.map((group) => ({
          groupId: group.id,
          planned: Number(form.budgets[group.id] || 0),
        })),
      };

      const savedPlan = selectedPlan
        ? await updateMonthlyPlan(selectedPlan.id, payload)
        : await createMonthlyPlan(payload);

      setPlans((prev) => {
        const others = prev.filter((plan) => plan.id !== savedPlan.id);
        const updated = [...others, savedPlan].sort((a, b) => (a.month < b.month ? 1 : -1));
        return updated;
      });

      setSelectedPlan(savedPlan);
      setSelectedPlanId(savedPlan.id ?? null);
      setForm({
        month: savedPlan.month ?? '',
        cycleStart: savedPlan.cycleStart ?? '',
        cycleEnd: savedPlan.cycleEnd ?? '',
        savingsTarget: savedPlan.savingsTarget ? String(savedPlan.savingsTarget) : '',
        locked: savedPlan.locked ?? false,
        currency: savedPlan.currency ?? 'INR',
        budgets: computeBudgetInputs(savedPlan, groups),
      });
      setFormStatus({
        type: 'success',
        message: selectedPlan ? 'Plan updated successfully.' : 'Plan created successfully.',
      });
    } catch (_err) {
      setFormStatus({
        type: 'error',
        message: selectedPlan ? 'Unable to update the plan. Please try again.' : 'Unable to create the plan.',
      });
    } finally {
      setSaving(false);
    }
  };

  const planTotal = (plan: MonthlyPlan) => plan.budgets.reduce((sum, budget) => sum + (budget.planned ?? 0), 0);

  if (loading) {
    return (
      <div className="page">
        <section className="card">
          <header className="card-header">
            <h2 className="card-title">Monthly planner</h2>
          </header>
          <p className="card-subtitle">Loading planner data…</p>
        </section>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <section className="card">
          <header className="card-header">
            <h2 className="card-title">Monthly planner</h2>
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
          <h2 className="card-title">Plans</h2>
          <button
            className={`plan-button ${selectedPlanId === 'new' ? 'plan-button-active' : ''}`}
            type="button"
            onClick={() => handleSelectPlan('new')}
          >
            + New plan
          </button>
        </header>
        {plans.length ? (
          <div className="plan-buttons">
            {plans.map((plan) => (
              <button
                key={plan.id}
                className={`plan-button ${selectedPlanId === plan.id ? 'plan-button-active' : ''}`}
                type="button"
                onClick={() => handleSelectPlan(plan.id)}
              >
                <span className="plan-button-label">{monthLabel(plan.month)}</span>
                <span className="plan-button-meta">{formatCurrency(planTotal(plan))}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="card-subtitle">No plans yet. Create your first plan to start budgeting ahead.</p>
        )}
      </section>

      <section className="card">
        <header className="card-header">
          <h2 className="card-title">Plan details</h2>
        </header>
        <div className="plan-summary">
          <div className="plan-summary-item">
            <span className="item-meta">Total planned</span>
            <span className="plan-summary-value">{formatCurrency(totalPlanned)}</span>
          </div>
          {selectedPlan && (
            <div className="plan-summary-item">
              <span className="item-meta">Actual spent</span>
              <span className="plan-summary-value">{formatCurrency(totalActual)}</span>
            </div>
          )}
          <div className="plan-summary-item">
            <span className="item-meta">Savings target</span>
            <span className="plan-summary-value">
              {formatCurrency(form.savingsTarget ? Number(form.savingsTarget) : 0)}
            </span>
          </div>
        </div>
        <div className="plan-form-grid">
          <label className="form-field">
            <span className="form-label">Plan month</span>
            <input
              className="form-input"
              type="month"
              value={form.month}
              onChange={(event) => {
                setFormStatus(null);
                setForm((prev) => ({ ...prev, month: event.target.value }));
              }}
            />
          </label>
          <label className="form-field">
            <span className="form-label">Cycle start</span>
            <input
              className="form-input"
              type="date"
              value={form.cycleStart}
              onChange={(event) => {
                setFormStatus(null);
                setForm((prev) => ({ ...prev, cycleStart: event.target.value }));
              }}
            />
          </label>
          <label className="form-field">
            <span className="form-label">Cycle end</span>
            <input
              className="form-input"
              type="date"
              value={form.cycleEnd}
              onChange={(event) => {
                setFormStatus(null);
                setForm((prev) => ({ ...prev, cycleEnd: event.target.value }));
              }}
            />
          </label>
          <label className="form-field">
            <span className="form-label">Currency</span>
            <input
              className="form-input"
              value={form.currency}
              onChange={(event) => {
                setFormStatus(null);
                setForm((prev) => ({ ...prev, currency: event.target.value }));
              }}
            />
          </label>
          <label className="form-field">
            <span className="form-label">Savings target</span>
            <input
              className="form-input"
              type="number"
              value={form.savingsTarget}
              onChange={(event) => {
                setFormStatus(null);
                setForm((prev) => ({ ...prev, savingsTarget: event.target.value }));
              }}
            />
          </label>
          <label className="form-field switch-field">
            <span className="form-label">Locked</span>
            <input
              type="checkbox"
              checked={form.locked}
              onChange={(event) => {
                setFormStatus(null);
                setForm((prev) => ({ ...prev, locked: event.target.checked }));
              }}
            />
          </label>
        </div>
      </section>

      <section className="card">
        <header className="card-header">
          <h2 className="card-title">Budget by group</h2>
        </header>
        {groups.length ? (
          <form className="planner-form" onSubmit={handleSubmit}>
            <div className="budget-list">
              {groups.map((group) => {
                const plannedValue = form.budgets[group.id] ?? '';
                const actualValue = actualByGroup[group.id] ?? 0;
                return (
                  <div key={group.id} className="budget-row">
                    <div>
                      <p className="item-title">{group.name}</p>
                      <p className="item-meta">{group.description ?? 'No description provided'}</p>
                    </div>
                    <div className="budget-inputs">
                      <label className="form-field">
                        <span className="form-label">Planned</span>
                        <input
                          className="form-input"
                          type="number"
                          value={plannedValue}
                          onChange={(event) => {
                            const value = event.target.value;
                            setFormStatus(null);
                            setForm((prev) => ({
                              ...prev,
                              budgets: {
                                ...prev.budgets,
                                [group.id]: value,
                              },
                            }));
                          }}
                        />
                      </label>
                      {selectedPlan && (
                        <span className="item-meta">
                          Actual {formatCurrency(actualValue, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {formStatus && (
              <div className={`form-info ${formStatus.type === 'error' ? 'form-warning' : ''}`}>
                <span>{formStatus.message}</span>
              </div>
            )}
            <button className="primary-button" type="submit" disabled={saving || !canSave}>
              {saving ? 'Saving…' : selectedPlan ? 'Update plan' : 'Create plan'}
            </button>
          </form>
        ) : (
          <p className="card-subtitle">
            Add expense groups first so you can plan how much to spend in each category.
          </p>
        )}
      </section>
    </div>
  );
};

export default MonthlyPlannerPage;
