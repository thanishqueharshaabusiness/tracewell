import { Router, Request, Response } from 'express';
import { callClaude, streamClaude } from '../services/claude';
import { supabase } from '../services/supabase';
import { calculateESGScore } from '../services/scoring';
import { ESGInputData, ExtractedField } from '../types';

const router = Router();

router.post('/score', async (req: Request, res: Response) => {
  const { companyId } = req.body;
  if (!companyId) { res.status(400).json({ error: 'companyId required' }); return; }

  const [companyRes, fieldsRes, cachedRes] = await Promise.all([
    supabase.from('companies').select('*').eq('id', companyId).single(),
    supabase.from('extracted_fields').select('*').eq('company_id', companyId),
    supabase.from('esg_scores').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(1),
  ]);

  if (companyRes.error) { res.status(404).json({ error: 'Company not found' }); return; }
  const company = companyRes.data;
  const fields: ExtractedField[] = (fieldsRes.data || []).map((f) => ({
    ...f,
    value: f.value?.v ?? f.value,
  }));

  // Build ESGInputData from confirmed fields
  const data: Partial<ESGInputData> = {};
  for (const field of fields) {
    if (field.source === 'document_parsed' && !field.userConfirmed) continue;
    (data as Record<string, unknown>)[field.fieldKey] = field.value;
  }

  const scoreResult = calculateESGScore({
    data,
    extractedFields: fields,
    industry: company.industry,
    size: company.size,
  });

  // Check cache — don't re-call Claude if score is same
  const cached = cachedRes.data?.[0];
  if (cached && Math.abs(cached.scores?.overall - scoreResult.overall) < 1) {
    res.json({ ...cached.scores, interpretation: cached.interpretation });
    return;
  }

  // Generate interpretation
  const eAvg = 50; const sAvg = 50; const gAvg = 50;
  const interpretPrompt = `Company: ${company.name}, ${company.industry}, ${company.size} employees, ${company.country}
ESG Scores: E ${scoreResult.environmental}/100 (sector avg ~${eAvg}), S ${scoreResult.social}/100 (sector avg ~${sAvg}), G ${scoreResult.governance}/100 (sector avg ~${gAvg})
Overall: ${scoreResult.overall}/100, ~${scoreResult.percentileRank}th percentile
Data quality: ${scoreResult.dataQualityScore}% of inputs are document-verified
Top gaps: ${scoreResult.gaps.slice(0, 3).join(', ')}

Write a 3-paragraph interpretation, one per pillar (Environmental, Social, Governance), 2-3 sentences each, pillar name bolded at the start. Be direct. If data quality is below 60%, note that the score reliability is provisional.`;

  const interpretation = await callClaude('You are an ESG analyst writing concise score interpretations.', interpretPrompt);
  scoreResult.interpretation = interpretation;

  // Cache
  await supabase.from('esg_scores').insert({
    company_id: companyId,
    scores: scoreResult,
    interpretation,
    data_quality_score: scoreResult.dataQualityScore,
  });

  res.json(scoreResult);
});

router.post('/recommendations', async (req: Request, res: Response) => {
  const { companyId } = req.body;
  if (!companyId) { res.status(400).json({ error: 'companyId required' }); return; }

  const [companyRes, scoreRes, cachedRes] = await Promise.all([
    supabase.from('companies').select('*').eq('id', companyId).single(),
    supabase.from('esg_scores').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(1),
    supabase.from('recommendations').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(1),
  ]);

  if (companyRes.error) { res.status(404).json({ error: 'Company not found' }); return; }
  const company = companyRes.data;
  const scores = scoreRes.data?.[0]?.scores;

  if (cachedRes.data?.[0] && scores) {
    res.json({ items: cachedRes.data[0].items, statusMap: cachedRes.data[0].status_map });
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
  await supabase.from('recommendations').insert({ company_id: companyId, items, status_map: {} });

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

router.post('/report-narrative', async (req: Request, res: Response) => {
  const { companyId } = req.body;
  if (!companyId) { res.status(400).json({ error: 'companyId required' }); return; }

  const [companyRes, scoreRes, fieldsRes] = await Promise.all([
    supabase.from('companies').select('*').eq('id', companyId).single(),
    supabase.from('esg_scores').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(1),
    supabase.from('extracted_fields').select('*').eq('company_id', companyId),
  ]);

  const company = companyRes.data;
  const scores = scoreRes.data?.[0]?.scores;
  const fields = fieldsRes.data || [];

  const fieldsSummary = fields
    .filter((f) => f.user_confirmed)
    .slice(0, 10)
    .map((f) => `${f.field_key}: ${f.value?.v ?? f.value} ${f.unit || ''} (${f.confidence} confidence)`)
    .join('\n');

  const prompt = `Company: ${company?.name}, ${company?.industry}, ${company?.size} employees, ${company?.country}
ESG Scores: E ${scores?.environmental}/100, S ${scores?.social}/100, G ${scores?.governance}/100
Verified data points:
${fieldsSummary}

Generate report narrative sections as JSON:
{
  "strategy": "200-word paragraph describing ESG strategy",
  "targets": "150-word paragraph describing measurable targets",
  "governance": "150-word paragraph describing governance approach"
}
Ground the narrative in the actual data provided. JSON only.`;

  const raw = await callClaude('You are an ESG report writer. Return only valid JSON.', prompt);
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) { res.status(500).json({ error: 'Failed to parse narrative' }); return; }

  res.json(JSON.parse(jsonMatch[0]));
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
