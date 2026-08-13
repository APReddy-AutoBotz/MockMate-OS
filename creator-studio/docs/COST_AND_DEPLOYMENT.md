# Cost and deployment

## Near-zero fixed-cost target

- GitHub + Codex Cloud for implementation
- Netlify free tier for the web preview
- Supabase free tier for early database/auth/storage usage
- Deterministic mock worker for normal development and CI
- No always-on GPU

## Variable cost

Real voice and avatar inference require compute. The design uses an on-demand GPU worker that is started only for an approved job and can scale to zero. The product must show an estimated render cost before a real job starts and record actual duration/cost afterward.

## Laptop impact

The user's laptop only needs a browser. Codex Cloud builds and tests the code. Netlify serves the web app. Supabase stores workflow data. The remote worker performs generation and FFmpeg composition.

## Cost gates

- No provider account or paid resource is created without a documented need.
- Mock mode proves the workflow before GPU spend.
- A hard per-job budget and monthly cap are required before production inference.
- Store compressed previews and automatically expire superseded drafts.
