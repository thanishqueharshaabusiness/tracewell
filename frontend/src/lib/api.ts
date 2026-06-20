const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  companies: {
    create: (data: { userId: string; name: string; industry: string; size: string; country: string }) =>
      request('/api/companies', { method: 'POST', body: JSON.stringify(data) }),
    get: (id: string) => request(`/api/companies/${id}`),
    listByUser: (userId: string) => request(`/api/companies/user/${userId}`),
  },
  documents: {
    upload: (companyId: string, file: File) => {
      const form = new FormData();
      form.append('companyId', companyId);
      form.append('file', file);
      return fetch(`${API_URL}/api/documents/upload`, { method: 'POST', body: form }).then((r) => r.json());
    },
    status: (documentId: string) => request(`/api/documents/status/${documentId}`),
    listByCompany: (companyId: string) => request(`/api/documents/company/${companyId}`),
  },
  fields: {
    listByCompany: (companyId: string) => request(`/api/fields/company/${companyId}`),
    confirm: (id: string, value?: unknown, unit?: string) =>
      request(`/api/fields/${id}/confirm`, { method: 'PATCH', body: JSON.stringify({ value, unit }) }),
    reject: (id: string) => request(`/api/fields/${id}/reject`, { method: 'PATCH' }),
    addManual: (data: { companyId: string; fieldKey: string; value: unknown; unit?: string }) =>
      request('/api/fields/manual', { method: 'POST', body: JSON.stringify(data) }),
  },
  ai: {
    score: (companyId: string) =>
      request('/api/ai/score', { method: 'POST', body: JSON.stringify({ companyId }) }),
    recommendations: (companyId: string) =>
      request('/api/ai/recommendations', { method: 'POST', body: JSON.stringify({ companyId }) }),
    updateRecommendationStatus: (companyId: string, itemId: string, status: string) =>
      request(`/api/ai/recommendations/${companyId}/status`, { method: 'PATCH', body: JSON.stringify({ itemId, status }) }),
    reportNarrative: (companyId: string) =>
      request('/api/ai/report-narrative', { method: 'POST', body: JSON.stringify({ companyId }) }),
    benchmarks: (industry: string, size: string) => request(`/api/ai/benchmarks/${industry}/${size}`),
  },
};
