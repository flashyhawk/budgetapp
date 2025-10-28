import { useEffect, useState } from 'react';

type ToastState = {
  id: number;
  message: string;
  type: 'success' | 'error';
};

const DISPLAY_DURATION = 3000;

const Toast = () => {
  const [toast, setToast] = useState<ToastState | null>(null);
  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<ToastState>;
      setToast(customEvent.detail);
    };
    window.addEventListener('app:toast', handler as EventListener);
    return () => {
      window.removeEventListener('app:toast', handler as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => {
      setToast(null);
    }, DISPLAY_DURATION);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  if (!toast) return null;

  return (
    <div className="toast-container" role="status" aria-live="polite">
      <div className={`toast toast-${toast.type}`}>
        <span>{toast.message}</span>
      </div>
    </div>
  );
};

export default Toast;
