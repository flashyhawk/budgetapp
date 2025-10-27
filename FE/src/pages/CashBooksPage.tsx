import { FC, FormEvent, useEffect, useMemo, useState } from 'react';
import { createCashBook, getCashBooks } from '../api/budget';
import type { CashBook } from '../api/types';
import { formatCurrency } from '../utils/currency';

const formatAccountNumber = (accountNumber: string) => {
  if (!accountNumber) return 'Not provided';
  if (accountNumber.includes('*') || accountNumber.includes('•')) return accountNumber;
  if (accountNumber.length <= 4) return `•••• ${accountNumber}`;
  return `•••• ${accountNumber.slice(-4)}`;
};

const getRecencyStatus = (activity?: CashBook['lastActivity']) => {
  if (!activity) return { label: 'Unknown', statusClass: 'status-warning' };
  const activityDate = new Date(`${activity.date}T00:00:00`);
  if (Number.isNaN(activityDate.getTime())) {
    return { label: 'Needs review', statusClass: 'status-warning' };
  }

  const daysSince = Math.round((Date.now() - activityDate.getTime()) / (24 * 60 * 60 * 1000));
  if (daysSince <= 30) {
    return { label: 'Up to date', statusClass: 'status-success' };
  }
  return { label: 'Needs review', statusClass: 'status-warning' };
};

