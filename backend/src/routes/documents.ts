import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { supabase } from '../services/supabase';
import { parseDocument, detectDiscrepancies } from '../services/documentParser';

const router = Router();

// Ensure upload dir exists
const UPLOAD_DIR = '/tmp/tracewell-uploads';
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({ dest: UPLOAD_DIR });

async function runParse(filePath: string, fileType: string, docId: string, companyId: string) {
  console.log(`[parse] Starting parse for doc ${docId}, type=${fileType}`);
  try {
    const fields = await parseDocument(filePath, fileType, docId, companyId);
    console.log(`[parse] Claude extracted ${fields.length} fields for doc ${docId}`);

    if (fields.length > 0) {
      await detectDiscrepancies(companyId, fields, docId);

      const toInsert = fields.map((f) => ({
        document_id: docId,
        company_id: companyId,
        field_key: f.fieldKey,
        value: { v: f.value },
        unit: f.unit || null,
        extracted_quote: f.extractedQuote,
        page_reference: f.pageReference || null,
        confidence: f.confidence,
        source: 'document_parsed',
        user_confirmed: false,
        flagged_discrepancy: false,
      }));

      const { error: insertError } = await supabase.from('extracted_fields').insert(toInsert);
      if (insertError) {
        console.error(`[parse] Insert error for doc ${docId}:`, insertError);
        await supabase.from('documents').update({ parse_status: 'failed' }).eq('id', docId);
        return;
      }
      console.log(`[parse] Successfully saved ${fields.length} fields for doc ${docId}`);
    } else {
      console.log(`[parse] No fields extracted for doc ${docId} — marking parsed anyway`);
    }

    await supabase.from('documents').update({ parse_status: 'parsed' }).eq('id', docId);
  } catch (err) {
    console.error(`[parse] Fatal error for doc ${docId}:`, err);
    await supabase.from('documents').update({ parse_status: 'failed' }).eq('id', docId);
  } finally {
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
  }
}

router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  const { companyId } = req.body;
  if (!companyId || !req.file) {
    res.status(400).json({ error: 'companyId and file required' });
    return;
  }

  const ext = path.extname(req.file.originalname).toLowerCase().replace('.', '');
  const fileType = ['pdf', 'xlsx', 'xls', 'csv', 'png', 'jpg', 'jpeg'].includes(ext) ? ext : 'pdf';

  const { data: doc, error: docError } = await supabase
    .from('documents')
    .insert({
      company_id: companyId,
      filename: req.file.originalname,
      file_type: fileType,
      storage_url: req.file.path,
      parse_status: 'processing',
    })
    .select()
    .single();

  if (docError || !doc) {
    console.error('[upload] Failed to create document record:', docError);
    res.status(500).json({ error: docError?.message || 'Failed to create document record' });
    return;
  }

  res.json({ documentId: doc.id, status: 'processing' });

  // Parse in background
  setImmediate(() => runParse(req.file!.path, fileType, doc.id, companyId));
});

router.get('/status/:documentId', async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from('documents')
    .select('id, parse_status, filename')
    .eq('id', req.params.documentId)
    .single();

  if (error) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(data);
});

router.get('/company/:companyId', async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('company_id', req.params.companyId)
    .order('uploaded_at', { ascending: false });

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data || []);
});

router.delete('/:documentId', async (req: Request, res: Response) => {
  const { documentId } = req.params;
  console.log(`[delete] Deleting document ${documentId}`);

  const { error: fieldsError } = await supabase
    .from('extracted_fields')
    .delete()
    .eq('document_id', documentId);

  if (fieldsError) console.error('[delete] Fields delete error:', fieldsError);

  const { error: docError } = await supabase
    .from('documents')
    .delete()
    .eq('id', documentId);

  if (docError) {
    console.error('[delete] Document delete error:', docError);
    res.status(500).json({ error: docError.message });
    return;
  }

  res.json({ success: true });
});

export default router;
