import { FC, FormEvent, useEffect, useMemo, useState } from 'react';
import { createExpenseGroup, getExpenseGroups } from '../api/budget';
import type { ExpenseGroup } from '../api/types';
import { formatCurrency } from '../utils/currency';

const candidatePalette = [
  '#4C6FFF',
  '#FF6584',
  '#2EC4B6',
  '#FF9F1C',
  '#845EF7',
  '#FF6B6B',
  '#0ACF83',
  '#F687D4',
  '#1C7ED6',
  '#6C63FF',
];

const normalizeHex = (value: string) => {
  if (!value) return '';
  const hex = value.trim().replace('#', '').toUpperCase();
  if (!/^[0-9A-F]{6}$/.test(hex)) {
    return '';
  }
  return `#${hex}`;
};

const hexToRgb = (hex: string) => {
  const normalized = normalizeHex(hex);
  if (!normalized) return { r: 0, g: 0, b: 0 };
  const value = normalized.slice(1);
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
};

const colorDistance = (a: string, b: string) => {
  const colorA = hexToRgb(a);
  const colorB = hexToRgb(b);
  return Math.sqrt(
    (colorA.r - colorB.r) ** 2 + (colorA.g - colorB.g) ** 2 + (colorA.b - colorB.b) ** 2,
  );
};

const pickSuggestedColor = (existing: string[]) => {
  const normalizedExisting = existing
    .map((color) => normalizeHex(color))
    .filter((color): color is string => Boolean(color));

  if (!normalizedExisting.length) {
    return candidatePalette[0];
  }

  let bestColor = candidatePalette[0];
  let bestScore = -1;

  candidatePalette.forEach((candidate) => {
    const normalizedCandidate = normalizeHex(candidate);
    if (!normalizedCandidate) return;

    const distances = normalizedExisting.map((color) => colorDistance(normalizedCandidate, color));
    const minDistance = distances.length ? Math.min(...distances) : Number.POSITIVE_INFINITY;
    const isUnused = !normalizedExisting.includes(normalizedCandidate);
    const score = isUnused ? minDistance + 512 : minDistance;

    if (score > bestScore) {
      bestScore = score;
      bestColor = normalizedCandidate;
    }
  });

  return bestColor;
};

const fallbackColor = (seed: string) => {
  const hash = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return candidatePalette[hash % candidatePalette.length];
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
    color: candidatePalette[0],
  });

  const existingColors = useMemo(
    () =>
      groups.map((group) => {
        const normalized = normalizeHex(group.color ?? '');
        return normalized || fallbackColor(group.id);
      }),
    [groups],
  );

  const suggestedColor = useMemo(() => pickSuggestedColor(existingColors), [existingColors]);

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

  useEffect(() => {
    if (loading || editingGroupId) return;
    setForm((prev) => {
      const emptyFields =
        !prev.name.trim() && !prev.description.trim() && !prev.defaultMonthlyBudget.trim();
      if (!emptyFields) return prev;
      if (prev.color === suggestedColor) return prev;
      return {
        ...prev,
        color: suggestedColor,
      };
    });
  }, [editingGroupId, loading, suggestedColor]);

  const isEditing = Boolean(editingGroupId);

  const resetForm = () => {
    setForm({
      name: '',
      defaultMonthlyBudget: '',
      description: '',
      color: suggestedColor,
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
      const normalizedColor = normalizeHex(form.color) || suggestedColor;
      const payload = {
        id: editingGroupId ?? undefined,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        color: normalizedColor,
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
      </section>

      <section className="card">
        <header className="card-header">
          <h2 className="card-title">Active groups</h2>
        </header>
        {loading ? (
          <p className="card-subtitle">Loading groups…</p>
        ) : error ? (
          <p className="card-subtitle">{error}</p>
        ) : groups.length ? (
          <div className="stacked-list">
            {groups.map((group) => (
              <article key={group.id} className="stacked-item">
                <div className="stacked-item-left">
                  <span className="color-dot" style={{ backgroundColor: group.color ?? fallbackColor(group.id) }} />
                  <div>
                    <p className="item-title">{group.name}</p>
                    <p className="item-meta">{group.description ?? 'No description provided'}</p>
                  </div>
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
                        color: normalizeHex(group.color ?? '') || fallbackColor(group.id),
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
