import * as mammoth from 'mammoth';
import Groq from 'groq-sdk';
import OpenAI from 'openai';
import { ResumeData, ResumeDataSchema } from 'mockmate-shared';
import { assessResumeExtraction } from './resumeRewriteIntegrityService';

export class ResumeProviderUnavailableError extends Error {
    code = 'RESUME_PROVIDER_UNAVAILABLE' as const;

    constructor(message = 'Resume AI provider is unavailable') {
        super(message);
        this.name = 'ResumeProviderUnavailableError';
    }
}

const providerClient = (): { client: any; model: string } => {
    const openaiKey = process.env.OPENAI_API_KEY?.trim();
    if (openaiKey) {
        return { client: new OpenAI({ apiKey: openaiKey }), model: 'gpt-4o-mini' };
    }
    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (!apiKey) throw new ResumeProviderUnavailableError();
    return { client: new Groq({ apiKey }), model: 'llama-3.1-8b-instant' };
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

    const spans: SourceSpan[] = [];
    let offset = 0;
    while (offset <= normalizedSource.length - normalizedPhrase.length) {
        const found = normalizedSource.indexOf(normalizedPhrase, offset);
        if (found === -1) break;
        const end = found + normalizedPhrase.length;
        const startsOnBoundary = found === 0 || normalizedSource[found - 1] === ' ';
        const endsOnBoundary = end === normalizedSource.length || normalizedSource[end] === ' ';
        if (startsOnBoundary && endsOnBoundary) spans.push({ start: found, end });
        offset = found + 1;
    }
    return spans;
};

const overlaps = (a: SourceSpan, b: SourceSpan) => Math.max(a.start, b.start) < Math.min(a.end, b.end);
const excerptLines = (excerpt: string) => excerpt
    .split(/\r?\n/)
    .flatMap(line => line.split(/(?<=\s)[•▪◦](?=\s)/))
    .map(line => line.trim())
    .filter(Boolean);

