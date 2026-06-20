import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { supabase } from '../services/supabase';
import { parseDocument, detectDiscrepancies } from '../services/documentParser';

const router = Router();
const upload = multer({ dest: '/tmp/tracewell-uploads/' });

async function runParse(filePath: string, fileType: string, docId: string, companyId: string) {
  try {
    const fields = await parseDocument(filePath, fileType, docId, companyId);
    await detectDiscrepancies(companyId, fields, docId);

    if (fields.length > 0) {
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
        console.error('Failed to insert extracted fields:', error);
        await supabase.from('documents').update({ parse_status: 'failed' }).eq('id', docId);
        return;
      }
    }

    await supabase.from('documents').update({ parse_status: 'parsed' }).eq('id', docId);
  } catch (err) {
    console.error('Parse error:', err);
    await supabase.from('documents').update({ parse_status: 'failed' }).eq('id', docId);
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
    res.status(500).json({ error: 'Failed to create document record' });
    return;
  }

  res.json({ documentId: doc.id, status: 'processing' });

  setImmediate(async () => {
    await runParse(req.file!.path, fileType, doc.id, companyId);
    try { fs.unlinkSync(req.file!.path); } catch {}
  });
});

router.post('/reparse/:documentId', async (req: Request, res: Response) => {
  const { documentId } = req.params;
  const { companyId } = req.body;

  const { data: doc } = await supabase
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single();

  if (!doc) { res.status(404).json({ error: 'Document not found' }); return; }

  // Delete existing fields for this document
  await supabase.from('extracted_fields').delete().eq('document_id', documentId);
  await supabase.from('documents').update({ parse_status: 'processing' }).eq('id', documentId);

  res.json({ status: 'reprocessing' });

  // Re-fetch file from storage_url if it still exists, otherwise fail gracefully
  setImmediate(async () => {
    if (fs.existsSync(doc.storage_url)) {
      await runParse(doc.storage_url, doc.file_type, documentId, companyId || doc.company_id);
    } else {
      await supabase.from('documents').update({ parse_status: 'failed' }).eq('id', documentId);
    }
  });
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
  await supabase.from('extracted_fields').delete().eq('document_id', req.params.documentId);
  await supabase.from('documents').delete().eq('id', req.params.documentId);
  res.json({ success: true });
});

export default router;
