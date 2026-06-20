import { Router, Request, Response } from 'express';
import { supabase } from '../services/supabase';

const router = Router();

router.get('/company/:companyId', async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from('extracted_fields')
    .select('*, documents(filename)')
    .eq('company_id', req.params.companyId)
    .order('created_at', { ascending: false });

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data || []);
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