const lineIndexContaining = (lines: string[], fact: string): number => {
    const cleanFact = sanitizeStr(fact);
    if (!cleanFact) return -1;
    const direct = lines.findIndex(line => containsGroundedPhrase(line, cleanFact));
    if (direct >= 0) return direct;
    return lines.findIndex(line => containsGroundedPhrase(cleanFact, line));
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
        if (bulletLine < 0) {
            if (!containsGroundedPhrase(excerpt, bullet)) {
                throw new Error(`Resume provider mixed ${kind}[${index}] bullet outside its source record`);
            }
            continue;
        }
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
    if (candidateSpans.length === 0) {
        throw new Error(`Resume provider ${kind}[${index}] source excerpt is missing from the source text`);
    }
    let span = candidateSpans.find(candidate => occupied.every(existing => !overlaps(candidate, existing)));
    if (!span) {
        for (const candidate of candidateSpans) {
            let adjustedStart = candidate.start;
            let adjustedEnd = candidate.end;
            for (const occ of occupied) {
                if (overlaps({ start: adjustedStart, end: adjustedEnd }, occ)) {
                    if (occ.end > adjustedStart && occ.end < adjustedEnd) {
                        adjustedStart = occ.end;
                    }
                    if (occ.start > adjustedStart && occ.start < adjustedEnd) {
                        adjustedEnd = occ.start;
                    }
                }
            }
            if (adjustedEnd > adjustedStart) {
                const adjustedSlice = normalizeGrounding(source).slice(adjustedStart, adjustedEnd);
                const hasAllFacts = facts.map(sanitizeStr).filter(Boolean).every(fact => containsGroundedPhrase(adjustedSlice, fact));
                if (hasAllFacts) {
                    span = { start: adjustedStart, end: adjustedEnd };
                    break;
                }
            }
        }
    }
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
            const { PDFParse } = await import('pdf-parse');
            const { CanvasFactory } = await import('pdf-parse/worker');
            const parser = new PDFParse({ data: fileBuffer, CanvasFactory });
            try {
                const data = await parser.getText();
                return data.text;
            } finally {
                await parser.destroy();
            }
        }
        if (
            mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            mimetype === 'application/msword' ||
            (fileBuffer && fileBuffer.length > 4 && fileBuffer.slice(0, 4).toString('hex') === '504b0304')
        ) {
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
${source.substring(0, 16000)}
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

    let parsed: any;
    try {
        const { client, model } = providerClient();
        if (model.includes('gpt')) {
            const promptBasics = `Extract basics, summary, and skills as JSON from this resume text.
RESUME:
"""
${source.substring(0, 16000)}
"""
OUTPUT SHAPE:
{
  "basics": {"name":"","email":"","phone":"","location":"","linkedinUrl":"","portfolioUrl":""},
  "summary":"",
  "skills":[{"category":"","items":[]}]
}`;

            const promptExperience = `Extract professional experience records as JSON from this resume text.
RULES:
1. For each role include company, position, startDate, endDate, bullets (extract up to 3 key impactful bullets per role), and exact sourceExcerpt covering that role.
2. For sourceExcerpt, copy the exact continuous substring from the resume text covering that role from its header to its last bullet.
3. If a role has no bullets under it, its sourceExcerpt MUST only contain its title, company and dates—never include text from subsequent roles.
4. Never overlap sourceExcerpts between different roles.
RESUME:
"""
${source.substring(0, 16000)}
"""
OUTPUT SHAPE:
{
  "experience":[{"company":"","position":"","startDate":"","endDate":"","bullets":[],"sourceExcerpt":""}]
}`;

            const promptProjects = `Extract projects as JSON from this resume text (up to 4 key projects).
RULES:
1. For each project include name, description, tools, url, and exact sourceExcerpt covering that project.
2. Never shorten or paraphrase sourceExcerpt; copy the exact substring from the resume text covering that entire project.
RESUME:
"""
${source.substring(0, 16000)}
"""
OUTPUT SHAPE:
{
  "projects":[{"name":"","description":"","tools":[],"url":"","sourceExcerpt":""}]
}`;

            const promptEduCerts = `Extract education, certifications, and awards as JSON from this resume text.
RULES:
1. For each record include its fields and exact sourceExcerpt copied from the resume text.
2. For certifications and awards, sourceExcerpt MUST only be the item name itself as written in the resume (do NOT prepend section headers like "Certifications:").
3. For education, sourceExcerpt MUST be the degree and institution text itself (do NOT prepend section headers like "Education").
RESUME:
"""
${source.substring(0, 16000)}
"""
OUTPUT SHAPE:
{
  "education":[{"institution":"","degree":"","year":"","sourceExcerpt":""}],
  "certifications":[{"name":"","issuer":"","year":"","sourceExcerpt":""}],
  "awards":[{"title":"","description":"","sourceExcerpt":""}]
}`;

            const [res1, res2, res3, res4] = await Promise.all([
                client.chat.completions.create({
                    model,
                    messages: [{ role: 'user', content: promptBasics }],
                    temperature: 0.0,
                    max_tokens: 800,
                    response_format: { type: 'json_object' },
                }),
                client.chat.completions.create({
                    model,
                    messages: [{ role: 'user', content: promptExperience }],
                    temperature: 0.0,
                    max_tokens: 2000,
                    response_format: { type: 'json_object' },
                }),
                client.chat.completions.create({
                    model,
                    messages: [{ role: 'user', content: promptProjects }],
                    temperature: 0.0,
                    max_tokens: 1200,
                    response_format: { type: 'json_object' },
                }),
                client.chat.completions.create({
                    model,
                    messages: [{ role: 'user', content: promptEduCerts }],
                    temperature: 0.0,
                    max_tokens: 800,
                    response_format: { type: 'json_object' },
                }),
            ]);

            const p1 = extractJson(getResponseText(res1)) as any;
            const p2 = extractJson(getResponseText(res2)) as any;
            const p3 = extractJson(getResponseText(res3)) as any;
            const p4 = extractJson(getResponseText(res4)) as any;

            if (!p1 || typeof p1 !== 'object' || !p2 || typeof p2 !== 'object') {
                throw new Error('Resume provider returned invalid or incomplete JSON');
            }
            parsed = {
                basics: p1.basics || { name: '', email: '', phone: '', location: '', linkedinUrl: '', portfolioUrl: '' },
                summary: p1.summary || '',
                skills: Array.isArray(p1.skills) ? p1.skills : [],
                experience: Array.isArray(p2.experience) ? p2.experience : [],
                projects: Array.isArray(p3?.projects) ? p3.projects : [],
                education: Array.isArray(p4?.education) ? p4.education : [],
                certifications: Array.isArray(p4?.certifications) ? p4.certifications : [],
                awards: Array.isArray(p4?.awards) ? p4.awards : [],
            };
        } else {
            const response = await client.chat.completions.create({
                model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.1,
                response_format: { type: 'json_object' },
            });
            parsed = extractJson(getResponseText(response));
        }
    } catch (error) {
        if (error instanceof ResumeProviderUnavailableError) throw error;
        console.error('[RESUME_PARSE_PROVIDER_FAILED]', error);
        throw new ResumeProviderUnavailableError();
    }

    if (!parsed) throw new Error('Resume provider returned invalid JSON');
    return validateProviderExtraction(parsed, source);
};
