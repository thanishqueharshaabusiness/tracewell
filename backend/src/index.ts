import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import companiesRouter from './routes/companies';
import documentsRouter from './routes/documents';
import fieldsRouter from './routes/fields';
import aiRouter from './routes/ai';
import debugRouter from './routes/debug';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: true, // Allow all origins — locked down by Railway/Vercel auth
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.options('*', cors()); // Handle preflight for all routes

app.use(express.json());

app.use('/api/companies', companiesRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/fields', fieldsRouter);
app.use('/api/ai', aiRouter);
app.use('/api/debug', debugRouter);

app.get('/health', (_, res) => res.json({ status: 'ok', env: {
  hasSupabaseUrl: !!process.env.SUPABASE_URL,
  hasSupabaseKey: !!process.env.SUPABASE_SERVICE_KEY,
  hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
}}));

app.listen(PORT, () => {
  console.log(`Tracewell backend running on port ${PORT}`);
});
