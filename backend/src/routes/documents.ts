import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { supabase } from '../services/supabase';
import { parseDocument, detectDiscrepancies } from '../services/documentParser';

const router = Router();

const UPLOAD_DIR = '/tmp/tracewell-uploads';
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({ dest: UPLOAD_DIR });

async function runParse(filePath: string, fileType: string, docId: string, companyId: string) {
  console.log(`[parse] Starting doc=${docId} company=${companyId} type=${fileType}`);
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

      const { error } = await supabase.from('extracted_fields').insert(toInsert);
      if (error) {
        console.error(`[parse] Insert error doc=${docId}:`, error.message, error.code);
        await supabase.from('documents').update({ parse_status: 'failed' }).eq('id', docId);
        return;
      }
      console.log(`[parse] Saved ${fields.length} fields for doc ${docId}`);
    } else {
      console.log(`[parse] 0 fields extracted for doc ${docId}`);
    }

    await supabase.from('documents').update({ parse_status: 'parsed' }).eq('id', docId);
  } catch (err) {
    console.error(`[parse] Fatal error doc=${docId}:`, err);
    await supabase.from('documents').update({ parse_status: 'failed' }).eq('id', docId);
  } finally {
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
  }
}

// Create a new session ID for a company (called before a fresh upload batch)
router.post('/new-session', async (req: Request, res: Response) => {
  const sessionId = randomUUID();
  res.json({ sessionId });
});

// Reset all data for a company (documents, fields, scores, recommendations, cdp)
router.delete('/reset/:companyId', async (req: Request, res: Response) => {
  const { companyId } = req.params;
  console.log(`[reset] Resetting all data for company=${companyId}`);

  // Order matters — delete dependents first
  await supabase.from('extracted_fields').delete().eq('company_id', companyId);
  await supabase.from('documents').delete().eq('company_id', companyId);
  await supabase.from('esg_scores').delete().eq('company_id', companyId);
  await supabase.from('recommendations').delete().eq('company_id', companyId);
  try { await supabase.from('cdp_responses').delete().eq('company_id', companyId); } catch {}

  console.log(`[reset] Reset complete for company=${companyId}`);
  res.json({ success: true });
});

// Upload a document — requires sessionId in form body
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  const { companyId, sessionId } = req.body;
  if (!companyId || !req.file) {
    res.status(400).json({ error: 'companyId and file required' });
    return;
  }

  const activeSession = sessionId || randomUUID();
  const ext = path.extname(req.file.originalname).toLowerCase().replace('.', '');
  const fileType = ['pdf', 'xlsx', 'xls', 'csv', 'png', 'jpg', 'jpeg'].includes(ext) ? ext : 'pdf';

  console.log(`[upload] company=${companyId} session=${activeSession} file=${req.file.originalname}`);

  const { data: doc, error: docError } = await supabase
    .from('documents')
    .insert({
      company_id: companyId,
      filename: req.file.originalname,
      file_type: fileType,
      storage_url: req.file.path,
      parse_status: 'processing',
      test_session_id: activeSession,
    })
    .select()
    .single();

  if (docError || !doc) {
    console.error('[upload] Failed to create doc record:', docError?.message);
    res.status(500).json({ error: docError?.message || 'Failed to create document record' });
    return;
  }

  res.json({ documentId: doc.id, status: 'processing', sessionId: activeSession });

  setImmediate(() => runParse(req.file!.path, fileType, doc.id, companyId));
});

router.get('/status/:documentId', async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from('documents')
    .select('id, parse_status, filename, test_session_id')
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

// Get session summary for a company
router.get('/sessions/:companyId', async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from('documents')
    .select('test_session_id, uploaded_at, filename')
    .eq('company_id', req.params.companyId)
    .not('test_session_id', 'is', null)
    .order('uploaded_at', { ascending: false });

  if (error) { res.status(500).json({ error: error.message }); return; }

  // Group by session
  const sessions: Record<string, { sessionId: string; uploadedAt: string; fileCount: number; firstFile: string }> = {};
  for (const doc of data || []) {
    if (!sessions[doc.test_session_id]) {
      sessions[doc.test_session_id] = {
        sessionId: doc.test_session_id,
        uploadedAt: doc.uploaded_at,
        fileCount: 0,
        firstFile: doc.filename,
      };
    }
    sessions[doc.test_session_id].fileCount++;
  }

  res.json(Object.values(sessions));
});

router.delete('/:documentId', async (req: Request, res: Response) => {
  const { documentId } = req.params;
  console.log(`[delete] Deleting document ${documentId}`);

  await supabase.from('extracted_fields').delete().eq('document_id', documentId);
  const { error } = await supabase.from('documents').delete().eq('id', documentId);

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ success: true });
});

export default router;
