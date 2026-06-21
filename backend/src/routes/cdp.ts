import { Router, Request, Response } from 'express';
import { supabase } from '../services/supabase';
import { callClaude } from '../services/claude';
import { getLatestSessionId, getLatestSessionDocumentIds } from '../services/session';
import cdpQuestions from '../data/cdpQuestions.json';

const router = Router();

const CDP_SYSTEM_PROMPT = `You are mapping a company's verified ESG data to the CDP Climate Change Minimum Questionnaire.

You will be given: company profile, all extracted/confirmed ESG fields with their sources, and a list of CDP questions.

Rules:
- If a question's dataMapping resolves to actual data, draft a concise answer using ONLY that data. State the number and its source plainly. No marketing language, no embellishment.
- If no dataMapping or the mapped field is empty/null, return status "gap" and use the question's gapHint to explain what's needed in plain language a non-expert would understand.
- If partial data exists (e.g., Scope 1 known but Scope 2 missing), return status "partial" with what's known and what's missing clearly stated.
- NEVER invent a target, initiative, percentage, or policy that isn't in the provided data.
- For "calculated" answerType, show your calculation explicitly (e.g., "1945.3 + 326.5 = 2271.8 tCO2e / $4.2M revenue = 0.54 tCO2e per $1,000 revenue").
- For questions with a defaultAnswer, use that default if no specific data contradicts it.
- For "userInput" answerType (like C16.1), return status "gap" — these must always be filled by the user.
- Style matches real CDP disclosures: direct, factual, specific numbers, no fluff.

CRITICAL: For gap questions, be honest and specific about what's missing. Never fabricate. A clean gap notice is better than a hallucinated answer.

Return JSON only:
{
  "responses": [
    {
      "questionCode": "C6.1",
      "status": "answered",
      "answer": "1,945.3 tCO2e (from utility bill, page 2)",
      "sourceLabel": "Prairie Edge Utilities statement, Jan-Dec 2024, page 2",
      "confidence": "high",
      "gapExplanation": null
    }
  ]
}`;

interface CDPQuestion {
  code: string;
  text: string;
  answerType: string;
  dataMapping?: string | null;
  gapHint?: string;
  defaultAnswer?: string;
  conditionalOn?: string;
  neverAutoGenerate?: boolean;
}

interface CDPModule {
  code: string;
  name: string;
  conditionalModule?: string;
  questions: CDPQuestion[];
}

