const pdfParse = require('pdf-parse');
import * as mammoth from 'mammoth';
import Groq from 'groq-sdk';
import { ResumeData, ResumeDataSchema } from 'mockmate-shared';
import { assessResumeExtraction } from './resumeRewriteIntegrityService';

export class ResumeProviderUnavailableError extends Error {
    code = 'RESUME_PROVIDER_UNAVAILABLE' as const;

    constructor(message = 'Resume AI provider is unavailable') {
        super(message);
        this.name = 'ResumeProviderUnavailableError';
    }
}

const providerClient = (): Groq => {
    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (!apiKey) throw new ResumeProviderUnavailableError();
    return new Groq({ apiKey });
};

const extractJson = (text: string): unknown => {
    if (!text) return null;
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
};

const getResponseText = (response: any): string => response?.choices?.[0]?.message?.content || '';
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const sanitizeStr = (value: unknown): string => {
    if (typeof value !== 'string') return '';
    const text = value.trim();
    if (!text) return '';
    if (/^(string|number|boolean|array|object|null)$/i.test(text)) return '';
    if (/\(optional\)|not specified|not provided/i.test(text)) return '';
    if (/^n\/a$/i.test(text) || text.startsWith('string (')) return '';
    return text;
};

const normalizeGrounding = (value: string): string => value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const containsGroundedPhrase = (source: string, fact: string): boolean => {
    const normalizedSource = normalizeGrounding(source);
    const normalizedFact = normalizeGrounding(fact);
    if (!normalizedFact) return true;
    return ` ${normalizedSource} `.includes(` ${normalizedFact} `);
};

const assertExactKeys = (value: Record<string, unknown>, expected: string[], label: string) => {
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
        throw new Error(`Resume provider returned malformed ${label} shape`);
    }
};

const assertString = (value: unknown, label: string) => {
    if (typeof value !== 'string') throw new Error(`Resume provider returned non-string ${label}`);
};

const assertStringArray = (value: unknown, label: string) => {
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
        throw new Error(`Resume provider returned malformed ${label}`);
    }
};

