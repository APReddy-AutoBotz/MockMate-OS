// backend/server.ts
// MockMate backend — minimal, production-safe starter with Gemini Live token route

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { isSupabaseConfigured } from './supabaseAdmin';

// ---- tiny in-memory rate limiter (no external deps) ----
type Bucket = { tokens: number; ts: number };
const buckets = new Map<string, Bucket>();
function rateLimitSimple({ max = 20, windowMs = 60_000 }: { max?: number; windowMs?: number }) {
  return (req: Request, res: Response, next: NextFunction) => {
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

// ---- Node fetch fallback for older Node (<18) ----
const httpFetch: typeof fetch = (global as any).fetch
  ? (global as any).fetch
  : (async (...args: any[]) => {
    const mod = await import('node-fetch');
    // @ts-ignore
    return mod.default(...args);
  }) as any;

// ---- app init ----
export const app = express();
export function createApp() {
  return app;
}
const PORT = Number(process.env.PORT ?? 3001);

// CORS allow-list (comma separated). Local defaults cover Vite's common ports.
const configuredAllowedOrigins = process.env.ALLOWED_ORIGINS
  ?.split(',')
  .map(s => s.trim())
  .filter(Boolean);
const allow = configuredAllowedOrigins?.length
  ? configuredAllowedOrigins
  : [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
  ];

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

// ---------- Health ----------
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

// ---------- Gemini Live: Ephemeral token ----------
const liveTokenLimiter = rateLimitSimple({ max: 20, windowMs: 60_000 });

app.post('/ephemeral-token', liveTokenLimiter, async (_req: Request, res: Response) => {
  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) return res.status(500).send('missing GOOGLE_API_KEY');

    // Must match the Live model you open over WebSocket from the browser
    const model = 'gemini-live-2.5-flash-preview-native-audio';

    const url = `https://generativelanguage.googleapis.com/v1beta/tokens:generate?key=${apiKey}`;
    const r = await httpFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    });

    const j: any = await r.json(); // { token, expireTime }
    if (!r.ok || !j?.token) {
      return res.status(500).json({ error: 'token fetch failed', details: j || null });
    }
    // Return plain text for easy use in the frontend
    res.type('text/plain').send(j.token);
  } catch (err) {
    res.status(500).send('token error');
  }
});

// ---------- Auth Middleware & Test Route ----------
import { verifyAuthToken } from './middleware/authMiddleware';

app.get('/api/auth/test', verifyAuthToken, (req, res) => {
  res.json({ message: 'Authenticated successfully', user: (req as any).user });
});

// ---------- Optional: mount your existing routes if present ----------
try {
  // If you have backend/routes/index.ts exporting a router as default
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const aiRoutes = require('./routes/aiRoutes').default;
  const userRoutes = require('./routes/userRoutes').default;
  const resumeRoutes = require('./routes/resumeRoutes').default;
  const meRoutes = require('./routes/meRoutes').default;
  const interviewRoutes = require('./routes/interviewRoutes').default;
  const adminRoutes = require('./routes/adminRoutes').default;

  app.use('/api/ai', aiRoutes);
  app.use('/api/user', userRoutes);
  app.use('/api/resume', resumeRoutes);
  app.use('/api/me', meRoutes);
  app.use('/api/interview', interviewRoutes);
  app.use('/api/admin', adminRoutes);
  console.log('Mounted AI, User, Resume, Interview, Me, and Admin routes');
} catch (e) {
  console.error("Failed to mount routes", e);
  // No custom routes found — ignore
}

// ---------- ClearSpeak routes ----------
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const clearSpeakRoutes = require('./clearspeak/routes').default;
  app.use('/api/clearspeak', clearSpeakRoutes);
  console.log('Mounted ClearSpeak routes at /api/clearspeak');
} catch (e) {
  console.error('Failed to mount ClearSpeak routes', e);
}

// ---------- Optional: Swagger at /api-docs if you have swagger deps ----------
try {
  // lazy-require to avoid hard dependency
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const swaggerUi = require('swagger-ui-express');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const swaggerJsdoc = require('swagger-jsdoc');

  const spec = swaggerJsdoc({
    definition: {
      openapi: '3.0.0',
      info: { title: 'MockMate API', version: '1.0.0' },
      servers: [{ url: `http://localhost:${PORT}` }],
    },
    apis: [], // add globs if you want to scan JSDoc from routes
  });

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec));
  console.log('Swagger UI available at /api-docs');
} catch {
  // swagger packages not installed; skip silently
}

// ---------- 404 & error handler ----------
app.use((_req, res) => res.status(404).json({ error: 'Not Found' }));
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Server Error' });
});

export function startServer(port = PORT) {
  return app.listen(port, () => {
    console.log(`MockMate backend running on http://localhost:${port}`);
    console.log('Health:         GET  /api/health');
    console.log('Live token:     POST /ephemeral-token');
    console.log('Docs (optional):     /api-docs');
  });
}

export default app;
