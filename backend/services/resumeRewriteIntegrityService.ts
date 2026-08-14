import type { ResumeData } from 'mockmate-shared';
import {
  RESUME_REWRITE_INTEGRITY_POLICY_VERSION,
  type ResumeRewriteIntegrity,
} from 'mockmate-shared/resume-integrity';

const METRIC_PLACEHOLDER = /\[(?:\s*(?:x|n|number|metric|percent|percentage|users?|hours?|days?|months?|years?|_)[^\]]*)\]|\b(?:TBD|TBC|XX+)\b|_{2,}/i;
const NUMBER_FACT = /(?:[$€£₹]\s*)?\b\d+(?:[.,]\d+)*(?:\s*%|\+)?\b/g;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL = /(?:https?:\/\/|www\.)[^\s)\]}>,]+/gi;

// High-risk technologies/tools that AI must never add unless the candidate
// already supplied them somewhere in the source resume.
const TECHNICAL_FACTS = [
  'react', 'node', 'node.js', 'typescript', 'javascript', 'python', 'java', 'c++', 'c#', '.net',
  'aws', 'azure', 'gcp', 'sql', 'nosql', 'postgres', 'postgresql', 'mysql', 'mongodb', 'redis',
  'docker', 'kubernetes', 'terraform', 'github', 'gitlab', 'jenkins', 'jira', 'salesforce', 'sap',
  'uipath', 'automation anywhere', 'power automate', 'selenium', 'playwright', 'cypress',
  'agile', 'scrum', 'machine learning', 'artificial intelligence', 'generative ai', 'llm', 'rag',
  'supabase', 'vercel', 'netlify', 'openai', 'gemini', 'groq', 'anthropic', 'claude',
] as const;

const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim().toLowerCase();
const normalizeFact = (value: string): string => value
  .normalize('NFKC')
  .toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const unique = (values: string[]): string[] => [...new Set(values.map(normalize).filter(Boolean))];

const extract = (value: string, pattern: RegExp): string[] => {
  pattern.lastIndex = 0;
  return unique(Array.from(value.matchAll(pattern), match => match[0]));
};

const resumeCorpus = (resume: ResumeData): string => JSON.stringify(resume);

const introduced = (source: string, target: string, extractor: (value: string) => string[]): string[] => {
  const sourceFacts = new Set(extractor(source));
  return extractor(target).filter(fact => !sourceFacts.has(fact));
};

const technicalFactsIn = (value: string): string[] => {
  const normalized = normalize(value);
  return TECHNICAL_FACTS.filter(fact => {
    const escaped = fact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(normalized);
  });
};

const structuredFactsIn = (resume: ResumeData): string[] => {
  const values: Array<string | undefined> = [
    resume.basics.name,
    resume.basics.email,
    resume.basics.phone,
    resume.basics.location,
    resume.basics.linkedinUrl,
    resume.basics.portfolioUrl,
    resume.summary,
  ];

  for (const group of resume.skills || []) values.push(...group.items);
  for (const experience of resume.experience || []) {
    values.push(experience.company, experience.position, experience.startDate, experience.endDate, ...experience.bullets);
  }
  for (const project of resume.projects || []) {
    values.push(project.name, project.description, project.url, ...(project.tools || []));
  }
  for (const education of resume.education || []) {
    values.push(education.institution, education.degree, education.year);
  }
  for (const certification of resume.certifications || []) {
    values.push(certification.name, certification.issuer, certification.year);
  }
  for (const award of resume.awards || []) values.push(award.title, award.description);

  return values
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map(value => value.trim());
};

export type ResumeRewriteIntegrityFailure =
  | 'empty_or_unchanged'
  | 'source_location_mismatch'
  | 'metric_placeholder'
  | 'new_numeric_fact'
  | 'new_contact_or_url'
  | 'unsupported_technical_fact';

export interface ResumeRewriteAssessment {
  safe: boolean;
  failures: ResumeRewriteIntegrityFailure[];
}

export type ResumeExtractionIntegrityFailure =
  | 'unsupported_structured_fact'
  | 'unsupported_numeric_fact'
  | 'unsupported_contact_or_url'
  | 'unsupported_technical_fact';

