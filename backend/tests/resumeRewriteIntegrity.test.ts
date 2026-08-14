import type { ResumeData } from 'mockmate-shared';
import {
  GovernedResumeSuggestionResponseSchema,
  RESUME_REWRITE_INTEGRITY_POLICY_VERSION,
  ResumeParseResponseSchema,
} from 'mockmate-shared/resume-integrity';
import {
  assessBulletRewrite,
  assessResumeExtraction,
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
  it('allows wording and morphology changes that preserve supplied facts', () => {
    const result = assessBulletRewrite(
      resume,
      0,
      0,
      resume.experience![0].bullets[0],
      'Automated invoice review in UiPath, reducing manual handling by 30%.',
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
    expect(result.failures).toContain('unsupported_source_token');
  });

  it('does not transplant a skill from another resume section into an unrelated role bullet', () => {
    const result = assessBulletRewrite(
      resume,
      0,
      1,
      resume.experience![0].bullets[1],
      'Partnered with finance stakeholders using SQL to improve exception handling.',
    );
    expect(result.safe).toBe(false);
    expect(result.failures).toContain('unsupported_technical_fact');
    expect(result.failures).toContain('unsupported_source_token');
  });

  it('rejects non-allowlisted qualitative claims absent from the located source bullet', () => {
    const result = assessBulletRewrite(
      resume,
      0,
      1,
      resume.experience![0].bullets[1],
      'Partnered with finance stakeholders to improve enterprise strategy and exception handling.',
    );
    expect(result.safe).toBe(false);
    expect(result.failures).toContain('unsupported_source_token');
  });

  it('does not exempt outcome verbs or success adverbs from factual grounding', () => {
    const result = assessBulletRewrite(
      resume,
      0,
      1,
      resume.experience![0].bullets[1],
      'Successfully increased exception handling with finance stakeholders.',
    );
    expect(result.safe).toBe(false);
    expect(result.failures).toContain('unsupported_source_token');
  });

  it('rejects provider index/original tampering before a suggestion can be accepted', () => {
    const result = assessBulletRewrite(resume, 0, 1, 'Different source text', 'Improved exception handling.');
    expect(result).toEqual({ safe: false, failures: ['source_location_mismatch'] });
  });

  it('rejects newly introduced contact or URL data', () => {
    const result = assessResumeRewrite(
      resume.experience![0].bullets[1],
      'Worked with finance stakeholders through https://invented.example.com',
      resume,
    );
    expect(result.safe).toBe(false);
    expect(result.failures).toContain('new_contact_or_url');
  });

  it('lets a summary restate supplied resume facts but blocks unsupported facts', () => {
    expect(assessSummaryRewrite(
      resume,
      resume.summary!,
      'Automation analyst with UiPath and SQL focused on reliable business process improvement.',
    ).safe).toBe(true);

    const unsafe = assessSummaryRewrite(
      resume,
      resume.summary!,
      'Automation analyst with AWS focused on reliable business process improvement.',
    );
    expect(unsafe.safe).toBe(false);
    expect(unsafe.failures).toContain('unsupported_technical_fact');
    expect(unsafe.failures).toContain('unsupported_source_token');
  });

  it('grounds every provider-parsed structured fact in the extracted source resume', () => {
    const parsedResume: ResumeData = {
      basics: { name: 'A Candidate' },
      skills: [{ category: 'Automation', items: ['UiPath'] }],
      experience: [{
        company: 'Example Co',
        position: 'Automation Analyst',
        bullets: ['Reduced manual handling by 30% using UiPath.'],
      }],
    };
    const source = 'A Candidate Example Co Automation Analyst UiPath Reduced manual handling by 30% using UiPath.';
    expect(assessResumeExtraction(source, parsedResume)).toEqual({ safe: true, failures: [] });

    const injectedCompany: ResumeData = {
      ...parsedResume,
      experience: [{
        company: 'Invented Corp',
        position: 'Automation Analyst',
        bullets: ['Reduced manual handling by 30% using UiPath.'],
      }],
    };
    const companyCheck = assessResumeExtraction(source, injectedCompany);
    expect(companyCheck.safe).toBe(false);
    expect(companyCheck.failures).toContain('unsupported_structured_fact');

    const injectedTechnology: ResumeData = {
      ...parsedResume,
      skills: [{ category: 'Automation', items: ['UiPath', 'AWS'] }],
    };
    const technologyCheck = assessResumeExtraction(source, injectedTechnology);
    expect(technologyCheck.safe).toBe(false);
    expect(technologyCheck.failures).toContain('unsupported_structured_fact');
    expect(technologyCheck.failures).toContain('unsupported_technical_fact');

    const injectedMetric: ResumeData = {
      ...parsedResume,
      experience: [{
        company: 'Example Co',
        position: 'Automation Analyst',
        bullets: ['Reduced manual handling by 45% using UiPath.'],
      }],
    };
    const metricCheck = assessResumeExtraction(source, injectedMetric);
    expect(metricCheck.safe).toBe(false);
    expect(metricCheck.failures).toContain('unsupported_structured_fact');
    expect(metricCheck.failures).toContain('unsupported_numeric_fact');
  });

  it('keeps the browser/backend suggestion contract strict and nullable for no summary proposal', () => {
    const payload = {
      success: true as const,
      bulletSuggestions: [{
        expIdx: 0,
        bulletIdx: 0,
        original: resume.experience![0].bullets[0],
        suggested: 'Automated invoice review in UiPath, reducing manual handling by 30%.',
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