router.post('/map', async (req: Request, res: Response) => {
  const { companyId, respondingToCustomerRequest = false } = req.body;
  if (!companyId) { res.status(400).json({ error: 'companyId required' }); return; }

  // Check cache — only use if session matches
  const sessionId = await getLatestSessionId(companyId);
  const { data: cached } = await supabase
    .from('cdp_responses')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (cached && cached.length > 0) {
    const cacheSession = (cached[0] as Record<string, unknown>).session_id;
    if (!cacheSession || cacheSession === sessionId) {
      console.log(`[cdp] Returning ${cached.length} cached responses for session=${sessionId}`);
      res.json({ responses: cached, fromCache: true });
      return;
    }
    // Session changed — clear stale cache
    console.log(`[cdp] Session changed (${cacheSession} → ${sessionId}), clearing CDP cache`);
    await supabase.from('cdp_responses').delete().eq('company_id', companyId);
  }

  const currentSessionId = await getLatestSessionId(companyId);
  const docIds = currentSessionId ? await getLatestSessionDocumentIds(companyId) : [];

  console.log(`[cdp] company=${companyId} session=${currentSessionId} docIds=${docIds.length}`);

  const companyRes = await supabase.from('companies').select('*').eq('id', companyId).single();
  if (companyRes.error) { res.status(404).json({ error: 'Company not found' }); return; }
  const company = companyRes.data;

  // Scope fields to current session only
  let fieldsQuery = supabase
    .from('extracted_fields')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_confirmed', true);

  if (docIds.length > 0) {
    fieldsQuery = supabase
      .from('extracted_fields')
      .select('*')
      .eq('company_id', companyId)
      .eq('user_confirmed', true)
      .or(`document_id.in.(${docIds.join(',')}),source.eq.self_reported`);
  }

  const { data: fieldsData } = await fieldsQuery;
  const fields = fieldsData || [];
  console.log(`[cdp] ${fields.length} confirmed fields for CDP mapping`);

  const fieldsSummary = fields.map((f) => ({
    fieldKey: f.field_key,
    value: f.value?.v ?? f.value,
    unit: f.unit,
    source: f.extracted_quote && f.extracted_quote !== 'Manually entered'
      ? f.extracted_quote
      : 'Self-reported',
    confidence: f.confidence,
  }));

  const applicableModules = (cdpQuestions.modules as CDPModule[]).filter(
    (m) => !m.conditionalModule || (m.conditionalModule === 'respondingToCustomerRequest' && respondingToCustomerRequest)
  );

  const userPrompt = `Company: ${company.name}, ${company.industry}, ${company.size} employees, ${company.country}
Reporting period: ${new Date().getFullYear() - 1} (calendar year)

Confirmed ESG data from uploaded documents:
${JSON.stringify(fieldsSummary, null, 2)}

CDP Questions to answer:
${JSON.stringify(applicableModules, null, 2)}`;

  const raw = await callClaude(CDP_SYSTEM_PROMPT, userPrompt);
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) { res.status(500).json({ error: 'Failed to parse CDP mapping' }); return; }

  const parsed = JSON.parse(jsonMatch[0]);
  const responses = parsed.responses || [];

  // Enrich with question text
  const questionMap: Record<string, CDPQuestion> = {};
  for (const module of applicableModules) {
    for (const q of module.questions) {
      questionMap[q.code] = q;
    }
  }

  const enriched = responses.map((r: Record<string, unknown>) => ({
    ...r,
    questionText: questionMap[r.questionCode as string]?.text || '',
  }));

  // Save to DB
  if (enriched.length > 0) {
    const toInsert = enriched.map((r: Record<string, unknown>) => ({
      company_id: companyId,
      question_code: r.questionCode,
      question_text: r.questionText,
      status: r.status,
      answer: r.answer || null,
      source_label: r.sourceLabel || null,
      confidence: r.confidence || null,
      gap_explanation: r.gapExplanation || null,
      user_edited: false,
      session_id: currentSessionId,
    }));

    await supabase.from('cdp_responses').upsert(toInsert, { onConflict: 'company_id,question_code' });
  }

  res.json({ responses: enriched, fromCache: false });
});

