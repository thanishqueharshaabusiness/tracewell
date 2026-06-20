import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import companiesRouter from './routes/companies';
import documentsRouter from './routes/documents';
import fieldsRouter from './routes/fields';
import aiRouter from './routes/ai';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/companies', companiesRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/fields', fieldsRouter);
app.use('/api/ai', aiRouter);

app.get('/health', (_, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Tracewell backend running on port ${PORT}`);
});
