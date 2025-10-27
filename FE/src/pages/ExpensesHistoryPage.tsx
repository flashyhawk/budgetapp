import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { getCashBooks, getExpenseGroups, getExpenses } from '../api/budget';
import type { CashBook, Expense, ExpenseGroup } from '../api/types';
import { formatCurrency } from '../utils/currency';

const formatDateLabel = (date: string) => {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(parsed);
};

const ExpensesHistoryPage: FC = () => {
  const [expenseGroups, setExpenseGroups] = useState<ExpenseGroup[]>([]);
  const [cashBooks, setCashBooks] = useState<CashBook[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    groupId: '',
    cashBookId: '',
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchTerm), 400);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const loadStaticData = async () => {
    try {
      const [groupsResponse, cashBookResponse] = await Promise.all([getExpenseGroups(), getCashBooks()]);
      setExpenseGroups(groupsResponse);
      setCashBooks(cashBookResponse);
    } catch (err) {
      setError('Unable to load supporting data.');
    }
  };

  const loadExpenses = useCallback(async (search?: string) => {
    try {
      setLoading(true);
      const response = await getExpenses({
        startDate: filters.startDate || undefined,
        endDate: filters.endDate || undefined,
        groupId: filters.groupId || undefined,
        cashBookId: filters.cashBookId || undefined,
        search: search || undefined,
      });
      setExpenses(response);
      setError(null);
    } catch (err) {
      setError('Unable to fetch expenses. Please adjust your filters or try again.');
    } finally {
      setLoading(false);
    }
  }, [filters.startDate, filters.endDate, filters.groupId, filters.cashBookId]);

  useEffect(() => {
    loadStaticData();
  }, []);

  useEffect(() => {
    loadExpenses(debouncedSearch);
  }, [debouncedSearch, loadExpenses]);

  const expenseDays = useMemo(() => {
    const groupsMap = expenseGroups.reduce<Record<string, string>>((acc, group) => {
      acc[group.id] = group.name;
      return acc;
    }, {});

    const cashBookMap = cashBooks.reduce<Record<string, string>>((acc, book) => {
      acc[book.id] = book.name;
      return acc;
    }, {});

    const grouped = expenses.reduce<Record<string, { date: string; total: number; items: Array<{
      id: string;
      label: string;
      note?: string;
      amount: number;
      group: string;
      cashBook: string;
    }> }>>((acc, expense) => {
      if (!acc[expense.date]) {
        acc[expense.date] = { date: expense.date, total: 0, items: [] };
      }
      acc[expense.date].total += expense.amount;
      acc[expense.date].items.push({
        id: expense.id,
        label: expense.label,
        note: expense.note,
        amount: expense.amount,
        group: groupsMap[expense.groupId] ?? expense.groupId,
        cashBook: cashBookMap[expense.cashBookId] ?? expense.cashBookId,
      });
      return acc;
    }, {});

    return Object.values(grouped)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((day) => ({
        ...day,
        dateLabel: formatDateLabel(day.date),
      }));
  }, [expenses, expenseGroups, cashBooks]);

  return (
    <div className="page">
      <section className="card">
        <header className="card-header">
          <h2 className="card-title">Expenses</h2>
          <button className="action-chip" type="button">
            Export
          </button>
        </header>
        <p className="card-subtitle">
          Review, filter, and refine your spending history. Use quick filters or search by label to find entries fast.
        </p>
        <div className="filters">
          <div className="form-field">
            <span className="form-label">Date range</span>
            <div className="chip-range">
              <input
                className="form-input"
                type="date"
                value={filters.startDate}
                onChange={(event) => setFilters((prev) => ({ ...prev, startDate: event.target.value }))}
              />
              <span className="range-separator">to</span>
              <input
                className="form-input"
                type="date"
                value={filters.endDate}
                onChange={(event) => setFilters((prev) => ({ ...prev, endDate: event.target.value }))}
              />
            </div>
          </div>
          <div className="form-field">
            <span className="form-label">Group</span>
            <select
              className="form-input"
              value={filters.groupId}
              onChange={(event) => setFilters((prev) => ({ ...prev, groupId: event.target.value }))}
            >
              <option value="">All groups</option>
              {expenseGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <span className="form-label">Cash book</span>
            <select
              className="form-input"
              value={filters.cashBookId}
              onChange={(event) => setFilters((prev) => ({ ...prev, cashBookId: event.target.value }))}
            >
              <option value="">All cash books</option>
              {cashBooks.map((book) => (
                <option key={book.id} value={book.id}>
                  {book.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label className="form-field">
          <span className="form-label">Search</span>
          <input
            className="form-input"
            placeholder="Try “market” or “school”"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </label>
      </section>

      {loading && (
        <section className="card">
          <p className="card-subtitle">Loading expenses…</p>
        </section>
      )}

      {error && !loading && (
        <section className="card">
          <p className="card-subtitle">{error}</p>
        </section>
      )}

      {!loading && !error && expenseDays.length === 0 && (
        <section className="card">
          <p className="card-subtitle">No expenses found for the selected filters.</p>
        </section>
      )}

      {expenseDays.map((day) => (
        <section key={day.date} className="card">
          <header className="card-header">
            <h2 className="card-title">{day.dateLabel}</h2>
            <span className="badge badge-soft">
              Total {formatCurrency(day.total, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </header>
          <div className="stacked-list">
            {day.items.map((expense) => (
              <article key={expense.id} className="stacked-item">
                <div>
                  <p className="item-title">{expense.label}</p>
                  <p className="item-meta">
                    {expense.group} · {expense.cashBook}
                  </p>
                  {expense.note && <p className="item-subtitle">{expense.note}</p>}
                </div>
                <div className="item-value">
                  <span>
                    {formatCurrency(expense.amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <div className="action-group">
                    <button className="ghost-button" type="button">
                      Edit
                    </button>
                    <button className="ghost-button danger" type="button">
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};

export default ExpensesHistoryPage;
