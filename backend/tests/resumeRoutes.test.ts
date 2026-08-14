import express from 'express';
import request from 'supertest';

const TEST_USER_ID = '11111111-1111-1111-1111-111111111111';

jest.mock('../middleware/authMiddleware', () => ({
  verifyAuthToken: (req: any, _res: any, next: any) => {
    req.user = { uid: TEST_USER_ID, id: TEST_USER_ID, email: 'resume-test@example.com' };
    next();
  },
}));

jest.mock('../services/usageService', () => ({
  enforceUsageLimit: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../services/cacheService', () => ({
  hashText: (value: unknown) => JSON.stringify(value),
  getCachedResult: async () => null,
  setCachedResult: async () => undefined,
}));

jest.mock('../supabaseAdmin', () => ({
  supabaseAdmin: null,
  isSupabaseConfigured: false,
}));

import resumeRoutes from '../routes/resumeRoutes';

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/resume', resumeRoutes);
  return app;
};

const minimalResume = {
  basics: { name: 'A Candidate', email: 'candidate@example.com', phone: '+91 90000 00000' },
  summary: 'Automation analyst focused on process improvement and reliable delivery.',
  skills: [{ category: 'Automation', items: ['UiPath', 'SQL'] }],
  experience: [{
    company: 'Example Co',
    position: 'Automation Analyst',
    bullets: ['Automated invoice review in UiPath and reduced manual handling by 30%.'],
  }],
  education: [{ institution: 'Example University', degree: 'BSc' }],
  projects: [],
};

describe('resume route authority boundaries', () => {
  const originalGroqKey = process.env.GROQ_API_KEY;

  beforeEach(() => {
    delete process.env.GROQ_API_KEY;
  });

  afterAll(() => {
    if (originalGroqKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalGroqKey;
  });

  it('rejects client authority fields through the strict score contract', async () => {
    const response = await request(buildApp())
      .post('/api/resume/score')
      .send({ resumeData: minimalResume, rawText: '', jdText: '', provider: 'attacker-selected-provider' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('keeps deterministic ATS scoring available without an AI provider', async () => {
    const response = await request(buildApp())
      .post('/api/resume/score')
      .send({ resumeData: minimalResume, rawText: '', jdText: '' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body).not.toHaveProperty('cached');
    expect(response.body.jdMatch).toBeNull();
    expect(response.body.atsDiagnostics.score).toEqual(expect.any(Number));
  });

  it('fails closed rather than fabricating AI suggestions without a provider', async () => {
    const response = await request(buildApp())
      .post('/api/resume/suggest')
      .send({ resumeData: minimalResume, jdText: 'AWS engineer role' });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: 'Resume AI service is unavailable because the configured provider is not available.',
      code: 'SERVICE_UNAVAILABLE',
    });
  });

  it.each(['/rewrite', '/rewrite/advanced', '/rewrite/full'])(
    'disables unsafe legacy bulk rewrite path %s',
    async path => {
      const response = await request(buildApp()).post(`/api/resume${path}`).send({ resumeData: minimalResume });
      expect(response.status).toBe(410);
      expect(response.body.error).toMatch(/accept individual suggestions/i);
    },
  );
});
