import { FC, useMemo, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import './App.css';
import AddExpensePage from './pages/AddExpensePage';
import CashBooksPage from './pages/CashBooksPage';
import DashboardPage from './pages/DashboardPage';
import ExpenseGroupsPage from './pages/ExpenseGroupsPage';
import ExpensesHistoryPage from './pages/ExpensesHistoryPage';
import MonthlyPlannerPage from './pages/MonthlyPlannerPage';
import ReportsPage from './pages/ReportsPage';
import AppHeader from './components/AppHeader';

type PageId =
  | 'dashboard'
  | 'cash-books'
  | 'monthly-planner'
  | 'expense-groups'
  | 'add-expense'
  | 'expenses'
  | 'reports';

type PageConfig = {
  id: PageId;
  label: string;
  path: string;
  element: FC;
};

const pages: PageConfig[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/dashboard', element: DashboardPage },
  { id: 'cash-books', label: 'Cash Books', path: '/cash-books', element: CashBooksPage },
  {
    id: 'monthly-planner',
    label: 'Monthly Planner',
    path: '/monthly-planner',
    element: MonthlyPlannerPage,
  },
  {
    id: 'expense-groups',
    label: 'Expense Groups',
    path: '/expense-groups',
    element: ExpenseGroupsPage,
  },
  { id: 'add-expense', label: 'Add Expense', path: '/add-expense', element: AddExpensePage },
  { id: 'expenses', label: 'Expenses', path: '/expenses', element: ExpensesHistoryPage },
  { id: 'reports', label: 'Reports', path: '/reports', element: ReportsPage },
];

const App: FC = () => {
  const location = useLocation();
  const prefersDesktop = typeof window !== 'undefined' ? window.innerWidth > 900 : true;
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(prefersDesktop);
  const activeConfig = useMemo(() => {
    const match = pages.find((page) => location.pathname.startsWith(page.path));
    return match ?? pages[0];
  }, [location.pathname]);

  const handleNavigate = () => {
    setSidebarOpen(false);
  };

  return (
    <div className={`app-root ${sidebarOpen ? 'sidebar-visible' : 'sidebar-hidden'}`}>
      <AppHeader title={activeConfig.label} onToggleSidebar={() => setSidebarOpen((open) => !open)} />
      <div className="app-shell">
        <aside id="main-sidebar" className={`sidebar ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
          <div className="sidebar-header">
            <span className="sidebar-badge">Budget app</span>
            <h1 className="sidebar-title">Home Budget</h1>
            <p className="sidebar-subtitle">Balance every rupee with clarity.</p>
          </div>
          <nav className="sidebar-nav" aria-label="Primary navigation">
            {pages.map((page) => (
              <NavLink
                key={page.id}
                to={page.path}
                className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
                onClick={handleNavigate}
              >
                <span className="nav-label">{page.label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-footer">
            <p>Need a new feature?</p>
            <button className="ghost-button" type="button">
              Share feedback
            </button>
          </div>
        </aside>

        <div className="main-panel">
          <div className="main-panel-body">
            <main className="app-content">
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                {pages.map((page) => {
                  const Component = page.element;
                  return <Route key={page.id} path={page.path} element={<Component />} />;
                })}
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </main>
            <footer className="app-footer">
              <p>Budgeting made simple · Prototype experience</p>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
