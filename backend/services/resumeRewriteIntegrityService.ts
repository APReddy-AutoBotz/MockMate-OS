import type { ResumeData } from 'mockmate-shared';
import {
  RESUME_REWRITE_INTEGRITY_POLICY_VERSION,
  type ResumeRewriteIntegrity,
} from 'mockmate-shared/resume-integrity';

const METRIC_PLACEHOLDER = /\[(?:\s*(?:x|n|number|metric|percent|percentage|users?|hours?|days?|months?|years?|_)[^\]]*)\]|\b(?:TBD|TBC|XX+)\b|_{2,}/i;
const NUMBER_FACT = /(?:[$€£₹]\s*)?\b\d+(?:[.,]\d+)*(?:\s*%|\+)?\b/g;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL = /(?:https?:\/\/|www\.)[^\s)\]}>,]+/gi;

const TECHNICAL_FACTS = [
  'react', 'node', 'node.js', 'typescript', 'javascript', 'python', 'java', 'c++', 'c#', '.net',
  'aws', 'azure', 'gcp', 'sql', 'nosql', 'postgres', 'postgresql', 'mysql', 'mongodb', 'redis',
  'docker', 'kubernetes', 'terraform', 'github', 'gitlab', 'jenkins', 'jira', 'salesforce', 'sap',
  'uipath', 'automation anywhere', 'power automate', 'selenium', 'playwright', 'cypress',
  'agile', 'scrum', 'machine learning', 'artificial intelligence', 'generative ai', 'llm', 'rag',
  'supabase', 'vercel', 'netlify', 'openai', 'gemini', 'groq', 'anthropic', 'claude',
] as const;

const GRAMMAR_ONLY_TERMS = new Set([
  'the', 'and', 'but', 'for', 'with', 'within', 'across', 'through', 'using', 'via', 'from', 'into',
  'that', 'which', 'while', 'where', 'when', 'this', 'these', 'those', 'their', 'your', 'our', 'its',
  'to', 'of', 'as', 'by', 'on', 'in', 'at', 'per', 'over', 'under', 'without', 'between', 'among',
  'including', 'during', 'after', 'before', 'than', 'or', 'nor', 'yet', 'so', 'an', 'a',
]);

const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim().toLowerCase();
const normalizeFact = (value: string): string => value
  .normalize('NFKC')
  .toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const unique = (values: string[]): string[] => [...new Set(values.map(normalize).filter(Boolean))];

const stemToken = (token: string): string => {
  let stem = token;
  if (stem.length > 5 && stem.endsWith('ing')) stem = stem.slice(0, -3);
  else if (stem.length > 4 && stem.endsWith('ied')) stem = `${stem.slice(0, -3)}y`;
  else if (stem.length > 4 && stem.endsWith('ed')) stem = stem.slice(0, -2);
  else if (stem.length > 4 && stem.endsWith('es')) stem = stem.slice(0, -2);
  else if (stem.length > 3 && stem.endsWith('s')) stem = stem.slice(0, -1);
  if (stem.length > 3 && stem.endsWith('e')) stem = stem.slice(0, -1);
  return stem;
};

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

const containsNormalizedPhrase = (sourceText: string, fact: string): boolean => {
  const normalizedSource = normalizeFact(sourceText);
  const normalizedFact = normalizeFact(fact);
  if (!normalizedFact) return true;
  return ` ${normalizedSource} `.includes(` ${normalizedFact} `);
};

const unsupportedSourceTokens = (sourceText: string, suggestedText: string): string[] => {
  const sourceTokens = normalizeFact(sourceText).split(' ').filter(Boolean);
  const sourceTokenSet = new Set(sourceTokens);
  const sourceStems = new Set(sourceTokens.map(stemToken));

  return [...new Set(
    normalizeFact(suggestedText)
      .split(' ')
      .filter(token => token.length >= 3)
      .filter(token => !sourceTokenSet.has(token))
      .filter(token => !GRAMMAR_ONLY_TERMS.has(token))
      .filter(token => !sourceStems.has(stemToken(token))),
  )];
};

export type ResumeRewriteIntegrityFailure =
  | 'empty_or_unchanged'
  | 'source_location_mismatch'
  | 'metric_placeholder'
  | 'new_numeric_fact'
  | 'new_contact_or_url'
  | 'unsupported_technical_fact'
  | 'unsupported_source_token';

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

  if (structuredFactsIn(resume).some(fact => !containsNormalizedPhrase(sourceText, fact))) {
    failures.push('unsupported_structured_fact');
  }

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
  _resume: ResumeData,
): ResumeRewriteAssessment => {
  const source = normalize(sourceText);
  const suggested = normalize(suggestedText);
  const failures: ResumeRewriteIntegrityFailure[] = [];

  if (!suggested || suggested === source) failures.push('empty_or_unchanged');
  if (METRIC_PLACEHOLDER.test(suggestedText)) failures.push('metric_placeholder');
  if (introduced(sourceText, suggestedText, value => extract(value, NUMBER_FACT)).length > 0) {
    failures.push('new_numeric_fact');
  }

  const newContacts = [
    ...introduced(sourceText, suggestedText, value => extract(value, EMAIL)),
    ...introduced(sourceText, suggestedText, value => extract(value, URL)),
  ];
  if (newContacts.length > 0) failures.push('new_contact_or_url');

  const evidencedTech = new Set(technicalFactsIn(sourceText));
  if (technicalFactsIn(suggestedText).some(fact => !evidencedTech.has(fact))) {
    failures.push('unsupported_technical_fact');
  }

  if (unsupportedSourceTokens(sourceText, suggestedText).length > 0) {
    failures.push('unsupported_source_token');
  }

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
  return assessResumeRewrite(structuredFactsIn(resume).join('\n'), suggestedText, resume);
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
    'no_unsupported_source_token',
  ],
});
