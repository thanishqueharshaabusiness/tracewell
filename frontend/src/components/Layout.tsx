import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';

const NAV = [
  { to: '/upload', label: 'Documents' },
  { to: '/review', label: 'Review' },
  { to: '/score', label: 'Score' },
  { to: '/benchmarks', label: 'Benchmarks' },
  { to: '/recommendations', label: 'Actions' },
  { to: '/report', label: 'Report' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, company } = useApp();
  const location = useLocation();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-umber text-white px-6 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <span className="text-xl font-semibold tracking-tight">Tracewell</span>
          <span className="text-xs text-moss-light bg-forest/40 px-2 py-0.5 rounded-full">ESG</span>
        </Link>
        {company && (
          <nav className="hidden md:flex items-center gap-1">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  location.pathname === n.to
                    ? 'bg-forest text-white'
                    : 'text-moss-light hover:bg-forest/30'
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        )}
        <div className="flex items-center gap-3">
          {company && (
            <span className="text-sm text-moss-light hidden sm:block">{company.name}</span>
          )}
          {user ? (
            <button
              onClick={() => supabase.auth.signOut()}
              className="text-sm text-moss-light hover:text-white transition-colors"
            >
              Sign out
            </button>
          ) : (
            <Link to="/auth" className="text-sm text-moss-light hover:text-white transition-colors">
              Sign in
            </Link>
          )}
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="bg-umber/20 border-t border-sand px-6 py-4 text-center text-xs text-taupe">
        Tracewell · Document-grounded ESG verification · All benchmark data labeled by source
      </footer>
    </div>
  );
}
