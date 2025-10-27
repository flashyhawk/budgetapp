import { FC, FormEvent, useEffect, useState } from 'react';
import { createExpenseGroup, getExpenseGroups } from '../api/budget';
import type { ExpenseGroup } from '../api/types';
import { formatCurrency } from '../utils/currency';

const fallbackColor = (seed: string) => {
  const palette = ['#6C63FF', '#FF6584', '#3DCAB0', '#FFB347', '#FF6B6B', '#4C6FFF'];
  const hash = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return palette[hash % palette.length];
};

const ExpenseGroupsPage: FC = () => {
  const [groups, setGroups] = useState<ExpenseGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formStatus, setFormStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    defaultMonthlyBudget: '',
    description: '',
    color: '#6C63FF',
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const response = await getExpenseGroups();
        if (!mounted) return;
        setGroups(response);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError('Unable to load expense groups.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const isEditing = Boolean(editingGroupId);

  const resetForm = () => {
    setForm({
      name: '',
      defaultMonthlyBudget: '',
      description: '',
      color: '#6C63FF',
    });
    setEditingGroupId(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setFormStatus({ type: 'error', message: 'Please provide a group name.' });
      return;
    }

    try {
      setSaving(true);
      const payload = {
        id: editingGroupId ?? undefined,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        color: form.color || undefined,
        defaultMonthlyBudget: form.defaultMonthlyBudget ? Number(form.defaultMonthlyBudget) : undefined,
      };
      const savedGroup = await createExpenseGroup(payload);
      setGroups((prev) => {
        if (editingGroupId) {
          return prev.map((group) => (group.id === editingGroupId ? savedGroup : group));
        }
        return [...prev, savedGroup];
      });
      resetForm();
      setFormStatus({
        type: 'success',
        message: editingGroupId ? 'Expense group updated successfully.' : 'Expense group added successfully.',
      });
    } catch (submissionError) {
      setFormStatus({
        type: 'error',
        message: editingGroupId
          ? 'Unable to update the expense group. Please try again.'
          : 'Unable to create the expense group. Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <section className="card">
        <header className="card-header">
          <h2 className="card-title">Expense groups</h2>
          <span className="badge badge-soft">{groups.length} total</span>
        </header>
        <p className="card-subtitle">
          Organize your spending categories. These show up when planning budgets and logging expenses.
        </p>
      </section>

      <section className="card">
        <header className="card-header">
          <h2 className="card-title">Active groups</h2>
          <button className="action-chip" type="button">
            Reorder
          </button>
        </header>
        {loading ? (
          <p className="card-subtitle">Loading groups…</p>
        ) : error ? (
          <p className="card-subtitle">{error}</p>
        ) : groups.length ? (
          <div className="stacked-list">
            {groups.map((group) => (
              <article key={group.id} className="stacked-item">
                <div className="color-dot" style={{ backgroundColor: group.color ?? fallbackColor(group.id) }} />
                <div>
                  <p className="item-title">{group.name}</p>
                  <p className="item-meta">{group.description ?? 'No description provided'}</p>
                </div>
                <div className="item-value">
                  <span>{formatCurrency(group.defaultMonthlyBudget ?? 0)}</span>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => {
                      setEditingGroupId(group.id);
                      setForm({
                        name: group.name,
                        defaultMonthlyBudget:
                          typeof group.defaultMonthlyBudget === 'number'
                            ? String(group.defaultMonthlyBudget)
                            : '',
                        description: group.description ?? '',
                        color: group.color ?? '#6C63FF',
                      });
                      setFormStatus(null);
                    }}
                  >
                    Edit
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="card-subtitle">No expense groups yet. Add your categories to start planning.</p>
        )}
      </section>

      <section className="card">
        <header className="card-header">
          <h2 className="card-title">{isEditing ? 'Edit expense group' : 'Create expense group'}</h2>
        </header>
        <form className="form-grid" onSubmit={handleSubmit}>
          <label className="form-field">
            <span className="form-label">Group name</span>
            <input
              className="form-input"
              placeholder="e.g. Subscriptions"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            />
          </label>
          <label className="form-field">
            <span className="form-label">Monthly budget (optional)</span>
            <input
              className="form-input"
              placeholder={formatCurrency(0, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              type="number"
              value={form.defaultMonthlyBudget}
              onChange={(event) => setForm((prev) => ({ ...prev, defaultMonthlyBudget: event.target.value }))}
            />
          </label>
          <label className="form-field">
            <span className="form-label">Description</span>
            <textarea
              className="form-input"
              placeholder="What expenses belong here?"
              rows={3}
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            />
          </label>
          <label className="form-field">
            <span className="form-label">Color</span>
            <input
              className="form-input"
              type="color"
              value={form.color}
              onChange={(event) => setForm((prev) => ({ ...prev, color: event.target.value }))}
            />
          </label>
          <div className="form-actions">
            <button
              className="ghost-button"
              type="button"
              onClick={resetForm}
              disabled={saving && !isEditing}
            >
              {isEditing ? 'Cancel edit' : 'Reset'}
            </button>
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? 'Saving…' : isEditing ? 'Update group' : 'Add group'}
            </button>
          </div>
          {formStatus && (
            <div className={`form-info ${formStatus.type === 'error' ? 'form-warning' : ''}`}>
              <span>{formStatus.message}</span>
            </div>
          )}
        </form>
      </section>
    </div>
  );
};

export default ExpenseGroupsPage;