const validateProviderShape = (raw: unknown): Record<string, any> => {
    if (!isRecord(raw)) throw new Error('Resume provider returned invalid JSON object');
    assertExactKeys(raw, ['basics', 'summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'awards'], 'top-level');

    if (!isRecord(raw.basics)) throw new Error('Resume provider returned malformed basics');
    assertExactKeys(raw.basics, ['name', 'email', 'phone', 'location', 'linkedinUrl', 'portfolioUrl'], 'basics');
    for (const key of ['name', 'email', 'phone', 'location', 'linkedinUrl', 'portfolioUrl']) {
        assertString(raw.basics[key], `basics.${key}`);
    }
    assertString(raw.summary, 'summary');

    for (const key of ['skills', 'experience', 'projects', 'education', 'certifications', 'awards']) {
        if (!Array.isArray(raw[key])) throw new Error(`Resume provider returned malformed ${key}`);
    }

    const skills = raw.skills as unknown[];
    const experience = raw.experience as unknown[];
    const projects = raw.projects as unknown[];
    const education = raw.education as unknown[];
    const certifications = raw.certifications as unknown[];
    const awards = raw.awards as unknown[];

    skills.forEach((group: unknown, index: number) => {
        if (!isRecord(group)) throw new Error(`Resume provider returned malformed skills[${index}]`);
        assertExactKeys(group, ['category', 'items'], `skills[${index}]`);
        assertString(group.category, `skills[${index}].category`);
        assertStringArray(group.items, `skills[${index}].items`);
        if (!sanitizeStr(group.category) || (group.items as string[]).map(sanitizeStr).filter(Boolean).length === 0) {
            throw new Error(`Resume provider returned empty skills[${index}]`);
        }
    });

    experience.forEach((record: unknown, index: number) => {
        if (!isRecord(record)) throw new Error(`Resume provider returned malformed experience[${index}]`);
        assertExactKeys(record, ['company', 'position', 'startDate', 'endDate', 'bullets', 'sourceExcerpt'], `experience[${index}]`);
        for (const key of ['company', 'position', 'startDate', 'endDate', 'sourceExcerpt']) assertString(record[key], `experience[${index}].${key}`);
        assertStringArray(record.bullets, `experience[${index}].bullets`);
        const facts = [record.company, record.position, ...(record.bullets as string[])].map(sanitizeStr).filter(Boolean);
        if (facts.length === 0 || !sanitizeStr(record.sourceExcerpt)) throw new Error(`Resume provider returned empty experience[${index}]`);
    });

    projects.forEach((record: unknown, index: number) => {
        if (!isRecord(record)) throw new Error(`Resume provider returned malformed projects[${index}]`);
        assertExactKeys(record, ['name', 'description', 'tools', 'url', 'sourceExcerpt'], `projects[${index}]`);
        for (const key of ['name', 'description', 'url', 'sourceExcerpt']) assertString(record[key], `projects[${index}].${key}`);
        assertStringArray(record.tools, `projects[${index}].tools`);
        const facts = [record.name, record.description, ...(record.tools as string[])].map(sanitizeStr).filter(Boolean);
        if (facts.length === 0 || !sanitizeStr(record.sourceExcerpt)) throw new Error(`Resume provider returned empty projects[${index}]`);
    });

    education.forEach((record: unknown, index: number) => {
        if (!isRecord(record)) throw new Error(`Resume provider returned malformed education[${index}]`);
        assertExactKeys(record, ['institution', 'degree', 'year', 'sourceExcerpt'], `education[${index}]`);
        for (const key of ['institution', 'degree', 'year', 'sourceExcerpt']) assertString(record[key], `education[${index}].${key}`);
        if ((!sanitizeStr(record.institution) && !sanitizeStr(record.degree)) || !sanitizeStr(record.sourceExcerpt)) {
            throw new Error(`Resume provider returned empty education[${index}]`);
        }
    });

    certifications.forEach((record: unknown, index: number) => {
        if (!isRecord(record)) throw new Error(`Resume provider returned malformed certifications[${index}]`);
        assertExactKeys(record, ['name', 'issuer', 'year', 'sourceExcerpt'], `certifications[${index}]`);
        for (const key of ['name', 'issuer', 'year', 'sourceExcerpt']) assertString(record[key], `certifications[${index}].${key}`);
        if ((!sanitizeStr(record.name) && !sanitizeStr(record.issuer)) || !sanitizeStr(record.sourceExcerpt)) {
            throw new Error(`Resume provider returned empty certifications[${index}]`);
        }
    });

    awards.forEach((record: unknown, index: number) => {
        if (!isRecord(record)) throw new Error(`Resume provider returned malformed awards[${index}]`);
        assertExactKeys(record, ['title', 'description', 'sourceExcerpt'], `awards[${index}]`);
        for (const key of ['title', 'description', 'sourceExcerpt']) assertString(record[key], `awards[${index}].${key}`);
        if ((!sanitizeStr(record.title) && !sanitizeStr(record.description)) || !sanitizeStr(record.sourceExcerpt)) {
            throw new Error(`Resume provider returned empty awards[${index}]`);
        }
    });

    return raw as Record<string, any>;
};

const assertUniqueStrings = (values: string[], label: string) => {
    const seen = new Set<string>();
    for (const value of values.map(normalizeGrounding).filter(Boolean)) {
        if (seen.has(value)) throw new Error(`Resume provider returned duplicate ${label}`);
        seen.add(value);
    }
};

const assertUniqueRecords = (records: unknown[], label: string, signature: (record: any) => string) => {
    const seen = new Set<string>();
    for (const record of records) {
        const key = signature(record);
        if (seen.has(key)) throw new Error(`Resume provider returned duplicate ${label}`);
        seen.add(key);
    }
};

type SourceSpan = { start: number; end: number };

const normalizedPhraseSpans = (source: string, phrase: string): SourceSpan[] => {
    const normalizedSource = normalizeGrounding(source);
    const normalizedPhrase = normalizeGrounding(phrase);
    if (!normalizedPhrase) return [];
    const haystack = ` ${normalizedSource} `;
    const needle = ` ${normalizedPhrase} `;
    const spans: SourceSpan[] = [];
    let offset = 0;
    while (offset < haystack.length) {
        const found = haystack.indexOf(needle, offset);
        if (found === -1) break;
        spans.push({ start: found, end: found + needle.length });
        offset = found + Math.max(1, needle.length - 1);
    }
    return spans;
};

const overlaps = (a: SourceSpan, b: SourceSpan) => Math.max(a.start, b.start) < Math.min(a.end, b.end);
const excerptLines = (excerpt: string) => excerpt
    .split(/\r?\n|[•▪◦·]/)
    .map(line => line.trim())
    .filter(Boolean);

const lineIndexContaining = (lines: string[], fact: string): number => {
    const cleanFact = sanitizeStr(fact);
    if (!cleanFact) return -1;
    return lines.findIndex(line => containsGroundedPhrase(line, cleanFact));
};

const looksLikeStandaloneDateLine = (line: string): boolean => {
    const normalized = normalizeGrounding(line);
    if (!normalized || normalized.length > 60) return false;
    return /(?:^| )(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december|present|current|\d{4})(?: |$)/i.test(normalized)
        && /\d{4}|present|current/i.test(normalized);
};

const assertExperienceHeaderAssociation = (
    excerpt: string,
    kind: string,
    index: number,
    company: string,
    position: string,
    startDate: string,
    endDate: string,
    bullets: string[],
) => {
    const lines = excerptLines(excerpt);
    if (lines.length === 0) throw new Error(`Resume provider returned empty ${kind}[${index}] source excerpt`);

    const companyLine = lineIndexContaining(lines, company);
    const positionLine = lineIndexContaining(lines, position);
    const startLine = lineIndexContaining(lines, startDate);
    const endLine = lineIndexContaining(lines, endDate);
    const requiredHeaderLines = [companyLine, positionLine, startLine, endLine].filter(line => line >= 0);

    if (sanitizeStr(company) && companyLine < 0) throw new Error(`Resume provider mixed ${kind}[${index}] company across source records`);
    if (sanitizeStr(position) && positionLine < 0) throw new Error(`Resume provider mixed ${kind}[${index}] position across source records`);
    if (sanitizeStr(startDate) && startLine < 0) throw new Error(`Resume provider mixed ${kind}[${index}] start date across source records`);
    if (sanitizeStr(endDate) && endLine < 0) throw new Error(`Resume provider mixed ${kind}[${index}] end date across source records`);

    const headerEndLine = requiredHeaderLines.length ? Math.max(...requiredHeaderLines) : 0;
    if (headerEndLine > 5) {
        throw new Error(`Resume provider mixed ${kind}[${index}] header facts across source records`);
    }

    const headerText = lines.slice(0, Math.min(lines.length, 6)).join(' ');
    const headerFacts = [company, position, startDate, endDate].map(sanitizeStr).filter(Boolean);
    if (headerFacts.some(fact => !containsGroundedPhrase(headerText, fact))) {
        throw new Error(`Resume provider mixed ${kind}[${index}] header facts across source records`);
    }

    for (const bullet of bullets.map(sanitizeStr).filter(Boolean)) {
        const bulletLine = lineIndexContaining(lines, bullet);
        if (bulletLine < 0) throw new Error(`Resume provider mixed ${kind}[${index}] bullet outside its source record`);
        const intervening = lines.slice(headerEndLine + 1, bulletLine);
        const foreignDateBoundary = intervening.some(line => {
            if (!looksLikeStandaloneDateLine(line)) return false;
            return !containsGroundedPhrase(line, startDate) && !containsGroundedPhrase(line, endDate);
        });
        if (foreignDateBoundary) {
            throw new Error(`Resume provider mixed ${kind}[${index}] bullet across a later source record boundary`);
        }
    }
};

const assertRecordSourceExcerpt = (
    source: string,
    kind: string,
    index: number,
    excerpt: string,
    facts: string[],
    occupied: SourceSpan[],
) => {
    const normalizedExcerpt = normalizeGrounding(excerpt);
    if (!normalizedExcerpt || normalizedExcerpt.length > 3000) {
        throw new Error(`Resume provider returned invalid ${kind}[${index}] source excerpt`);
    }

    const candidateSpans = normalizedPhraseSpans(source, excerpt);
    const span = candidateSpans.find(candidate => occupied.every(existing => !overlaps(candidate, existing)));
    if (!span) throw new Error(`Resume provider ${kind}[${index}] source excerpt is missing or overlaps another ${kind} record`);

    for (const fact of facts.map(sanitizeStr).filter(Boolean)) {
        if (!containsGroundedPhrase(excerpt, fact)) {
            throw new Error(`Resume provider mixed ${kind}[${index}] facts outside its authoritative source excerpt`);
        }
    }

    occupied.push(span);
};

export const validateProviderExtraction = (raw: unknown, sourceText: string): ResumeData => {
    const source = sourceText.trim();
    if (!source) throw new Error('Resume text is empty');
    const value = validateProviderShape(raw);
    const rawBasics = value.basics;

    const candidate: ResumeData = {
        basics: {
            name: sanitizeStr(rawBasics.name),
            email: sanitizeStr(rawBasics.email) || undefined,
            phone: sanitizeStr(rawBasics.phone) || undefined,
            location: sanitizeStr(rawBasics.location) || undefined,
            linkedinUrl: sanitizeStr(rawBasics.linkedinUrl) || undefined,
            portfolioUrl: sanitizeStr(rawBasics.portfolioUrl) || undefined,
        },
        summary: sanitizeStr(value.summary) || undefined,
        skills: value.skills.map((group: any) => ({
            category: sanitizeStr(group.category),
            items: group.items.map(sanitizeStr).filter(Boolean),
        })),
        experience: value.experience.map((experienceRecord: any) => ({
            company: sanitizeStr(experienceRecord.company),
            position: sanitizeStr(experienceRecord.position),
            startDate: sanitizeStr(experienceRecord.startDate) || undefined,
            endDate: sanitizeStr(experienceRecord.endDate) || undefined,
            bullets: experienceRecord.bullets.map(sanitizeStr).filter(Boolean),
        })),
        projects: value.projects.map((project: any) => ({
            name: sanitizeStr(project.name),
            description: sanitizeStr(project.description),
            tools: project.tools.map(sanitizeStr).filter(Boolean),
            url: sanitizeStr(project.url) || undefined,
        })),
        education: value.education.map((educationRecord: any) => ({
            institution: sanitizeStr(educationRecord.institution),
            degree: sanitizeStr(educationRecord.degree),
            year: sanitizeStr(educationRecord.year) || undefined,
        })),
        certifications: value.certifications.map((certification: any) => ({
            name: sanitizeStr(certification.name),
            issuer: sanitizeStr(certification.issuer),
            year: sanitizeStr(certification.year) || undefined,
        })),
        awards: value.awards.map((award: any) => ({
            title: sanitizeStr(award.title),
            description: sanitizeStr(award.description),
        })),
    };

    const hasSubstantiveContent = Boolean(
        candidate.summary ||
        candidate.skills?.some(group => group.items.length > 0) ||
        candidate.experience?.length ||
        candidate.projects?.length ||
        candidate.education?.length ||
        candidate.certifications?.length ||
        candidate.awards?.length
    );
    if (!hasSubstantiveContent) throw new Error('Resume provider returned structurally empty resume data');

    candidate.skills?.forEach((group, index) => assertUniqueStrings(group.items, `skills[${index}].items`));
    candidate.experience?.forEach((record, index) => assertUniqueStrings(record.bullets, `experience[${index}].bullets`));
    candidate.projects?.forEach((record, index) => assertUniqueStrings(record.tools || [], `projects[${index}].tools`));

    assertUniqueRecords(candidate.experience || [], 'experience records', record => normalizeGrounding(JSON.stringify(record)));
    assertUniqueRecords(candidate.projects || [], 'project records', record => normalizeGrounding(JSON.stringify(record)));
    assertUniqueRecords(candidate.education || [], 'education records', record => normalizeGrounding(JSON.stringify(record)));
    assertUniqueRecords(candidate.certifications || [], 'certification records', record => normalizeGrounding(JSON.stringify(record)));
    assertUniqueRecords(candidate.awards || [], 'award records', record => normalizeGrounding(JSON.stringify(record)));

    const experienceSpans: SourceSpan[] = [];
    value.experience.forEach((rawRecord: any, index: number) => {
        const record = candidate.experience![index];
        assertRecordSourceExcerpt(
            source,
            'experience',
            index,
            rawRecord.sourceExcerpt,
            [record.company, record.position, record.startDate || '', record.endDate || '', ...record.bullets],
            experienceSpans,
        );
        assertExperienceHeaderAssociation(
            rawRecord.sourceExcerpt,
            'experience',
            index,
            record.company,
            record.position,
            record.startDate || '',
            record.endDate || '',
            record.bullets,
        );
    });

    const projectSpans: SourceSpan[] = [];
    value.projects.forEach((rawRecord: any, index: number) => {
        const record = candidate.projects![index];
        assertRecordSourceExcerpt(source, 'projects', index, rawRecord.sourceExcerpt, [record.name, record.description, record.url || '', ...(record.tools || [])], projectSpans);
    });

    const educationSpans: SourceSpan[] = [];
    value.education.forEach((rawRecord: any, index: number) => {
        const record = candidate.education![index];
        assertRecordSourceExcerpt(source, 'education', index, rawRecord.sourceExcerpt, [record.institution, record.degree, record.year || ''], educationSpans);
    });

    const certificationSpans: SourceSpan[] = [];
    value.certifications.forEach((rawRecord: any, index: number) => {
        const record = candidate.certifications![index];
        assertRecordSourceExcerpt(source, 'certifications', index, rawRecord.sourceExcerpt, [record.name, record.issuer, record.year || ''], certificationSpans);
    });

    const awardSpans: SourceSpan[] = [];
    value.awards.forEach((rawRecord: any, index: number) => {
        const record = candidate.awards![index];
        assertRecordSourceExcerpt(source, 'awards', index, rawRecord.sourceExcerpt, [record.title, record.description], awardSpans);
    });

    const resumeData = ResumeDataSchema.parse(candidate);
    const integrity = assessResumeExtraction(source, resumeData);
    if (!integrity.safe) {
        console.error(`[RESUME_PARSE_INTEGRITY_REJECTED] ${integrity.failures.join(',')}`);
        throw new Error('Resume provider output introduced unsupported hard facts');
    }

    return resumeData;
};

export const extractTextFromFile = async (fileBuffer: Buffer, mimetype: string): Promise<string> => {
    try {
        if (mimetype === 'application/pdf') {
            const data = await pdfParse(fileBuffer);
            return data.text;
        }
        if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            const result = await mammoth.extractRawText({ buffer: fileBuffer });
            return result.value;
        }
        throw new Error(`Unsupported file type: ${mimetype}. Only PDF and DOCX are supported.`);
    } catch (error) {
        console.error('[RESUME_TEXT_EXTRACTION_FAILED]');
        throw new Error('Failed to extract text from file. The document may be corrupted, encrypted, or unsupported.');
    }
};

export const parseResumeToSchema = async (rawText: string): Promise<ResumeData> => {
    const source = rawText.trim();
    if (!source) throw new Error('Resume text is empty');

    const prompt = `You are a resume parsing engine. Extract structure only from the supplied resume text.

NON-NEGOTIABLE RULES:
1. Extract only information literally supported by the resume. Never infer or invent experience, tools, metrics, employers, dates, certifications, contact details, or achievements.
2. If a section is absent, return an empty array for that section. Never emit empty placeholder records, "not specified", "N/A", or example values.
3. Skill category labels may be organizational, but every skill item itself must appear in the source resume.
4. Preserve the candidate's factual field wording exactly apart from whitespace cleanup. Do not expand abbreviations, normalize dates, rename titles, paraphrase bullets, or rewrite summaries during parsing.
5. For every experience, project, education, certification, and award record, include sourceExcerpt: the shortest contiguous excerpt copied from the source resume that contains only that record's facts. Never span multiple roles/records and never paraphrase the excerpt.
6. Return only one valid JSON object matching the exact requested shape and keys.

RAW RESUME TEXT:
"""
${source.substring(0, 30000)}
"""

OUTPUT SHAPE:
{
  "basics": {"name":"","email":"","phone":"","location":"","linkedinUrl":"","portfolioUrl":""},
  "summary":"",
  "skills":[{"category":"","items":[]}],
  "experience":[{"company":"","position":"","startDate":"","endDate":"","bullets":[],"sourceExcerpt":""}],
  "projects":[{"name":"","description":"","tools":[],"url":"","sourceExcerpt":""}],
  "education":[{"institution":"","degree":"","year":"","sourceExcerpt":""}],
  "certifications":[{"name":"","issuer":"","year":"","sourceExcerpt":""}],
  "awards":[{"title":"","description":"","sourceExcerpt":""}]
}`;

    let response: any;
    try {
        response = await providerClient().chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            response_format: { type: 'json_object' },
        });
    } catch (error) {
        if (error instanceof ResumeProviderUnavailableError) throw error;
        console.error('[RESUME_PARSE_PROVIDER_FAILED]');
        throw new ResumeProviderUnavailableError();
    }

    const parsed = extractJson(getResponseText(response));
    if (!parsed) throw new Error('Resume provider returned invalid JSON');
    return validateProviderExtraction(parsed, source);
};