export interface ResumeExtractionAssessment {
  safe: boolean;
  failures: ResumeExtractionIntegrityFailure[];
}

export const assessResumeExtraction = (sourceText: string, resume: ResumeData): ResumeExtractionAssessment => {
  const target = resumeCorpus(resume);
  const failures: ResumeExtractionIntegrityFailure[] = [];
  const normalizedSource = normalizeFact(sourceText);

  const hasUnsupportedStructuredFact = structuredFactsIn(resume).some(fact => {
    const normalizedFact = normalizeFact(fact);
    return normalizedFact.length > 0 && !normalizedSource.includes(normalizedFact);
  });
  if (hasUnsupportedStructuredFact) failures.push('unsupported_structured_fact');

  if (introduced(sourceText, target, value => extract(value, NUMBER_FACT)).length > 0) {
    failures.push('unsupported_numeric_fact');
  }

  const introducedContacts = [
    ...introduced(sourceText, target, value => extract(value, EMAIL)),
    ...introduced(sourceText, target, value => extract(value, URL)),
  ];
  if (introducedContacts.length > 0) failures.push('unsupported_contact_or_url');

  const sourceTech = new Set(technicalFactsIn(sourceText));
  if (technicalFactsIn(target).some(fact => !sourceTech.has(fact))) {
    failures.push('unsupported_technical_fact');
  }

  return { safe: failures.length === 0, failures };
};

export const assessResumeRewrite = (
  sourceText: string,
  suggestedText: string,
  resume: ResumeData,
): ResumeRewriteAssessment => {
  const source = normalize(sourceText);
  const suggested = normalize(suggestedText);
  const failures: ResumeRewriteIntegrityFailure[] = [];

  if (!suggested || suggested === source) failures.push('empty_or_unchanged');
  if (METRIC_PLACEHOLDER.test(suggestedText)) failures.push('metric_placeholder');
  if (introduced(sourceText, suggestedText, value => extract(value, NUMBER_FACT)).length > 0) {
    failures.push('new_numeric_fact');
  }

  const sourceContacts = `${sourceText}\n${resumeCorpus(resume)}`;
  const newContacts = [
    ...introduced(sourceContacts, suggestedText, value => extract(value, EMAIL)),
    ...introduced(sourceContacts, suggestedText, value => extract(value, URL)),
  ];
  if (newContacts.length > 0) failures.push('new_contact_or_url');

  const candidateTech = technicalFactsIn(suggestedText);
  const evidencedTech = new Set(technicalFactsIn(resumeCorpus(resume)));
  if (candidateTech.some(fact => !evidencedTech.has(fact))) failures.push('unsupported_technical_fact');

  return { safe: failures.length === 0, failures };
};

export const assessBulletRewrite = (
  resume: ResumeData,
  expIdx: number,
  bulletIdx: number,
  providerOriginal: string,
  suggestedText: string,
): ResumeRewriteAssessment => {
  const actual = resume.experience?.[expIdx]?.bullets?.[bulletIdx];
  if (!actual || normalize(actual) !== normalize(providerOriginal)) {
    return { safe: false, failures: ['source_location_mismatch'] };
  }
  return assessResumeRewrite(actual, suggestedText, resume);
};

export const assessSummaryRewrite = (
  resume: ResumeData,
  providerOriginal: string,
  suggestedText: string,
): ResumeRewriteAssessment => {
  const actual = resume.summary || '';
  if (normalize(actual) !== normalize(providerOriginal)) {
    return { safe: false, failures: ['source_location_mismatch'] };
  }
  // A professional summary may legitimately restate facts from anywhere in the
  // resume, so numeric/contact checks use the whole candidate-provided corpus.
  return assessResumeRewrite(resumeCorpus(resume), suggestedText, resume);
};

export const passedResumeRewriteIntegrity = (): ResumeRewriteIntegrity => ({
  policyVersion: RESUME_REWRITE_INTEGRITY_POLICY_VERSION,
  outcome: 'passed',
  checks: [
    'source_location_matched',
    'no_new_numeric_fact',
    'no_metric_placeholder',
    'no_new_contact_or_url',
    'no_unsupported_technical_fact',
  ],
});
