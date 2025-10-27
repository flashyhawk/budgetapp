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
  });
  const [actuals, setActuals] = useState<{ total: number; byGroup: Record<string, number> }>({ total: 0, byGroup: {} });
  const [planBudgets, setPlanBudgets] = useState<Array<{ groupId: string; planned: string }>>([]);
  const [groupToAdd, setGroupToAdd] = useState<string>('');

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
          setPlanBudgets(
            plan.budgets.map((budget) => ({
              groupId: budget.groupId,
              planned: String(budget.planned ?? 0),
            })),
          );
          setForm({
            month: plan.month ?? '',
            cycleStart: plan.cycleStart ?? '',
            cycleEnd: plan.cycleEnd ?? '',
            savingsTarget: plan.savingsTarget ? String(plan.savingsTarget) : '',
            locked: plan.locked ?? false,
            currency: plan.currency ?? 'INR',
          });
        } else {
          setSelectedPlanId('new');
          setSelectedPlan(null);
          setPlanBudgets([]);
          setForm({
            month: currentMonthKey,
            cycleStart: '',
            cycleEnd: '',
            savingsTarget: '',
            locked: false,
            currency: 'INR',
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
      setPlanBudgets([]);
      setForm({
        month: new Date().toISOString().slice(0, 7),
        cycleStart: '',
        cycleEnd: '',
        savingsTarget: '',
        locked: false,
        currency: 'INR',
      });
      return;
    }
    const plan = plans.find((item) => item.id === planId) ?? null;
    setSelectedPlanId(plan?.id ?? null);
    setSelectedPlan(plan);
    setPlanBudgets(
      plan
        ? plan.budgets.map((budget) => ({
            groupId: budget.groupId,
            planned: String(budget.planned ?? 0),
          }))
        : [],
    );
    setForm({
      month: plan?.month ?? '',
      cycleStart: plan?.cycleStart ?? '',
      cycleEnd: plan?.cycleEnd ?? '',
      savingsTarget: plan?.savingsTarget ? String(plan.savingsTarget) : '',
      locked: plan?.locked ?? false,
      currency: plan?.currency ?? 'INR',
    });
  };

  const selectedPlanBudgets = useMemo(() => {
    if (!selectedPlan) return {} as Record<string, { planned: number; actual: number }>;
    return selectedPlan.budgets.reduce(
      (acc, budget) => {
        acc[budget.groupId] = {
          planned: budget.planned ?? 0,
          actual: budget.actual ?? 0,
        };
        return acc;
      },
      {} as Record<string, { planned: number; actual: number }>,
    );
  }, [selectedPlan]);

  const availableGroups = useMemo(
    () => groups.filter((group) => !planBudgets.some((budget) => budget.groupId === group.id)),
    [groups, planBudgets],
  );

  useEffect(() => {
    if (!availableGroups.length) {
      setGroupToAdd('');
      return;
    }
    if (!availableGroups.some((group) => group.id === groupToAdd)) {
      setGroupToAdd(availableGroups[0].id);
    }
  }, [availableGroups, groupToAdd]);

  const actualByGroup = actuals.byGroup;

  const budgetRows = useMemo(
    () =>
      planBudgets.map((budget) => {
        const group = groups.find((item) => item.id === budget.groupId);
        const reference = selectedPlanBudgets[budget.groupId];
        const plannedNumber = budget.planned !== '' ? Number(budget.planned) : reference?.planned ?? 0;
        const actualValue = actualByGroup[budget.groupId] ?? reference?.actual ?? 0;
        return {
          ...budget,
          name: group?.name ?? 'Removed group',
          description: group?.description ?? (group ? 'No description provided' : 'This group is no longer available.'),
          plannedNumber,
          actualValue,
        };
      }),
    [actualByGroup, groups, planBudgets, selectedPlanBudgets],
  );

  const totalPlanned = useMemo(
    () => budgetRows.reduce((sum, budget) => sum + budget.plannedNumber, 0),
    [budgetRows],
  );

  const handleAddGroupToPlan = () => {
    if (!groupToAdd) return;
    const group = groups.find((item) => item.id === groupToAdd);
    const defaultValue =
      group?.defaultMonthlyBudget !== undefined && group?.defaultMonthlyBudget !== null
        ? String(group.defaultMonthlyBudget || 0)
        : '';
    setPlanBudgets((prev) => [...prev, { groupId: groupToAdd, planned: defaultValue }]);
    setFormStatus(null);
  };

  const totalActual = actuals.total;

  const canSave = Boolean(form.month) && planBudgets.length > 0;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.month) {
      setFormStatus({
        type: 'error',
        message: 'Please provide a plan month before saving.',
      });
      return;
    }
    if (!planBudgets.length) {
      setFormStatus({
        type: 'error',
        message: groups.length
          ? 'Add at least one expense group to this plan before saving.'
          : 'Create an expense group before building a plan.',
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
        budgets: planBudgets.map((budget) => ({
          groupId: budget.groupId,
          planned: budget.planned === '' ? 0 : Number(budget.planned),
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
      setPlanBudgets(
        savedPlan.budgets.map((budget) => ({
          groupId: budget.groupId,
          planned: String(budget.planned ?? 0),
        })),
      );
      setForm({
        month: savedPlan.month ?? '',
        cycleStart: savedPlan.cycleStart ?? '',
        cycleEnd: savedPlan.cycleEnd ?? '',
        savingsTarget: savedPlan.savingsTarget ? String(savedPlan.savingsTarget) : '',
        locked: savedPlan.locked ?? false,
        currency: savedPlan.currency ?? 'INR',
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
          <h2 className="card-title">Expense groups</h2>
        </header>
        {groups.length ? (
          <form className="planner-form" onSubmit={handleSubmit}>
            {budgetRows.length ? (
              <>
                <div className="budget-list">
                  {budgetRows.map((budget) => (
                    <div key={budget.groupId} className="budget-row">
                      <div>
                        <p className="item-title">{budget.name}</p>
                        <p className="item-meta">{budget.description}</p>
                      </div>
                      <div className="budget-inputs">
                        <label className="form-field">
                          <span className="form-label">Planned</span>
                          <input
                            className="form-input"
                            type="number"
                            value={budget.planned}
                            onChange={(event) => {
                              const value = event.target.value;
                              setFormStatus(null);
                              setPlanBudgets((prev) =>
                                prev.map((entry) =>
                                  entry.groupId === budget.groupId ? { ...entry, planned: value } : entry,
                                ),
                              );
                            }}
                          />
                        </label>
                        <div className="budget-metrics">
                          <span className="item-meta">
                            Planned {formatCurrency(budget.plannedNumber, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          {selectedPlan && (
                            <span className="item-meta">
                              Actual {formatCurrency(budget.actualValue, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {availableGroups.length > 0 && (
                  <div className="plan-add-row">
                    <select
                      className="form-input plan-add-select"
                      value={groupToAdd}
                      onChange={(event) => setGroupToAdd(event.target.value)}
                    >
                      {availableGroups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                    <button
                      className="ghost-button small"
                      type="button"
                      onClick={handleAddGroupToPlan}
                      disabled={!groupToAdd}
                    >
                      Add
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p className="card-subtitle">
                No expense groups added to this plan yet. Use the selector below to include one.
              </p>
            )}
            {!budgetRows.length && availableGroups.length > 0 && (
              <div className="plan-add-row">
                <select
                  className="form-input plan-add-select"
                  value={groupToAdd}
                  onChange={(event) => setGroupToAdd(event.target.value)}
                >
                  {availableGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
                <button
                  className="ghost-button small"
                  type="button"
                  onClick={handleAddGroupToPlan}
                  disabled={!groupToAdd}
                >
                  Add
                </button>
              </div>
            )}
            {formStatus && (
              <div className={`form-info ${formStatus.type === 'error' ? 'form-warning' : ''}`}>
                <span>{formStatus.message}</span>
              </div>
            )}
            <button className="primary-button" type="submit" disabled={saving || !canSave}>
              {saving ? 'Saving…' : 'Update plan'}
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
