# Tracewell — Setup Guide

## Prerequisites
- Node.js 18+
- A Supabase project (free tier works)
- An Anthropic API key

## 1. Supabase

1. Go to [supabase.com](https://supabase.com) → New project
2. Open the SQL editor and paste in `supabase/schema.sql`, then run it
3. Copy your **Project URL** and **anon key** from Settings → API
4. Copy your **service role key** (keep this server-side only)

## 2. Backend

```bash
cd backend
cp .env.example .env
# Fill in ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
npm install
npm run dev
```

The backend runs on `http://localhost:3001`.

## 3. Frontend

```bash
cd frontend
cp .env.example .env
# Fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

The frontend runs on `http://localhost:5173`.

## 4. Flow

1. Visit `/` → click **Start**
2. Sign up at `/auth`
3. Set up your company at `/setup`
4. Upload documents (PDFs, XLSX, CSVs) at `/upload`
5. Review & confirm extracted ESG fields at `/review`
6. Fill gaps manually at `/wizard` (optional)
7. Calculate your ESG score at `/score`
8. Compare against benchmarks at `/benchmarks`
9. Review AI recommendations at `/recommendations`
10. Build and export your report at `/report`

## Notes

- All benchmark data tagged as `"source": "mock"` in `backend/src/data/benchmarks.json` uses modeled ranges based on CDP sector averages — clearly labeled in the UI
- Claude is called with `claude-sonnet-4-6` for all extraction and AI tasks
- AI outputs are cached in Supabase — Claude is not re-called if underlying data hasn't changed
- `ANTHROPIC_API_KEY` is never exposed to the frontend
