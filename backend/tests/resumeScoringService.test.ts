import type { ResumeData } from 'mockmate-shared';
import { GovernedJDMatchResultSchema } from 'mockmate-shared/resume-integrity';
import { runJDMatch } from '../services/resumeScoringService';

const resume: ResumeData = {
  basics: { name: 'A Candidate', email: 'candidate@example.com', phone: '+91 90000 00000' },
  summary: 'Automation analyst focused on process improvement.',
  skills: [{ category: 'Automation', items: ['UiPath', 'SQL'] }],
  experience: [{
    company: 'Example Co',
    position: 'Automation Analyst',
    bullets: ['Automated invoice review in UiPath using SQL.'],
  }],
  education: [{ institution: 'Example University', degree: 'BSc' }],
  projects: [],
};

describe('resume JD scoring authority', () => {
  const originalGroqKey = process.env.GROQ_API_KEY;

  beforeEach(() => {
    delete process.env.GROQ_API_KEY;
  });

  afterAll(() => {
    if (originalGroqKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalGroqKey;
  });

  it('does not turn an unrecognized JD into a perfect score', async () => {
    const result = await runJDMatch(resume, 'Must have COBOL modernization and Six Sigma Black Belt experience.');
    expect(result).toEqual({
      scoreStatus: 'insufficient_coverage',
      jdMatchScore: null,
      matchedSkills: [],
      deterministicMissingSkills: [],
      llmMissingHardSkills: [],
      llmMissingSoftSkills: [],
    });
    expect(GovernedJDMatchResultSchema.parse(result)).toEqual(result);
  });

  it('scores recognized missing Tableau and CPA requirements as zero, not 100', async () => {
    const result = await runJDMatch(resume, 'Required: Tableau dashboards and CPA certification.');
    expect(result.scoreStatus).toBe('scored');
    expect(result.jdMatchScore).toBe(0);
    expect(result.deterministicMissingSkills).toEqual(expect.arrayContaining(['tableau', 'cpa']));
  });

  it('uses only server-recognized matched requirements in the numerator', async () => {
    const result = await runJDMatch(resume, 'Strong SQL and AWS experience required.');
    expect(result.scoreStatus).toBe('scored');
    expect(result.jdMatchScore).toBe(50);
    expect(result.matchedSkills).toEqual(['sql']);
    expect(result.deterministicMissingSkills).toEqual(['aws']);
  });

  it('allows a fully recognized and evidenced requirement set to score 100', async () => {
    const result = await runJDMatch(resume, 'SQL and UiPath are required.');
    expect(result.scoreStatus).toBe('scored');
    expect(result.jdMatchScore).toBe(100);
    expect(result.matchedSkills).toEqual(expect.arrayContaining(['sql', 'uipath']));
  });
});
