import { Router, Request, Response } from 'express';
import { supabase } from '../services/supabase';
import { getLatestSessionDocumentIds } from '../services/session';

const router = Router();

router.get('/company/:companyId', async (req: Request, res: Response) => {
  const companyId = req.params['companyId'] as string;
  console.log(`[fields] Fetching for company=${companyId}`);

  // Scope to latest session's documents only
  const docIds = await getLatestSessionDocumentIds(companyId);
  console.log(`[fields] Latest session has ${docIds.length} documents`);

  let query = supabase
    .from('extracted_fields')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  // If we have session documents, filter to them (plus self-reported which have no session)
  if (docIds.length > 0) {
    const idList = docIds.join(',');
    query = supabase
      .from('extracted_fields')
      .select('*')
      .eq('company_id', companyId)
      .or(`document_id.in.(${idList}),source.eq.self_reported`)
      .order('created_at', { ascending: false });
  }

  const { data: fields, error } = await query;
  if (error) {
    console.error(`[fields] Query error:`, error.message);
    res.status(500).json({ error: error.message });
    return;
  }

  if (!fields || fields.length === 0) {
    console.log(`[fields] 0 fields found for company=${companyId}`);
    res.json([]);
    return;
  }

  // Fetch document filenames separately (no FK join)
  const allDocIds = [...new Set(fields.map((f) => f.document_id))].filter(Boolean);
  const { data: docs } = await supabase
    .from('documents')
    .select('id, filename')
    .in('id', allDocIds);

  const docMap = Object.fromEntries((docs || []).map((d) => [d.id, d]));
  const merged = fields.map((f) => ({
    ...f,
    documents: docMap[f.document_id] ? { filename: docMap[f.document_id].filename } : null,
  }));

  console.log(`[fields] Returning ${merged.length} fields for company=${companyId}`);
  res.json(merged);
});

router.patch('/:id/confirm', async (req: Request, res: Response) => {
  const { value, unit } = req.body;
  const update: Record<string, unknown> = { user_confirmed: true };
  if (value !== undefined) update.value = { v: value };
  if (unit !== undefined) update.unit = unit;

  const { data, error } = await supabase
    .from('extracted_fields')
    .update(update)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

router.patch('/:id/reject', async (req: Request, res: Response) => {
  const { error } = await supabase
    .from('extracted_fields')
    .delete()
    .eq('id', req.params.id);

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ success: true });
});

router.post('/manual', async (req: Request, res: Response) => {
  const { companyId, fieldKey, value, unit } = req.body;
  if (!companyId || !fieldKey || value === undefined) {
    res.status(400).json({ error: 'companyId, fieldKey, value required' });
    return;
  }

  const { data, error } = await supabase
    .from('extracted_fields')
    .upsert({
      document_id: '00000000-0000-0000-0000-000000000000',
      company_id: companyId,
      field_key: fieldKey,
      value: { v: value },
      unit: unit || null,
      extracted_quote: 'Manually entered',
      confidence: 'low',
      source: 'self_reported',
      user_confirmed: true,
      flagged_discrepancy: false,
    }, { onConflict: 'company_id,field_key,source' })
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

export default router;
