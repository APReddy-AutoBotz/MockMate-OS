import type { ResumeData } from 'mockmate-shared';
import {
  GovernedResumeSuggestionResponseSchema,
  RESUME_REWRITE_INTEGRITY_POLICY_VERSION,
  ResumeParseResponseSchema,
} from 'mockmate-shared/resume-integrity';
import {
  assessBulletRewrite,
  assessResumeRewrite,
  assessSummaryRewrite,
  passedResumeRewriteIntegrity,
} from '../services/resumeRewriteIntegrityService';

const resume: ResumeData = {
  basics: {
    name: 'A Candidate',
    email: 'candidate@example.com',
    phone: '+91 90000 00000',
    location: 'Hyderabad, India',
  },
  summary: 'Automation analyst focused on reliable business process improvement.',
  skills: [
    { category: 'Automation', items: ['UiPath', 'SQL'] },
    { category: 'Delivery', items: ['Agile'] },
  ],
  experience: [
    {
      company: 'Example Co',
      position: 'Automation Analyst',
      startDate: 'Jan 2022',
      endDate: 'Present',
      bullets: [
        'Automated invoice review in UiPath and reduced manual handling by 30%.',
        'Worked with finance stakeholders to improve exception handling.',
      ],
    },
  ],
  education: [],
  projects: [],
};

describe('resume rewrite integrity', () => {
  it('allows a wording-only rewrite that preserves supplied facts', () => {
    const result = assessBulletRewrite(
      resume,
      0,
      0,
      resume.experience![0].bullets[0],
      'Streamlined invoice review in UiPath, reducing manual handling by 30%.',
    );
    expect(result).toEqual({ safe: true, failures: [] });
  });

  it('rejects newly invented numeric facts', () => {
    const result = assessBulletRewrite(
      resume,
      0,
      1,
      resume.experience![0].bullets[1],
      'Partnered with finance stakeholders to improve exception handling by 45%.',
    );
    expect(result.safe).toBe(false);
    expect(result.failures).toContain('new_numeric_fact');
  });

  it('rejects metric placeholders instead of inviting the user to fill invented evidence', () => {
    const result = assessResumeRewrite(
      resume.experience![0].bullets[1],
      'Improved exception handling by [X%] with finance stakeholders.',
      resume,
    );
    expect(result.safe).toBe(false);
    expect(result.failures).toContain('metric_placeholder');
  });

  it('rejects unsupported technology even when it appears in the target JD rather than the resume', () => {
    const result = assessBulletRewrite(
      resume,
      0,
      1,
      resume.experience![0].bullets[1],
      'Partnered with finance stakeholders using AWS to improve exception handling.',
    );
    expect(result.safe).toBe(false);
    expect(result.failures).toContain('unsupported_technical_fact');
  });

  it('allows technical facts already evidenced elsewhere in the candidate resume', () => {
    const result = assessBulletRewrite(
      resume,
      0,
      1,
      resume.experience![0].bullets[1],
      'Used SQL with finance stakeholders to improve exception handling.',
    );
    expect(result).toEqual({ safe: true, failures: [] });
  });

  it('rejects provider index/original tampering before a suggestion can be accepted', () => {
    const result = assessBulletRewrite(resume, 0, 1, 'Different source text', 'Improved exception handling.');
    expect(result).toEqual({ safe: false, failures: ['source_location_mismatch'] });
  });

  it('rejects newly introduced contact or URL data', () => {
    const result = assessResumeRewrite(
      resume.experience![0].bullets[1],
      'Worked with finance stakeholders; portfolio: https://invented.example.com',
      resume,
    );
    expect(result.safe).toBe(false);
    expect(result.failures).toContain('new_contact_or_url');
  });

  it('lets a summary restate supplied resume facts but blocks unsupported facts', () => {
    expect(assessSummaryRewrite(
      resume,
      resume.summary!,
      'Automation analyst with UiPath and SQL experience focused on reliable business process improvement.',
    ).safe).toBe(true);

    const unsafe = assessSummaryRewrite(
      resume,
      resume.summary!,
      'Automation analyst with AWS experience focused on reliable business process improvement.',
    );
    expect(unsafe.safe).toBe(false);
    expect(unsafe.failures).toContain('unsupported_technical_fact');
  });

  it('keeps the browser/backend suggestion contract strict and nullable for no summary proposal', () => {
    const payload = {
      success: true as const,
      bulletSuggestions: [{
        expIdx: 0,
        bulletIdx: 0,
        original: resume.experience![0].bullets[0],
        suggested: 'Streamlined invoice review in UiPath, reducing manual handling by 30%.',
        integrity: passedResumeRewriteIntegrity(),
      }],
      summarySuggestion: null,
      jdUsed: false,
      integrityPolicyVersion: RESUME_REWRITE_INTEGRITY_POLICY_VERSION,
      filteredSuggestionCount: 0,
    };
    expect(GovernedResumeSuggestionResponseSchema.parse(payload)).toEqual(payload);
    expect(() => GovernedResumeSuggestionResponseSchema.parse({ ...payload, cached: true })).toThrow();
  });

  it('keeps parsed resume response strict', () => {
    const parsed = ResumeParseResponseSchema.parse({ success: true, rawText: 'candidate resume text', resumeData: resume });
    expect(parsed.resumeData.basics.name).toBe('A Candidate');
    expect(() => ResumeParseResponseSchema.parse({ ...parsed, providerRaw: 'secret' })).toThrow();
  });
});
