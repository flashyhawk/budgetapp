import { ChangeEvent, FC, FormEvent, useMemo, useState } from 'react';
import { importData } from '../api/budget';
import type { CashBook, Expense, ExpenseGroup, MonthlyPlan } from '../api/types';

type DatasetKey = 'cashBooks' | 'expenseGroups' | 'monthlyPlans' | 'expenses';

type DatasetState = {
  fileName: string;
  records: number;
  error: string | null;
  payload: unknown[];
};

const DATASETS: { key: DatasetKey; label: string; description: string }[] = [
  { key: 'cashBooks', label: 'Cash books', description: 'Accounts and balances' },
  { key: 'expenseGroups', label: 'Expense groups', description: 'Categories and defaults' },
  { key: 'monthlyPlans', label: 'Monthly plans', description: 'Budgets and cycles' },
  { key: 'expenses', label: 'Expenses', description: 'Transactions and notes' },
];

const initialDatasetState = (): Record<DatasetKey, DatasetState> => ({
  cashBooks: { fileName: '', records: 0, error: null, payload: [] },
  expenseGroups: { fileName: '', records: 0, error: null, payload: [] },
  monthlyPlans: { fileName: '', records: 0, error: null, payload: [] },
  expenses: { fileName: '', records: 0, error: null, payload: [] },
});

const ImportDataPage: FC = () => {
  const [datasets, setDatasets] = useState<Record<DatasetKey, DatasetState>>(initialDatasetState);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [progress, setProgress] = useState(0);

  const allLoaded = useMemo(
    () => DATASETS.every(({ key }) => datasets[key].fileName && !datasets[key].error),
    [datasets],
  );

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>, key: DatasetKey) => {
    const file = event.target.files?.[0];
    if (!file) {
      setDatasets((prev) => ({
        ...prev,
        [key]: { ...initialDatasetState()[key], error: null },
      }));
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        throw new Error('JSON must be an array of records');
      }
      setDatasets((prev) => ({
        ...prev,
        [key]: {
          fileName: file.name,
          records: parsed.length,
          payload: parsed,
          error: null,
        },
      }));
    } catch (error) {
      setDatasets((prev) => ({
        ...prev,
        [key]: {
          fileName: file.name,
          records: 0,
          payload: [],
          error: error instanceof Error ? error.message : 'Unable to read JSON file',
        },
      }));
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!allLoaded) {
      setStatus('error');
      setStatusMessage('Please provide valid JSON files for all datasets before importing.');
      return;
    }
    try {
      setStatus('loading');
      setStatusMessage('Uploading data…');
      setProgress(25);

      const payload = DATASETS.reduce<Record<DatasetKey, unknown[]>>(
        (acc, { key }) => ({
          ...acc,
          [key]: datasets[key].payload,
        }),
        { cashBooks: [], expenseGroups: [], monthlyPlans: [], expenses: [] },
      );

      setProgress(55);
      await importData(payload as {
        cashBooks: CashBook[];
        expenseGroups: ExpenseGroup[];
        monthlyPlans: MonthlyPlan[];
        expenses: Expense[];
      });
      setProgress(100);
      setStatus('success');
      setStatusMessage('Data imported successfully.');
    } catch (error) {
      setStatus('error');
      setStatusMessage(error instanceof Error ? error.message : 'Import failed. Please try again.');
    } finally {
      setTimeout(() => setProgress(0), 500);
    }
  };

  const resetForm = () => {
    setDatasets(initialDatasetState());
    setStatus('idle');
    setStatusMessage('');
    setProgress(0);
  };

  return (
    <div className="page">
      <section className="card">
        <header className="card-header">
          <h2 className="card-title">Import data</h2>
          <span className="badge badge-soft">Advanced</span>
        </header>
        <p className="card-subtitle">
          Replace the current JSON datasets with files exported from another environment. All existing data will be
          overwritten.
        </p>
        <form className="form-grid" onSubmit={handleSubmit}>
          {DATASETS.map(({ key, label, description }) => {
            const dataset = datasets[key];
            return (
              <label key={key} className="form-field">
                <span className="form-label">
                  {label}
                  <span className="form-helper">{description}</span>
                </span>
                <input
                  className="form-input"
                  type="file"
                  accept="application/json"
                  onChange={(event) => handleFileChange(event, key)}
                />
                {dataset.fileName ? (
                  <span className="form-hint">
                    {dataset.error
                      ? `Error: ${dataset.error}`
                      : `${dataset.fileName} · ${dataset.records} record${dataset.records === 1 ? '' : 's'} ready`}
                  </span>
                ) : (
                  <span className="form-hint">Awaiting file…</span>
                )}
              </label>
            );
          })}

          <div className="form-actions">
            <button className="ghost-button" type="button" onClick={resetForm} disabled={status === 'loading'}>
              Clear selection
            </button>
            <button className="primary-button" type="submit" disabled={status === 'loading'}>
              {status === 'loading' ? 'Importing…' : 'Import data'}
            </button>
          </div>
        </form>
        {progress > 0 && (
          <div className="progress-card import-progress">
            <div className="progress-meta">
              <strong>Processing import</strong>
              <span>{progress}%</span>
            </div>
            <div className="progress-track">
              <span className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
        {status !== 'idle' && statusMessage && (
          <div className={`form-info ${status === 'error' ? 'form-warning' : ''}`}>
            <span>{statusMessage}</span>
          </div>
        )}
      </section>
      <section className="card">
        <header className="card-header">
          <h2 className="card-title">How it works</h2>
        </header>
        <ul className="info-list">
          <li>
            <span>Format</span>
            <strong>Upload four JSON files exported from this app.</strong>
          </li>
          <li>
            <span>Validation</span>
            <strong>Each file must contain an array of records.</strong>
          </li>
          <li>
            <span>Overwrite</span>
            <strong>Existing data is replaced entirely.</strong>
          </li>
        </ul>
      </section>
    </div>
  );
};

export default ImportDataPage;