router.patch('/:companyId/:questionCode', async (req: Request, res: Response) => {
  const { companyId, questionCode } = req.params;
  const { answer } = req.body;

  const { data, error } = await supabase
    .from('cdp_responses')
    .update({ answer, status: 'answered', user_edited: true })
    .eq('company_id', companyId)
    .eq('question_code', questionCode)
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

router.delete('/cache/:companyId', async (req: Request, res: Response) => {
  await supabase.from('cdp_responses').delete().eq('company_id', req.params.companyId);
  res.json({ success: true });
});

router.get('/pdf/:companyId', async (req: Request, res: Response) => {
  const { companyId } = req.params;

  const [companyRes, responsesRes] = await Promise.all([
    supabase.from('companies').select('*').eq('id', companyId).single(),
    supabase.from('cdp_responses').select('*').eq('company_id', companyId).order('question_code'),
  ]);

  if (companyRes.error) { res.status(404).json({ error: 'Company not found' }); return; }
  const company = companyRes.data;
  const responses = responsesRes.data || [];

  const html = renderCDPHTML(company, responses);

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

function renderCDPHTML(company: Record<string, string>, responses: Record<string, string>[]): string {
  const answered = responses.filter((r) => r.status === 'answered').length;
  const partial = responses.filter((r) => r.status === 'partial').length;
  const gaps = responses.filter((r) => r.status === 'gap').length;

  const statusColor: Record<string, string> = {
    answered: '#3D5A40',
    partial: '#5B7C8D',
    gap: '#C17A4D',
  };
  const statusLabel: Record<string, string> = {
    answered: '✓ Answered from your data',
    partial: '◐ Partially answered',
    gap: '⚠ Needs additional input',
  };

  const questionsByCode: Record<string, Record<string, string>> = {};
  for (const r of responses) {
    questionsByCode[r.question_code] = r;
  }

  const moduleSections = (cdpQuestions.modules as CDPModule[]).map((module) => {
    const moduleResponses = module.questions
      .map((q) => questionsByCode[q.code])
      .filter(Boolean);
    if (moduleResponses.length === 0) return '';

    return `
      <div class="module">
        <h2>${module.code} — ${module.name}</h2>
        ${moduleResponses.map((r) => `
          <div class="question-block" style="border-left:4px solid ${statusColor[r.status] || '#8B7E6D'}">
            <div class="question-header">
              <span class="question-code">${r.question_code}</span>
              <span class="status-badge" style="background:${statusColor[r.status] || '#8B7E6D'}">${statusLabel[r.status] || r.status}</span>
            </div>
            <p class="question-text">${r.question_text}</p>
            ${r.status === 'gap'
              ? `<p class="gap-text">${r.gap_explanation || 'No data available for this question.'}</p>`
              : `<p class="answer-text">${r.answer || ''}</p>
                 ${r.source_label ? `<p class="source-line">Source: ${r.source_label}${r.confidence ? ` · Confidence: ${r.confidence}` : ''}</p>` : ''}`
            }
          </div>
        `).join('')}
      </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body{font-family:Arial,sans-serif;color:#4A3F35;background:#FDFCFA;padding:40px;max-width:900px;margin:0 auto}
  .cover{text-align:center;padding:80px 0;border-bottom:3px solid #3D5A40;margin-bottom:40px}
  .cover h1{color:#3D5A40;font-size:32px;margin:0 0 12px}
  .cover p{color:#8B7E6D;margin:4px 0}
  .summary-bar{background:#F5F1E8;border:1px solid #E8DFD0;border-radius:8px;padding:20px;margin-bottom:40px;display:flex;justify-content:space-around;text-align:center}
  .summary-number{font-size:28px;font-weight:bold}
  .module{margin-bottom:40px}
  .module h2{color:#3D5A40;border-bottom:2px solid #D8E0CC;padding-bottom:8px;font-size:18px}
  .question-block{background:white;padding:16px 20px;margin-bottom:12px;border-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,0.06)}
  .question-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
  .question-code{font-weight:bold;color:#6B4F3B;font-size:13px}
  .status-badge{color:white;font-size:11px;padding:3px 10px;border-radius:12px}
  .question-text{font-weight:600;margin:8px 0;font-size:14px}
  .answer-text{margin:8px 0;line-height:1.6;font-size:14px}
  .source-line{font-size:11px;color:#8B7E6D;font-style:italic;margin:4px 0}
  .gap-text{font-size:13px;color:#A85C3F;background:#FDF3EC;padding:10px;border-radius:4px;margin:8px 0}
  .footer-note{text-align:center;color:#8B7E6D;font-size:11px;margin-top:60px;border-top:1px solid #E8DFD0;padding-top:20px}
  @media print{body{padding:20px}.module{page-break-inside:avoid}}
</style>
</head>
<body>
<div class="cover">
  <h1>CDP Climate Change Disclosure</h1>
  <p>${company.name} · ${company.industry?.replace(/_/g, ' ')} · ${company.country}</p>
  <p>Reporting Year: ${new Date().getFullYear() - 1}</p>
  <p style="font-size:12px;color:#8B7E6D;margin-top:16px">Draft prepared by Tracewell — for review prior to CDP portal submission</p>
</div>
<div class="summary-bar">
  <div><div class="summary-number" style="color:#3D5A40">${answered}</div><div>Answered</div></div>
  <div><div class="summary-number" style="color:#5B7C8D">${partial}</div><div>Partial</div></div>
  <div><div class="summary-number" style="color:#C17A4D">${gaps}</div><div>Need Input</div></div>
</div>
${moduleSections}
<p class="footer-note">Generated by Tracewell · Every answer is sourced from uploaded documents or explicitly marked self-reported. No figures were estimated or fabricated.</p>
</body>
</html>`;
}

export default router;
