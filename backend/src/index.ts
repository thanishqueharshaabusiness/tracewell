import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import companiesRouter from './routes/companies';
import documentsRouter from './routes/documents';
import fieldsRouter from './routes/fields';
import aiRouter from './routes/ai';

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = [
  'http://localhost:5173',
  'https://tracewell.vercel.app',
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.some(o => origin.startsWith(o) || origin === o)) {
      return callback(null, true);
    }
    // Also allow all vercel.app preview deployments for this project
    if (origin.includes('tracewell') && origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json());

app.use('/api/companies', companiesRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/fields', fieldsRouter);
app.use('/api/ai', aiRouter);

app.get('/health', (_, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Tracewell backend running on port ${PORT}`);
});
