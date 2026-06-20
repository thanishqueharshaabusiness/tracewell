import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { supabase } from '../services/supabase';
import { parseDocument, detectDiscrepancies } from '../services/documentParser';

const router = Router();
const upload = multer({ dest: '/tmp/tracewell-uploads/' });

router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  const { companyId } = req.body;
  if (!companyId || !req.file) {
    res.status(400).json({ error: 'companyId and file required' });
    return;
  }

  const ext = path.extname(req.file.originalname).toLowerCase().replace('.', '');
  const fileType = ['pdf', 'xlsx', 'xls', 'csv', 'png', 'jpg', 'jpeg'].includes(ext)
    ? ext
    : 'pdf';

  // Insert document record
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

  // Parse in background
  setImmediate(async () => {
    try {
      const fields = await parseDocument(req.file!.path, fileType, doc.id, companyId);
      await detectDiscrepancies(companyId, fields, doc.id);

      // Insert extracted fields
      if (fields.length > 0) {
        const toInsert = fields.map((f) => ({
          document_id: doc.id,
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

        await supabase.from('extracted_fields').insert(toInsert);
      }

      await supabase
        .from('documents')
        .update({ parse_status: 'parsed' })
        .eq('id', doc.id);
    } catch (err) {
      console.error('Parse error:', err);
      await supabase
        .from('documents')
        .update({ parse_status: 'failed' })
        .eq('id', doc.id);
    } finally {
      fs.unlinkSync(req.file!.path);
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

export default router;
