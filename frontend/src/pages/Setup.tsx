import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';

const INDUSTRIES = [
  'manufacturing', 'technology', 'retail', 'professional_services',
  'construction', 'healthcare', 'agriculture', 'energy', 'finance', 'other',
];
const SIZES = [
  { value: 'micro', label: 'Micro (< 10 employees)' },
  { value: 'small', label: 'Small (10–49 employees)' },
  { value: 'medium', label: 'Medium (50–249 employees)' },
];

export default function Setup() {
  const { user, setCompany } = useApp();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', industry: 'technology', size: 'small', country: 'US' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { navigate('/auth'); return; }
    setLoading(true);
    setError('');
    try {
      const company = await api.companies.create({ userId: user.id, ...form }) as never;
      setCompany(company);
      navigate('/upload');
    } catch (err) {
      setError((err as Error).message);
    }
    setLoading(false);
  };

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="max-w-xl mx-auto px-6 py-16">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-bark-brown mb-2">Set up your company</h1>
        <p className="text-taupe">This helps Tracewell benchmark your ESG performance against relevant peers.</p>
      </div>
      <div className="card">
        {error && <div className="bg-error-rust/10 text-error-rust px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="label">Company name</label>
            <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} required placeholder="Acme Corp" />
          </div>
          <div>
            <label className="label">Industry</label>
            <select className="input" value={form.industry} onChange={(e) => set('industry', e.target.value)}>
              {INDUSTRIES.map((i) => (
                <option key={i} value={i}>{i.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Company size</label>
            <select className="input" value={form.size} onChange={(e) => set('size', e.target.value)}>
              {SIZES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Country (ISO code)</label>
            <input className="input" value={form.country} onChange={(e) => set('country', e.target.value)} maxLength={3} placeholder="US" />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Creating…' : 'Continue to document upload →'}
          </button>
        </form>
      </div>
    </div>
  );
}
