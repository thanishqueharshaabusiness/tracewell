import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { useApp } from '../context/AppContext';
import type { Company } from '../lib/types';

export default function Auth() {
  const { setCompany } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'sign_in' | 'sign_up'>('sign_in');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (mode === 'sign_up') {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
      else setMessage('Check your email to confirm your account.');
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
      } else {
        // Resume the most recent company instead of creating a duplicate via /setup
        try {
          const companies = await api.companies.listByUser(data.user.id) as Company[];
          if (companies.length > 0) {
            setCompany(companies[0]);
            navigate('/upload');
          } else {
            navigate('/setup');
          }
        } catch {
          navigate('/setup');
        }
      }
    }
    setLoading(false);
  };

  return (
    <div className="max-w-md mx-auto px-6 py-20">
      <div className="card">
        <h2 className="text-2xl font-semibold text-bark-brown mb-6">
          {mode === 'sign_in' ? 'Sign in to Tracewell' : 'Create your account'}
        </h2>
        {message && (
          <div className="bg-moss-light text-forest px-4 py-3 rounded-lg text-sm mb-4">{message}</div>
        )}
        {error && (
          <div className="bg-error-rust/10 text-error-rust px-4 py-3 rounded-lg text-sm mb-4">{error}</div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Loading…' : mode === 'sign_in' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        <p className="text-center text-sm text-taupe mt-4">
          {mode === 'sign_in' ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={() => setMode(mode === 'sign_in' ? 'sign_up' : 'sign_in')}
            className="text-forest underline"
          >
            {mode === 'sign_in' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}
