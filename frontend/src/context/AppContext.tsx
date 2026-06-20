import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Company } from '../lib/types';
import type { User } from '@supabase/supabase-js';

interface AppContextValue {
  user: User | null;
  company: Company | null;
  setCompany: (c: Company | null) => void;
  loading: boolean;
}

const AppContext = createContext<AppContextValue>({
  user: null,
  company: null,
  setCompany: () => {},
  loading: true,
});

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    const stored = localStorage.getItem('tracewell_company');
    if (stored) {
      try { setCompany(JSON.parse(stored)); } catch {}
    }

    return () => listener.subscription.unsubscribe();
  }, []);

  const handleSetCompany = (c: Company | null) => {
    setCompany(c);
    if (c) localStorage.setItem('tracewell_company', JSON.stringify(c));
    else localStorage.removeItem('tracewell_company');
  };

  return (
    <AppContext.Provider value={{ user, company, setCompany: handleSetCompany, loading }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
