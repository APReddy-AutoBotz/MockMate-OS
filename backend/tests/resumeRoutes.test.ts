import express from 'express';
import request from 'supertest';

const TEST_USER_ID = '11111111-1111-1111-1111-111111111111';
const TEST_USER_B_ID = '22222222-2222-4222-8222-222222222222';
const mockGetCachedResult = jest.fn();
const mockSetCachedResult = jest.fn();
const mockResumeUpsert = jest.fn();
const mockResumeSelect = jest.fn();
const mockResumeReadEq = jest.fn();
const mockResumeMaybeSingle = jest.fn();
const mockFrom = jest.fn();
let lastPersistedReview: any;
let mockSupabaseAdmin: any;

jest.mock('../middleware/authMiddleware', () => ({
  verifyAuthToken: (req: any, _res: any, next: any) => {
    const requestedUserId = req.get('x-test-user-id');
    const userId = requestedUserId || TEST_USER_ID;
    req.user = { uid: userId, id: userId, email: 'resume-test@example.com' };
    next();
  },
}));

jest.mock('../services/usageService', () => ({
  enforceUsageLimit: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../services/cacheService', () => ({
  hashText: (value: unknown) => JSON.stringify(value),
  hashExactJson: (value: unknown) => `exact:${JSON.stringify(value)}`,
  getCachedResult: (...args: unknown[]) => mockGetCachedResult(...args),
  setCachedResult: (...args: unknown[]) => mockSetCachedResult(...args),
}));

jest.mock('../supabaseAdmin', () => ({
  get supabaseAdmin() {
    return mockSupabaseAdmin;
  },
  isSupabaseConfigured: true,
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
    jest.clearAllMocks();
    lastPersistedReview = undefined;
    mockSupabaseAdmin = { from: (...args: unknown[]) => mockFrom(...args) };
    mockGetCachedResult.mockResolvedValue(null);
    mockSetCachedResult.mockResolvedValue(undefined);
    mockResumeUpsert.mockImplementation(async (review: unknown) => {
      lastPersistedReview = review;
      return { error: null };
    });
    const readQuery = {
      eq: mockResumeReadEq,
      maybeSingle: mockResumeMaybeSingle,
    };
    mockResumeReadEq.mockReturnValue(readQuery);
    mockResumeSelect.mockReturnValue(readQuery);
    mockResumeMaybeSingle.mockImplementation(async () => ({
      data: {
        ats_diagnostics: lastPersistedReview?.ats_diagnostics,
        jd_match: lastPersistedReview?.jd_match,
      },
      error: null,
    }));
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'resume_reviews') throw new Error(`Unexpected test table: ${table}`);
      return { upsert: mockResumeUpsert, select: mockResumeSelect };
    });
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
    expect(mockResumeUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: TEST_USER_ID,
        resume_data: minimalResume,
        ats_diagnostics: response.body.atsDiagnostics,
        jd_match: null,
        request_hash: expect.stringContaining('governed-resume-score.v3'),
      }),
      { onConflict: 'user_id,request_hash', ignoreDuplicates: true },
    );
  });

  it('scopes deterministic score cache keys to the authenticated user', async () => {
    const app = buildApp();
    const requestBody = { resumeData: minimalResume, rawText: '', jdText: '' };

    const userA = await request(app).post('/api/resume/score').send(requestBody);
    const userB = await request(app)
      .post('/api/resume/score')
      .set('x-test-user-id', TEST_USER_B_ID)
      .send(requestBody);

    expect(userA.status).toBe(200);
    expect(userB.status).toBe(200);
    expect(mockGetCachedResult).toHaveBeenCalledTimes(2);
    const userACacheKey = mockGetCachedResult.mock.calls[0][1];
    const userBCacheKey = mockGetCachedResult.mock.calls[1][1];
    expect(userACacheKey).not.toBe(userBCacheKey);
    expect(userACacheKey).toContain(TEST_USER_ID);
    expect(userBCacheKey).toContain(TEST_USER_B_ID);
    expect(mockGetCachedResult).toHaveBeenNthCalledWith(
      1,
      'resume_score_governed_v2',
      expect.any(String),
      { userId: TEST_USER_ID },
    );
    expect(mockGetCachedResult).toHaveBeenNthCalledWith(
      2,
      'resume_score_governed_v2',
      expect.any(String),
      { userId: TEST_USER_B_ID },
    );
    expect(mockResumeUpsert.mock.calls[0][0]).toEqual(expect.objectContaining({ user_id: TEST_USER_ID }));
    expect(mockResumeUpsert.mock.calls[1][0]).toEqual(expect.objectContaining({ user_id: TEST_USER_B_ID }));
    expect(mockResumeUpsert.mock.calls[0][0].request_hash).toBe(mockResumeUpsert.mock.calls[1][0].request_hash);
  });

  it('does not duplicate a user-owned resume review on a same-user cache hit', async () => {
    const app = buildApp();
    const requestBody = { resumeData: minimalResume, rawText: '', jdText: '' };
    const fresh = await request(app).post('/api/resume/score').send(requestBody);
    expect(fresh.status).toBe(200);

    mockResumeUpsert.mockClear();
    mockSetCachedResult.mockClear();
    mockGetCachedResult.mockResolvedValue(fresh.body);

    const cached = await request(app).post('/api/resume/score').send(requestBody);

    expect(cached.status).toBe(200);
    expect(cached.body).toEqual(fresh.body);
    expect(mockResumeUpsert).toHaveBeenCalledTimes(1);
    expect(mockResumeUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: TEST_USER_ID }),
      { onConflict: 'user_id,request_hash', ignoreDuplicates: true },
    );
    expect(mockSetCachedResult).not.toHaveBeenCalled();
  });

  it('does not populate the cache when authoritative review persistence fails on a miss', async () => {
    mockResumeUpsert.mockResolvedValue({ error: { message: 'synthetic persistence failure' } });

    const response = await request(buildApp())
      .post('/api/resume/score')
      .send({ resumeData: minimalResume, rawText: '', jdText: '' });

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(mockSetCachedResult).not.toHaveBeenCalled();
  });

  it('fails closed when authoritative resume persistence is unconfigured', async () => {
    mockSupabaseAdmin = null;

    const response = await request(buildApp())
      .post('/api/resume/score')
      .send({ resumeData: minimalResume, rawText: '', jdText: '' });

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(mockSetCachedResult).not.toHaveBeenCalled();
  });

  it('fails closed when a cached score cannot restore authoritative provenance', async () => {
    mockGetCachedResult.mockResolvedValue({
      success: true,
      atsDiagnostics: {
        score: 50,
        highConfidenceIssues: [],
        possibleRiskIssues: [],
      },
      jdMatch: null,
    });
    mockResumeUpsert.mockResolvedValue({ error: { message: 'synthetic persistence failure' } });

    const response = await request(buildApp())
      .post('/api/resume/score')
      .send({ resumeData: minimalResume, rawText: '', jdText: '' });

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(mockSetCachedResult).not.toHaveBeenCalled();
  });

  it('keeps a durable score successful when the non-authoritative cache write fails', async () => {
    mockSetCachedResult.mockRejectedValue(new Error('synthetic cache failure'));

    const response = await request(buildApp())
      .post('/api/resume/score')
      .send({ resumeData: minimalResume, rawText: '', jdText: '' });

    expect(response.status).toBe(200);
    expect(mockResumeUpsert).toHaveBeenCalledTimes(1);
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
