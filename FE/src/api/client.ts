const API_BASE_URL = process.env.REACT_APP_API_BASE_URL ?? 'https://budgetapp-ax3v.onrender.com/';
// const API_BASE_URL = process.env.REACT_APP_API_BASE_URL ?? 'http://localhost:4000';

type RequestOptions = RequestInit & {
  params?: Record<string, string | number | undefined | null>;
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

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { params, headers, ...rest } = options;
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

  return response.json() as Promise<T>;
}

export function requestVoid(path: string, options: RequestOptions = {}) {
  return request<void>(path, options);
}
