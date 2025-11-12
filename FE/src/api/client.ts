// const API_BASE_URL = process.env.REACT_APP_API_BASE_URL ?? 'https://budgetapp-ax3v.onrender.com/';
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL ?? 'http://15.207.9.188:4000/';
// const API_BASE_URL = process.env.REACT_APP_API_BASE_URL ?? 'http://localhost:4000';

type RequestOptions = RequestInit & {
  params?: Record<string, string | number | undefined | null>;
  successMessage?: string;
};

const buildUrl = (path: string, params?: RequestOptions['params']) => {
  const url = new URL(path, API_BASE_URL);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      url.searchParams.set(key, String(value));
    });
  }
  return url.toString();
};

const emitSuccessToast = (method: string, overrideMessage?: string) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return;
  const defaultMessages: Record<string, string> = {
    POST: 'Saved successfully',
    PUT: 'Updated successfully',
    PATCH: 'Updated successfully',
    DELETE: 'Deleted successfully',
  };
  const message = overrideMessage ?? defaultMessages[method] ?? 'Done';
  window.dispatchEvent(
    new CustomEvent('app:toast', {
      detail: { id: Date.now(), type: 'success', message },
    }),
  );
};

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { params, headers, successMessage, ...rest } = options;
  const method = (rest.method ?? 'GET').toUpperCase();

  const response = await fetch(buildUrl(path, params), {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(errorText || response.statusText || 'Request failed');
  }

  if (response.status === 204 || response.status === 205) {
    if (typeof window !== 'undefined') {
      emitSuccessToast(method, successMessage);
    }
    return undefined as T;
  }

  const raw = await response.text();
  if (!raw) {
    if (typeof window !== 'undefined') {
      emitSuccessToast(method, successMessage);
    }
    return undefined as T;
  }

  try {
    const parsed = JSON.parse(raw) as T;
    if (typeof window !== 'undefined') {
      emitSuccessToast(method, successMessage);
    }
    return parsed;
  } catch {
    throw new Error('Failed to parse server response');
  }
}

export function requestVoid(path: string, options: RequestOptions = {}) {
  return request<void>(path, options);
}
