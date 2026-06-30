import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import type { Company } from '../lib/types';

const NAV = [
  { to: '/upload', label: 'Documents' },
  { to: '/review', label: 'Review' },
  { to: '/score', label: 'Score' },
  { to: '/benchmarks', label: 'Benchmarks' },
  { to: '/recommendations', label: 'Actions' },
  { to: '/report', label: 'Report' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, company, setCompany } = useApp();
  const location = useLocation();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    api.companies.listByUser(user.id)
      .then((list) => setCompanies(list as Company[]))
      .catch(console.error);
  }, [user, company]);

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
            <div className="relative">
              <button
                onClick={() => setSwitcherOpen(!switcherOpen)}
                className="text-sm text-moss-light hover:text-white flex items-center gap-1 transition-colors"
              >
                <span className="hidden sm:block max-w-[160px] truncate">{company.name}</span>
                <span className="text-xs">▾</span>
              </button>
              {switcherOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-white-warm rounded-lg shadow-lg border border-sand z-50 py-1 max-h-80 overflow-y-auto">
                  <div className="px-3 py-2 text-xs text-taupe border-b border-sand">Switch company</div>
                  {companies.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setCompany(c);
                        setSwitcherOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-moss-light/40 transition-colors ${
                        c.id === company.id ? 'text-forest font-medium bg-moss-light/30' : 'text-bark-brown'
                      }`}
                    >
                      <div className="truncate">{c.name}</div>
                      <div className="text-xs text-taupe">{c.industry?.replace(/_/g, ' ')} · {c.size}</div>
                    </button>
                  ))}
                  <Link
                    to="/setup"
                    onClick={() => setSwitcherOpen(false)}
                    className="block px-3 py-2 text-sm text-slate-blue hover:bg-moss-light/40 border-t border-sand"
                  >
                    + New company
                  </Link>
                </div>
              )}
            </div>
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
