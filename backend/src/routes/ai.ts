import { Router, Request, Response } from 'express';
import { callClaude } from '../services/claude';
import { supabase } from '../services/supabase';
import { calculateESGScore } from '../services/scoring';
import { getLatestSessionDocumentIds, getLatestSessionId } from '../services/session';
import { ESGInputData, ExtractedField } from '../types';

const router = Router();

/**
 * Fetches confirmed extracted fields scoped to the latest session for a company.
 * Includes self-reported fields (no session dependency).
 * Logs company_id and session for audit.
 */
async function getScopedFields(companyId: string): Promise<ExtractedField[]> {
  const sessionId = await getLatestSessionId(companyId);
  const docIds = sessionId ? await getLatestSessionDocumentIds(companyId) : [];

  console.log(`[scope] company=${companyId} session=${sessionId} docIds=${docIds.length}`);

  let query;
  if (docIds.length > 0) {
    query = supabase
      .from('extracted_fields')
      .select('*')
      .eq('company_id', companyId)
      .or(`document_id.in.(${docIds.join(',')}),source.eq.self_reported`);
  } else {
    query = supabase
      .from('extracted_fields')
      .select('*')
      .eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (error) {
    console.error(`[scope] Error fetching fields for company=${companyId}:`, error.message);
    return [];
  }

  const fields = (data || []).map((f) => ({ ...f, value: f.value?.v ?? f.value }));
  console.log(`[scope] Found ${fields.length} total, ${fields.filter((f: ExtractedField) => f.userConfirmed).length} confirmed`);
  return fields;
}

router.post('/score', async (req: Request, res: Response) => {
  const { companyId } = req.body;
  if (!companyId) { res.status(400).json({ error: 'companyId required' }); return; }

  const [companyRes, sessionId] = await Promise.all([
    supabase.from('companies').select('*').eq('id', companyId).single(),
    getLatestSessionId(companyId),
  ]);

  if (companyRes.error) { res.status(404).json({ error: 'Company not found' }); return; }
  const company = companyRes.data;

  console.log(`[score] company=${companyId} (${company.name}) session=${sessionId}`);

  const fields = await getScopedFields(companyId);

  // Build ESGInputData from confirmed fields only
  const data: Partial<ESGInputData> = {};
  for (const field of fields) {
    const f = field as unknown as Record<string, unknown>;
    const isConfirmed = f.user_confirmed ?? f.userConfirmed;
    const source = f.source as string;
    if (source === 'document_parsed' && !isConfirmed) continue;
    (data as Record<string, unknown>)[f.field_key as string ?? f.fieldKey as string] = f.value;
  }

  console.log(`[score] Building score from ${Object.keys(data).length} confirmed fields`);

  const scoreResult = calculateESGScore({
    data,
    extractedFields: fields,
    industry: company.industry,
    size: company.size,
  });

  // Invalidate cache when session changes — always recalculate
  const { data: cached } = await supabase
    .from('esg_scores')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (cached && Math.abs(cached.scores?.overall - scoreResult.overall) < 1 && cached.scores?.sessionId === sessionId) {
    console.log(`[score] Returning cached score for session=${sessionId}`);
    res.json({ ...cached.scores, interpretation: cached.interpretation });
    return;
  }

  const interpretPrompt = `Company: ${company.name}, ${company.industry}, ${company.size} employees, ${company.country}
ESG Scores: E ${scoreResult.environmental}/100, S ${scoreResult.social}/100, G ${scoreResult.governance}/100
Overall: ${scoreResult.overall}/100, ~${scoreResult.percentileRank}th percentile
Data quality: ${scoreResult.dataQualityScore}% document-verified
Top gaps: ${scoreResult.gaps.slice(0, 3).join(', ')}

Write a 3-paragraph interpretation, one per pillar (Environmental, Social, Governance), 2-3 sentences each, pillar name bolded at the start. Be direct. If data quality is below 60%, note that the score reliability is provisional.`;

  const interpretation = await callClaude('You are an ESG analyst writing concise score interpretations.', interpretPrompt);
  scoreResult.interpretation = interpretation;

  // Store with session reference so cache invalidates on new session
  await supabase.from('esg_scores').insert({
    company_id: companyId,
    scores: { ...scoreResult, sessionId },
    interpretation,
    data_quality_score: scoreResult.dataQualityScore,
  });

  res.json(scoreResult);
});

router.post('/recommendations', async (req: Request, res: Response) => {
  const { companyId } = req.body;
  if (!companyId) { res.status(400).json({ error: 'companyId required' }); return; }

  const [companyRes, scoreRes] = await Promise.all([
    supabase.from('companies').select('*').eq('id', companyId).single(),
    supabase.from('esg_scores').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(1),
  ]);

  if (companyRes.error) { res.status(404).json({ error: 'Company not found' }); return; }
  const company = companyRes.data;
  const scores = scoreRes.data?.[0]?.scores;
  const sessionId = await getLatestSessionId(companyId);

  console.log(`[recs] company=${companyId} (${company.name}) session=${sessionId}`);

  // Check cache only if session matches
  const { data: cachedRec } = await supabase
    .from('recommendations')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (cachedRec && (cachedRec as Record<string, unknown>).session_id === sessionId) {
    console.log(`[recs] Returning cached recommendations for session=${sessionId}`);
    res.json({ items: cachedRec.items, statusMap: cachedRec.status_map });
    return;
  }

  const gapList = scores?.gaps?.join(', ') || 'No specific gaps identified';
  const prompt = `Company: ${company.name}, ${company.industry}, ${company.size} employees
Gap profile: ${gapList}
Environmental score: ${scores?.environmental ?? 'unknown'}/100
Social score: ${scores?.social ?? 'unknown'}/100
Governance score: ${scores?.governance ?? 'unknown'}/100

Return JSON array of exactly 5 recommendations:
[{ "pillar": "E|S|G", "title": "", "description": "", "estimatedScoreImpact": 1-15, "difficulty": "low|medium|high", "firstStep": "" }]
Prioritize by impact-to-difficulty ratio. Be specific to their industry. JSON only.`;

  const raw = await callClaude('You are an ESG strategy advisor. Return only valid JSON.', prompt);
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) { res.status(500).json({ error: 'Failed to parse recommendations' }); return; }

  const items = JSON.parse(jsonMatch[0]).map((r: Record<string, unknown>, i: number) => ({ ...r, id: String(i + 1), status: 'pending' }));
  await supabase.from('recommendations').insert({ company_id: companyId, items, status_map: {}, session_id: sessionId });

  res.json({ items, statusMap: {} });
});

router.patch('/recommendations/:companyId/status', async (req: Request, res: Response) => {
  const { itemId, status } = req.body;
  const { data: existing } = await supabase
    .from('recommendations')
    .select('*')
    .eq('company_id', req.params.companyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!existing) { res.status(404).json({ error: 'Not found' }); return; }

  const statusMap = { ...existing.status_map, [itemId]: status };
  await supabase.from('recommendations').update({ status_map: statusMap }).eq('id', existing.id);
  res.json({ statusMap });
});

router.get('/benchmarks/:industry/:size', (req: Request, res: Response) => {
  const benchmarks = require('../data/benchmarks.json') as Record<string, Record<string, unknown>>;
  const industry = req.params['industry'] as string;
  const size = req.params['size'] as string;
  const data = benchmarks[industry]?.[size];
  if (!data) { res.status(404).json({ error: 'No benchmark data for this combination' }); return; }
  res.json(data);
});

export default router;
