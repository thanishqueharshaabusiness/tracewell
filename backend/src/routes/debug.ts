import { Router, Request, Response } from 'express';
import { supabase } from '../services/supabase';
import { callClaude } from '../services/claude';

const router = Router();

// Test full pipeline without a file
router.post('/test-extraction/:companyId', async (req: Request, res: Response) => {
  const { companyId } = req.params;
  const results: Record<string, unknown> = {};

  // 1. Test Supabase read
  try {
    const { data, error } = await supabase.from('companies').select('id, name').eq('id', companyId).single();
    results.supabase_read = error ? { error: error.message, code: error.code } : { ok: true, company: data?.name };
  } catch (e) {
    results.supabase_read = { error: String(e) };
  }

  // 2. Test Claude
  try {
    const text = await callClaude(
      'You are an ESG extraction specialist. Only use these exact fieldKey values: scope1Emissions, energyConsumption, renewableEnergyPct, totalHeadcount. Return JSON only: {"extractedFields": [{"fieldKey": "energyConsumption", "value": 45200, "unit": "kWh", "extractedQuote": "test", "pageReference": "p1", "confidence": "high"}]}',
      'Test document: electricity consumption 45,200 kWh, scope 1 emissions 287 tCO2e, 120 employees.'
    );
    const match = text.match(/\{[\s\S]*\}/);
    results.claude = match ? { ok: true, fieldsFound: JSON.parse(match[0]).extractedFields?.length } : { ok: false, raw: text.slice(0, 200) };
  } catch (e) {
    results.claude = { error: String(e) };
  }

  // 3. Test Supabase insert into extracted_fields
  try {
    const testField = {
      document_id: '00000000-0000-0000-0000-000000000001',
      company_id: companyId,
      field_key: 'energyConsumption',
      value: { v: 45200 },
      unit: 'kWh',
      extracted_quote: 'Test insert from debug endpoint',
      confidence: 'high',
      source: 'document_parsed',
      user_confirmed: false,
      flagged_discrepancy: false,
    };
    const { data, error } = await supabase.from('extracted_fields').insert(testField).select().single();
    if (error) {
      results.supabase_insert = { error: error.message, code: error.code, details: error.details };
    } else {
      results.supabase_insert = { ok: true, id: data?.id };
      // Clean up test record
      await supabase.from('extracted_fields').delete().eq('id', data.id);
    }
  } catch (e) {
    results.supabase_insert = { error: String(e) };
  }

  res.json(results);
});

export default router;
