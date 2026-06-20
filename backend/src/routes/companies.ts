import { Router, Request, Response } from 'express';
import { supabase } from '../services/supabase';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  const { userId, name, industry, size, country } = req.body;
  if (!userId || !name || !industry || !size || !country) {
    res.status(400).json({ error: 'All fields required' });
    return;
  }

  const { data, error } = await supabase
    .from('companies')
    .insert({ user_id: userId, name, industry, size, country })
    .select()
    .single();

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

router.get('/:id', async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(data);
});

router.get('/user/:userId', async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('user_id', req.params.userId)
    .order('created_at', { ascending: false });

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data || []);
});

export default router;
