// backend/server.ts
// MockMate backend — minimal, production-safe starter with Gemini Live token route

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { isSupabaseConfigured } from './supabaseAdmin';

// ---- Phase 9: Production Env & CORS Guards ----
if (process.env.NODE_ENV === 'production') {
  const missing: string[] = [];
  if (!process.env.SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!process.env.ALLOWED_ORIGINS || !process.env.ALLOWED_ORIGINS.trim()) missing.push('ALLOWED_ORIGINS');

  if (process.env.ENABLE_DEV_AUTH === 'true') {
    console.error('[CRITICAL] ENABLE_DEV_AUTH must not be enabled in production.');
    process.exit(1);
  }

  const hasGemini = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  const hasGroq = Boolean(process.env.GROQ_API_KEY);
  if (!hasGemini && !hasGroq) {
    missing.push('GEMINI_API_KEY or GOOGLE_API_KEY or GROQ_API_KEY');
  }

  if (missing.length > 0) {
    console.error(`[CRITICAL] Missing required production environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

// ---- rate limiter ----
type Bucket = { tokens: number; ts: number };
const buckets = new Map<string, Bucket>();
function rateLimitSimple({ max = 20, windowMs = 60_000 }: { max?: number; windowMs?: number }) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === 'test') return next();
    const key = req.ip || req.headers['x-forwarded-for']?.toString() || 'anon';
    const now = Date.now();
    const b = buckets.get(key) || { tokens: max, ts: now };
    if (now - b.ts > windowMs) {
      b.tokens = max;
      b.ts = now;
    }
    if (b.tokens <= 0) return res.status(429).send('Too many requests');
    b.tokens -= 1;
    buckets.set(key, b);
    next();
  };
}

export const app = express();
export function createApp() {
  return app;
}
const PORT = Number(process.env.PORT ?? 3001);

const configuredAllowedOrigins = process.env.ALLOWED_ORIGINS
  ?.split(',')
  .map(s => s.trim())
  .filter(Boolean);

const allow = configuredAllowedOrigins?.length
  ? configuredAllowedOrigins
  : (process.env.NODE_ENV === 'production'
      ? []
      : [
          'http://localhost:3000',
          'http://127.0.0.1:3000',
          'http://localhost:5173',
          'http://127.0.0.1:5173',
          'http://localhost:4173',
          'http://127.0.0.1:4173',
        ]);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allow.includes(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

// Health
app.get('/api/health', (_req, res) => res.json({
  ok: true,
  ts: new Date().toISOString(),
  services: {
    supabase: isSupabaseConfigured,
    gemini: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    groq: Boolean(process.env.GROQ_API_KEY),
    devAuth: process.env.NODE_ENV === 'development' && process.env.ENABLE_DEV_AUTH === 'true',
  },
}));

// Gemini Live Ephemeral Token
const liveTokenLimiter = rateLimitSimple({ max: 20, windowMs: 60_000 });
app.post('/ephemeral-token', liveTokenLimiter, async (_req: Request, res: Response) => {
  try {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).send('missing GOOGLE_API_KEY');

    const model = 'gemini-live-2.5-flash-preview-native-audio';
    const url = `https://generativelanguage.googleapis.com/v1beta/tokens:generate?key=${apiKey}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    });

    const j: any = await r.json();
    if (!r.ok || !j?.token) {
      return res.status(500).json({ error: 'token fetch failed', details: j || null });
    }
    res.type('text/plain').send(j.token);
  } catch (err) {
    res.status(500).send('token error');
  }
});

import { verifyAuthToken } from './middleware/authMiddleware';

app.get('/api/auth/test', verifyAuthToken, (req, res) => {
  res.json({ message: 'Authenticated successfully', user: (req as any).user });
});

try {
  const userRoutes = require('./routes/userRoutes').default;
  const resumeRoutes = require('./routes/resumeRoutes').default;
  const meRoutes = require('./routes/meRoutes').default;
  const interviewRoutes = require('./routes/interviewRoutes').default;
  const adminRoutes = require('./routes/adminRoutes').default;

  app.use('/api/user', userRoutes);
  app.use('/api/resume', resumeRoutes);
  app.use('/api/me', meRoutes);
  app.use('/api/interview', interviewRoutes);
  app.use('/api/admin', adminRoutes);
} catch (e) {
  console.error("Failed to mount routes", e);
}

try {
  const clearSpeakRoutes = require('./clearspeak/routes').default;
  app.use('/api/clearspeak', clearSpeakRoutes);
} catch (e) {
  console.error('Failed to mount ClearSpeak routes', e);
}

app.use((_req, res) => res.status(404).json({ error: 'Not Found' }));
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Server Error' });
});

export function startServer(port = PORT) {
  return app.listen(port, () => {
    console.log(`MockMate backend running on http://localhost:${port}`);
  });
}

export default app;
