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
const asArray = (value: unknown): any[] => Array.isArray(value) ? value : [];

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
2. If a field is absent, use an empty string or empty array. Never emit placeholders such as "not specified", "N/A", or example values.
3. Skill category labels may be organizational, but every skill item itself must appear in the source resume.
4. You may normalize whitespace and conventional month names, but do not change factual values.
5. Return only one valid JSON object matching the requested shape.

RAW RESUME TEXT:
"""
${source.substring(0, 30000)}
"""

OUTPUT SHAPE:
{
  "basics": {"name":"","email":"","phone":"","location":"","linkedinUrl":"","portfolioUrl":""},
  "summary":"",
  "skills":[{"category":"","items":[]}],
  "experience":[{"company":"","position":"","startDate":"","endDate":"","bullets":[]}],
  "projects":[{"name":"","description":"","tools":[],"url":""}],
  "education":[{"institution":"","degree":"","year":""}],
  "certifications":[{"name":"","issuer":"","year":""}],
  "awards":[{"title":"","description":""}]
}`;

    const sanitizeStr = (value: unknown): string => {
        if (typeof value !== 'string') return '';
        const text = value.trim();
        if (!text) return '';
        if (/^(string|number|boolean|array|object|null)$/i.test(text)) return '';
        if (/\(optional\)|not specified|not provided/i.test(text)) return '';
        if (/^n\/a$/i.test(text) || text.startsWith('string (')) return '';
        return text;
    };

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
    if (!parsed || typeof parsed !== 'object') throw new Error('Resume provider returned invalid JSON');
    const value: any = parsed;
    const rawBasics = value.basics && typeof value.basics === 'object' ? value.basics : {};

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
        skills: asArray(value.skills)
            .map((group: any) => ({
                category: sanitizeStr(group?.category),
                items: asArray(group?.items).map(sanitizeStr).filter(Boolean),
            }))
            .filter(group => group.category && group.items.length),
        experience: asArray(value.experience)
            .map((experience: any) => ({
                company: sanitizeStr(experience?.company),
                position: sanitizeStr(experience?.position),
                startDate: sanitizeStr(experience?.startDate) || undefined,
                endDate: sanitizeStr(experience?.endDate) || undefined,
                bullets: asArray(experience?.bullets).map(sanitizeStr).filter(Boolean),
            }))
            .filter(experience => experience.company || experience.position || experience.bullets.length),
        projects: asArray(value.projects)
            .map((project: any) => ({
                name: sanitizeStr(project?.name),
                description: sanitizeStr(project?.description),
                tools: asArray(project?.tools).map(sanitizeStr).filter(Boolean),
                url: sanitizeStr(project?.url) || undefined,
            }))
            .filter(project => project.name || project.description || project.tools.length),
        education: asArray(value.education)
            .map((education: any) => ({
                institution: sanitizeStr(education?.institution),
                degree: sanitizeStr(education?.degree),
                year: sanitizeStr(education?.year) || undefined,
            }))
            .filter(education => education.institution || education.degree),
        certifications: asArray(value.certifications)
            .map((certification: any) => ({
                name: sanitizeStr(certification?.name),
                issuer: sanitizeStr(certification?.issuer),
                year: sanitizeStr(certification?.year) || undefined,
            }))
            .filter(certification => certification.name || certification.issuer),
        awards: asArray(value.awards)
            .map((award: any) => ({ title: sanitizeStr(award?.title), description: sanitizeStr(award?.description) }))
            .filter(award => award.title || award.description),
    };

    const resumeData = ResumeDataSchema.parse(candidate);
    const integrity = assessResumeExtraction(source, resumeData);
    if (!integrity.safe) {
        console.error(`[RESUME_PARSE_INTEGRITY_REJECTED] ${integrity.failures.join(',')}`);
        throw new Error('Resume provider output introduced unsupported hard facts');
    }

    return resumeData;
};
