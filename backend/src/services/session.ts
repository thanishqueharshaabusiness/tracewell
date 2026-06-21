import { supabase } from './supabase';

/**
 * Returns the most recent test_session_id for a company.
 * This is the single source of truth for "current data" within a company.
 */
export async function getLatestSessionId(companyId: string): Promise<string | null> {
  const { data } = await supabase
    .from('documents')
    .select('test_session_id')
    .eq('company_id', companyId)
    .not('test_session_id', 'is', null)
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .single();

  return data?.test_session_id ?? null;
}

/**
 * Returns all extracted_field IDs that belong to the latest session for a company.
 * Used to scope scoring, benchmarks, and CDP mapping.
 */
export async function getLatestSessionDocumentIds(companyId: string): Promise<string[]> {
  const sessionId = await getLatestSessionId(companyId);
  if (!sessionId) return [];

  const { data } = await supabase
    .from('documents')
    .select('id')
    .eq('company_id', companyId)
    .eq('test_session_id', sessionId);

  return (data || []).map((d) => d.id);
}
