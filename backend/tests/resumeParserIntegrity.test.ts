import { validateProviderExtraction } from '../services/resumeParserService';

const source = `A Candidate
candidate@example.com
+91 90000 00000
Automation analyst focused on reliable business process improvement.
Skills: UiPath SQL
Example Co
Automation Analyst
Jan 2022
Present
Automated invoice review in UiPath and reduced manual handling by 30%.
Acme Co
Process Analyst
Jan 2020
Dec 2021
Worked with finance stakeholders to improve exception handling.
Example University
BSc
2020`;

const validProviderPayload = () => ({
  basics: {
    name: 'A Candidate',
    email: 'candidate@example.com',
    phone: '+91 90000 00000',
    location: '',
    linkedinUrl: '',
    portfolioUrl: '',
  },
  summary: 'Automation analyst focused on reliable business process improvement.',
  skills: [{ category: 'Automation', items: ['UiPath', 'SQL'] }],
  experience: [
    {
      company: 'Example Co',
      position: 'Automation Analyst',
      startDate: 'Jan 2022',
      endDate: 'Present',
      bullets: ['Automated invoice review in UiPath and reduced manual handling by 30%.'],
      sourceExcerpt: `Example Co
Automation Analyst
Jan 2022
Present
Automated invoice review in UiPath and reduced manual handling by 30%.`,
    },
    {
      company: 'Acme Co',
      position: 'Process Analyst',
      startDate: 'Jan 2020',
      endDate: 'Dec 2021',
      bullets: ['Worked with finance stakeholders to improve exception handling.'],
      sourceExcerpt: `Acme Co
Process Analyst
Jan 2020
Dec 2021
Worked with finance stakeholders to improve exception handling.`,
    },
  ],
  projects: [],
  education: [{
    institution: 'Example University',
    degree: 'BSc',
    year: '2020',
    sourceExcerpt: `Example University
BSc
2020`,
  }],
  certifications: [],
  awards: [],
});

describe('resume parser integrity', () => {
  it('accepts separately grounded records with non-overlapping source excerpts', () => {
    const parsed = validateProviderExtraction(validProviderPayload(), source);
    expect(parsed.experience).toHaveLength(2);
    expect(parsed.experience?.[0].company).toBe('Example Co');
    expect(parsed.experience?.[1].company).toBe('Acme Co');
    expect(parsed.education?.[0].institution).toBe('Example University');
  });

  it('rejects role-level fact mixing across authoritative source records', () => {
    const payload = validProviderPayload();
    payload.experience[0] = {
      company: 'Example Co',
      position: 'Process Analyst',
      startDate: 'Jan 2022',
      endDate: 'Present',
      bullets: ['Worked with finance stakeholders to improve exception handling.'],
      sourceExcerpt: `Example Co
Automation Analyst
Jan 2022
Present
Automated invoice review in UiPath and reduced manual handling by 30%.
Acme Co
Process Analyst
Jan 2020
Dec 2021
Worked with finance stakeholders to improve exception handling.`,
    };
    payload.experience = [payload.experience[0]];

    expect(() => validateProviderExtraction(payload, source)).toThrow(/header facts|source excerpt|mixed/i);
  });

  it('uses token-bounded grounding so US does not match inside business', () => {
    const payload = validProviderPayload();
    payload.basics.location = 'US';
    const businessSource = `${source}\nBusiness process analysis`;

    expect(() => validateProviderExtraction(payload, businessSource)).toThrow(/unsupported hard facts/i);
  });

  it('rejects duplicate provider experience records rather than duplicating work history', () => {
    const payload = validProviderPayload();
    payload.experience.push({ ...payload.experience[0], bullets: [...payload.experience[0].bullets] });

    expect(() => validateProviderExtraction(payload, source)).toThrow(/duplicate experience records/i);
  });

  it('rejects duplicate bullets inside a single provider record', () => {
    const payload = validProviderPayload();
    payload.experience[0].bullets.push(payload.experience[0].bullets[0]);

    expect(() => validateProviderExtraction(payload, source)).toThrow(/duplicate experience\[0\]\.bullets/i);
  });

  it('rejects structurally empty or incomplete provider JSON', () => {
    expect(() => validateProviderExtraction({}, source)).toThrow(/malformed top-level shape/i);

    const empty = {
      basics: { name: '', email: '', phone: '', location: '', linkedinUrl: '', portfolioUrl: '' },
      summary: '',
      skills: [],
      experience: [],
      projects: [],
      education: [],
      certifications: [],
      awards: [],
    };
    expect(() => validateProviderExtraction(empty, source)).toThrow(/structurally empty/i);
  });

  it('rejects an excerpt that the provider cannot prove exists in the source', () => {
    const payload = validProviderPayload();
    payload.experience[0].sourceExcerpt = 'Invented excerpt for Example Co Automation Analyst';

    expect(() => validateProviderExtraction(payload, source)).toThrow(/source excerpt is missing/i);
  });
});