const CashBooksPage: FC = () => {
  const [cashBooks, setCashBooks] = useState<CashBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formStatus, setFormStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    type: 'bank',
    accountNumber: '',
    balance: '',
    currency: 'INR',
    notes: '',
  });

  const refresh = async () => {
    try {
      setLoading(true);
      const response = await getCashBooks();
      setCashBooks(response);
      setError(null);
    } catch (err) {
      setError('Unable to load cash books. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const totalBalance = useMemo(
    () => cashBooks.reduce((sum, book) => sum + Number(book.balance || 0), 0),
    [cashBooks],
  );

  const formatActivity = (activity?: CashBook['lastActivity']) => {
    if (!activity) return 'No recent activity';
    const date = new Date(`${activity.date}T00:00:00`);
    const dateLabel = Number.isNaN(date.getTime())
      ? activity.date
      : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
    const amountLabel = formatCurrency(Math.abs(activity.amount), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const direction = activity.amount < 0 ? '-' : '+';
    return `${activity.label} · ${direction}${amountLabel} · ${dateLabel}`;
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({
      name: '',
      type: 'bank',
      accountNumber: '',
      balance: '',
      currency: 'INR',
      notes: '',
    });
    setFormStatus(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setFormStatus({ type: 'error', message: 'Please provide a name for the cash book.' });
      return;
    }

    try {
      setSaving(true);
      const payload = {
        id: editingId ?? undefined,
        name: form.name.trim(),
        type: form.type,
        accountNumber: form.accountNumber.trim(),
        balance: form.balance ? Number(form.balance) : 0,
        currency: form.currency.trim() || 'INR',
        notes: form.notes.trim(),
      };

      await createCashBook(payload);
      setFormStatus({
        type: 'success',
        message: editingId ? 'Cash book updated successfully.' : 'Cash book added successfully.',
      });
      resetForm();
      await refresh();
    } catch (_err) {
      setFormStatus({
        type: 'error',
        message: editingId ? 'Unable to update the cash book.' : 'Unable to create the cash book.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <section className="card">
        <header className="card-header">
          <h2 className="card-title">Cash books overview</h2>
          <span className="badge badge-soft">
            Total {formatCurrency(totalBalance, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </header>
        <p className="card-subtitle">
          Keep all your accounts aligned. Balances update automatically when you add income or expenses.
        </p>
      </section>

      <section className="card">
        <header className="card-header">
          <h2 className="card-title">Existing accounts</h2>
          <button className="action-chip" type="button" onClick={refresh} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh balances'}
          </button>
        </header>
        {error && <p className="card-subtitle">{error}</p>}
        <div className="stacked-list">
          {loading && !cashBooks.length ? (
            <p>Loading accounts…</p>
          ) : cashBooks.length ? (
            cashBooks.map((book) => {
              const recency = getRecencyStatus(book.lastActivity);
              return (
                <article key={book.id} className="stacked-item">
                  <div>
                    <p className="item-title">{book.name}</p>
                    <p className="item-subtitle">{book.type}</p>
                    <p className="item-meta">{formatAccountNumber(book.accountNumber)}</p>
                    <span className={`status-pill ${recency.statusClass}`}>{recency.label}</span>
                  </div>
                  <div className="item-value">
                    <span>
                      {formatCurrency(book.balance ?? 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <p className="item-meta">{formatActivity(book.lastActivity)}</p>
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => {
                        setEditingId(book.id);
                        setForm({
                          name: book.name,
                          type: book.type ?? 'bank',
                          accountNumber: book.accountNumber ?? '',
                          balance: typeof book.balance === 'number' ? String(book.balance) : '',
                          currency: book.currency ?? 'INR',
                          notes: book.notes ?? '',
                        });
                        setFormStatus(null);
                      }}
                    >
                      Edit
                    </button>
                  </div>
                </article>
              );
            })
          ) : (
            <p className="card-subtitle">No cash books yet. Add at least one account below.</p>
          )}
        </div>
      </section>

      <section className="card">
        <header className="card-header">
          <h2 className="card-title">{editingId ? 'Edit cash book' : 'Add a cash book'}</h2>
        </header>
        <form className="form-grid" onSubmit={handleSubmit}>
          <label className="form-field">
            <span className="form-label">Name</span>
            <input
              className="form-input"
              placeholder="e.g. Kids School Account"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            />
          </label>
          <label className="form-field">
            <span className="form-label">Type</span>
            <select
              className="form-input"
              value={form.type}
              onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}
            >
              <option value="bank">Bank</option>
              <option value="cash">Cash</option>
              <option value="wallet">Wallet</option>
              <option value="digital">Digital</option>
            </select>
          </label>
          <label className="form-field">
            <span className="form-label">Starting balance</span>
            <input
              className="form-input"
              placeholder={formatCurrency(0, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              type="number"
              value={form.balance}
              onChange={(event) => setForm((prev) => ({ ...prev, balance: event.target.value }))}
            />
          </label>
          <label className="form-field">
            <span className="form-label">Currency</span>
            <input
              className="form-input"
              value={form.currency}
              onChange={(event) => setForm((prev) => ({ ...prev, currency: event.target.value }))}
            />
          </label>
          <label className="form-field">
            <span className="form-label">Account number / Identifier</span>
            <input
              className="form-input"
              placeholder="****1234 or UPI ID"
              value={form.accountNumber}
              onChange={(event) => setForm((prev) => ({ ...prev, accountNumber: event.target.value }))}
            />
          </label>
          <label className="form-field">
            <span className="form-label">Notes</span>
            <textarea
              className="form-input"
              placeholder="Add any helpful context"
              rows={3}
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
            />
          </label>
          <div className="form-actions">
            <button className="ghost-button" type="button" onClick={resetForm} disabled={saving}>
              {editingId ? 'Cancel edit' : 'Reset'}
            </button>
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Update cash book' : 'Save cash book'}
            </button>
          </div>
          {formStatus && (
            <div className={`form-info ${formStatus.type === 'error' ? 'form-warning' : ''}`}>
              <span>{formStatus.message}</span>
            </div>
          )}
        </form>
      </section>

      <section className="card">
        <header className="card-header">
          <h2 className="card-title">Transfers (coming soon)</h2>
        </header>
        <p className="card-subtitle">
          Plan to move funds between cash books and keep your balances accurate. You will be able to schedule or log
          transfers in the next release.
        </p>
        <div className="dashed-box">
          <p className="item-title">Sneak peek</p>
          <ul className="info-list">
            <li>
              <span>Instant transfer</span>
              <strong>Select source and destination accounts</strong>
            </li>
            <li>
              <span>Track reasons</span>
              <strong>Attach notes for audit history</strong>
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
};

export default CashBooksPage;
