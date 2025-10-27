import { FC } from 'react';
import { useNavigate } from 'react-router-dom';

type AppHeaderProps = {
  title: string;
  onToggleSidebar: () => void;
};

const AppHeader: FC<AppHeaderProps> = ({ title, onToggleSidebar }) => {
  const navigate = useNavigate();

  return (
    <header className="app-header">
      <div className="header-left">
        <button
          className="header-button icon"
          type="button"
          aria-label="Toggle navigation"
          onClick={onToggleSidebar}
        >
          ☰
        </button>
        <button className="header-button icon" type="button" aria-label="Go back" onClick={() => navigate(-1)}>
          ←
        </button>
        <button
          className="header-button icon"
          type="button"
          aria-label="Go to dashboard"
          onClick={() => navigate('/dashboard')}
        >
          ⌂
        </button>
      </div>
      <div className="header-title-group">
        <h1 className="app-title">{title}</h1>
        <button
          className="header-button primary"
          type="button"
          aria-label="Add expense"
          onClick={() => navigate('/add-expense')}
        >
          +
        </button>
      </div>
    </header>
  );
};

export default AppHeader;
