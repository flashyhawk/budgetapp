import { FC, FormEvent, KeyboardEvent, useEffect, useMemo, useState } from 'react';
import { createExpense, getCashBooks, getCurrentMonthlyPlan, getExpenseGroups } from '../api/budget';
import type { CashBook, ExpenseGroup, MonthlyPlan } from '../api/types';
import { formatCurrency } from '../utils/currency';

const getToday = () => new Date().toISOString().slice(0, 10);

const AddExpensePage: FC = () => {
  const [groups, setGroups] = useState<ExpenseGroup[]>([]);
  const [cashBooks, setCashBooks] = useState<CashBook[]>([]);
  const [plan, setPlan] = useState<MonthlyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');

  const [form, setForm] = useState({
    groupId: '',
    cashBookId: '',
    label: '',
    amount: '',
    date: getToday(),
    note: '',
  });
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  const readyForEntry = groups.length > 0 && cashBooks.length > 0;

  const refreshPlan = async () => {
    try {
      const planResponse = await getCurrentMonthlyPlan();
      setPlan(planResponse);
    } catch (err) {
      // ignore refresh errors for now
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const [groupResponse, cashBookResponse, planResponse] = await Promise.all([
          getExpenseGroups(),
          getCashBooks(),
          getCurrentMonthlyPlan(),
        ]);
        if (!mounted) return;

        setGroups(groupResponse);
        setCashBooks(cashBookResponse);
        setPlan(planResponse);

        setForm((prev) => ({
          ...prev,
          groupId: groupResponse[0]?.id ?? prev.groupId,
          cashBookId: cashBookResponse[0]?.id ?? prev.cashBookId,
        }));
      } catch (err) {
        if (!mounted) return;
        setStatus('error');
        setStatusMessage('Unable to load data for creating an expense.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const selectedBudget = useMemo(() => {
    if (!plan || !form.groupId) return null;
    const budget = plan.budgets.find((entry) => entry.groupId === form.groupId);
    if (!budget) return { planned: 0, actual: 0, remaining: -Number(form.amount || 0) };
    return {
      planned: budget.planned,
      actual: budget.actual,
      remaining: budget.planned - budget.actual,
    };
  }, [plan, form.groupId, form.amount]);

  const plannedRemainingMessage = useMemo(() => {
    if (!selectedBudget) {
      return 'This group is not yet part of the monthly plan.';
    }
    if (selectedBudget.remaining > 0) {
      return `You still have ${formatCurrency(selectedBudget.remaining)} remaining in this month’s plan.`;
    }
    if (selectedBudget.remaining === 0) {
      return 'This group has reached the planned amount.';
    }
    return `This group is over budget by ${formatCurrency(Math.abs(selectedBudget.remaining))}.`;
  }, [selectedBudget]);

  const handleTagKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const value = tagInput.trim();
      if (!value || tags.includes(value)) return;
      setTags((prev) => [...prev, value]);
      setTagInput('');
    }
  };

  const removeTag = (value: string) => {
    setTags((prev) => prev.filter((tag) => tag !== value));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!readyForEntry) {
      setStatus('error');
      setStatusMessage('Please add at least one expense group and cash book before logging expenses.');
      return;
    }
    const amount = Number(form.amount);
    if (!form.label || Number.isNaN(amount) || amount <= 0 || !form.groupId || !form.cashBookId) {
      setStatus('error');
      setStatusMessage('Please provide a label, amount, group, and cash book.');
      return;
    }

    try {
      setStatus('saving');
      await createExpense({
        label: form.label,
        amount,
        groupId: form.groupId,
        cashBookId: form.cashBookId,
        date: form.date,
        note: form.note || undefined,
        tags,
        planMonth: plan?.month,
      });
      setStatus('success');
      setStatusMessage('Expense saved successfully.');
      setForm((prev) => ({
        ...prev,
        label: '',
        amount: '',
        note: '',
      }));
      setTags([]);
      await refreshPlan();
    } catch (err) {
      setStatus('error');
      setStatusMessage('Failed to save the expense. Please try again.');
    } finally {
      setStatus((prev) => (prev === 'saving' ? 'idle' : prev));
    }
  };

  return (
    <div className="page">
      <section className="card">
        <header className="card-header">
          <h2 className="card-title">Add expense</h2>
          <span className="badge badge-soft">Quick entry</span>
        </header>
        <p className="card-subtitle">
          Capture the details of your purchase. Amounts update the selected cash book and expense group automatically.
        </p>
        <form className="form-grid" onSubmit={handleSubmit}>
          <label className="form-field">
            <span className="form-label">Expense group</span>
            <select
              className="form-input"
              value={form.groupId}
              onChange={(event) => setForm((prev) => ({ ...prev, groupId: event.target.value }))}
              disabled={loading || !groups.length}
            >
              {groups.length ? (
                groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))
              ) : (
                <option value="">No groups available</option>
              )}
            </select>
          </label>
          <label className="form-field">
            <span className="form-label">Label</span>
            <input
              className="form-input"
              placeholder="e.g. Weekly produce market"
              value={form.label}
              onChange={(event) => setForm((prev) => ({ ...prev, label: event.target.value }))}
              disabled={loading}
            />
          </label>
          <label className="form-field">
            <span className="form-label">Amount</span>
            <input
              className="form-input"
              placeholder={formatCurrency(0, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              type="number"
              step="0.01"
              value={form.amount}
              onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
              disabled={loading}
            />
          </label>
          <label className="form-field">
            <span className="form-label">Cash book</span>
            <select
              className="form-input"
              value={form.cashBookId}
              onChange={(event) => setForm((prev) => ({ ...prev, cashBookId: event.target.value }))}
              disabled={loading || !cashBooks.length}
            >
              {cashBooks.length ? (
                cashBooks.map((book) => (
                  <option key={book.id} value={book.id}>
                    {book.name}
                  </option>
                ))
              ) : (
                <option value="">No cash books available</option>
              )}
            </select>
          </label>
          <label className="form-field">
            <span className="form-label">Date</span>
            <input
              className="form-input"
              type="date"
              value={form.date}
              max={getToday()}
              onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
              disabled={loading}
            />
          </label>
          <label className="form-field">
            <span className="form-label">Notes</span>
            <textarea
              className="form-input"
              placeholder="Add context, split details, or reminders"
              rows={3}
              value={form.note}
              onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
              disabled={loading}
            />
          </label>
          <label className="form-field">
            <span className="form-label">Tags</span>
            <div className="chip-input">
              {tags.map((tag) => (
                <button key={tag} className="chip" type="button" onClick={() => removeTag(tag)}>
                  {tag}
                </button>
              ))}
              <input
                className="chip-editor"
                placeholder="Add tag"
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={handleTagKeyDown}
                disabled={loading}
              />
            </div>
          </label>
          <div className={`form-info ${selectedBudget && selectedBudget.remaining < 0 ? 'form-warning' : ''}`}>
            <span>{plannedRemainingMessage}</span>
            <button className="ghost-button" type="button">
              View plan
            </button>
          </div>
          {!readyForEntry && (
            <div className="form-info form-warning">
              <span>
                Add at least one expense group and cash book before saving expenses. You can manage these from their
                respective pages.
              </span>
            </div>
          )}
          {status !== 'idle' && statusMessage && (
            <div className={`form-info ${status === 'error' ? 'form-warning' : ''}`}>
              <span>{statusMessage}</span>
            </div>
          )}
          <button className="primary-button" type="submit" disabled={status === 'saving' || loading || !readyForEntry}>
            {status === 'saving' ? 'Saving…' : 'Save expense'}
          </button>
        </form>
      </section>

      <section className="card">
        <header className="card-header">
          <h2 className="card-title">Attach receipt (future)</h2>
        </header>
        <div className="dashed-box">
          <p className="item-title">Coming soon</p>
          <p className="item-meta">
            Snap a photo or upload a PDF receipt and keep your records tidy. We’ll even extract totals automatically.
          </p>
        </div>
      </section>
    </div>
  );
};

export default AddExpensePage;
