import { FC, useEffect, useMemo, useState } from 'react';
import { getExpenseGroups, getPlannedVsActual } from '../api/budget';
import type { ExpenseGroup, PlannedVsActualRow } from '../api/types';

const ReportsPage: FC = () => {
  const [chartData, setChartData] = useState<PlannedVsActualRow[]>([]);
  const [groupMap, setGroupMap] = useState<Record<string, ExpenseGroup>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const [rowsResponse, groupsResponse] = await Promise.all([getPlannedVsActual(), getExpenseGroups()]);
        if (!mounted) return;
        setChartData(rowsResponse);
        setGroupMap(
          groupsResponse.reduce<Record<string, ExpenseGroup>>((acc, group) => {
            acc[group.id] = group;
            return acc;
          }, {}),
        );
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError('Unable to load report data.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const displayRows = useMemo(
    () =>
      chartData.map((row) => ({
        ...row,
        label: groupMap[row.groupId]?.name ?? row.groupId,
      })),
    [chartData, groupMap],
  );

  const maxValue = useMemo(() => {
    if (!displayRows.length) return 1;
    return Math.max(...displayRows.map((row) => Math.max(row.planned, row.actual, 1)));
  }, [displayRows]);

  return (
    <div className="page">
      <section className="card">
        <header className="card-header">
          <h2 className="card-title">Reports & insights</h2>
          <span className="badge badge-soft">Live data</span>
        </header>
        <p className="card-subtitle">
          Visualize where money is going. Compare planned budgets to actual spending and track cash flow trends.
        </p>
      </section>

      <section className="card">
        <header className="card-header">
          <h2 className="card-title">Planned vs actual</h2>
        </header>
        {loading ? (
          <p className="card-subtitle">Loading chart data…</p>
        ) : error ? (
          <p className="card-subtitle">{error}</p>
        ) : displayRows.length ? (
          <>
            <div className="chart-legend">
              <span className="legend-item">
                <span className="legend-dot legend-dot-planned" />
                Planned
              </span>
              <span className="legend-item">
                <span className="legend-dot legend-dot-actual" />
                Actual
              </span>
            </div>
            <div className="chart-grid">
              {displayRows.map((row) => (
                <div key={row.groupId} className="chart-row">
                  <div className="chart-label">{row.label}</div>
                  <div className="chart-bars">
                    <span
                      className="chart-bar chart-bar-planned"
                      style={{ width: `${(row.planned / maxValue) * 100}%` }}
                    />
                    <span
                      className="chart-bar chart-bar-actual"
                      style={{ width: `${(row.actual / maxValue) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="card-subtitle">No report data yet. Add budgets and expenses to see insights.</p>
        )}
      </section>

      <section className="card">
        <header className="card-header">
          <h2 className="card-title">Trends</h2>
        </header>
        <div className="trend-grid">
          <div className="trend-card">
            <p className="item-title">Expense trend</p>
            <p className="item-meta">Last 6 months</p>
            <div className="trend-placeholder">
              <span className="trend-line" />
            </div>
          </div>
          <div className="trend-card">
            <p className="item-title">Cash flow</p>
            <p className="item-meta">Inflow vs outflow</p>
            <div className="trend-placeholder trend-stack">
              <span className="trend-block inflow">Inflow</span>
              <span className="trend-block outflow">Outflow</span>
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <header className="card-header">
          <h2 className="card-title">Exports</h2>
        </header>
        <div className="info-box">
          <div>
            <p className="item-title">Share your data</p>
            <p className="item-meta">
              Generate formatted reports for your accountant or family members. Choose between PDF and CSV formats.
            </p>
          </div>
          <button className="primary-button" type="button">
            Create export
          </button>
        </div>
      </section>
    </div>
  );
};

export default ReportsPage;
