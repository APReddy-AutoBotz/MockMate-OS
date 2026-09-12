import express from 'express';
import request from 'supertest';
import clearSpeakRoutes from '../clearspeak/routes';

const app = express();
app.use(express.json());
app.use('/api/clearspeak', clearSpeakRoutes);

const authenticated = (path: string) => request(app)
  .get(path)
  .set('Authorization', 'Bearer test-token');

describe('ClearSpeak authenticated access', () => {
  const originalRuntimeMode = process.env.MOCKMATE_RUNTIME_MODE;

  beforeAll(() => {
    process.env.MOCKMATE_RUNTIME_MODE = 'test';
  });

  afterAll(() => {
    if (originalRuntimeMode === undefined) delete process.env.MOCKMATE_RUNTIME_MODE;
    else process.env.MOCKMATE_RUNTIME_MODE = originalRuntimeMode;
  });

  it('still rejects unauthenticated callers', async () => {
    const response = await request(app).get('/api/clearspeak/capabilities');

    expect(response.status).toBe(401);
  });

  it('lets an authenticated user read capabilities without a profile entitlement', async () => {
    const response = await authenticated('/api/clearspeak/capabilities');

    expect(response.status).toBe(200);
    expect(response.body.standardSessionScoringAvailable).toEqual(expect.any(Boolean));
    expect(response.body.pronunciationAssessmentAvailable).toBe(false);
  });

  it('keeps the legacy access probe enabled for every authenticated user', async () => {
    const response = await authenticated('/api/clearspeak/beta/access');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ enabled: true });
  });

  it('opens the native reference-practice catalog without an allowlist row', async () => {
    const response = await authenticated('/api/clearspeak/v1/accent/catalog');

    expect(response.status).toBe(200);
    expect(response.body.profiles).toHaveLength(2);
    expect(response.body.realSpeechScoringAvailable).toEqual(expect.any(Boolean));
  });
});
