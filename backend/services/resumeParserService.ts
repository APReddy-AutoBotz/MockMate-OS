const pdfParse = require('pdf-parse');
import * as mammoth from 'mammoth';
import Groq from "groq-sdk";
import { ResumeData } from '../types';

const apiKey = process.env.GROQ_API_KEY || 'dummy';
const groq = new Groq({ apiKey });

const extractJson = (text: string): any => {
    if (!text) return null;
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
};

const getResponseText = (response: any): string => {
    if (!response) return '';
    return response.choices?.[0]?.message?.content || '';
};

export const extractTextFromFile = async (fileBuffer: Buffer, mimetype: string): Promise<string> => {
    try {
        if (mimetype === 'application/pdf') {
            const data = await pdfParse(fileBuffer);
            return data.text;
        } else if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || mimetype === 'application/msword') {
            const result = await mammoth.extractRawText({ buffer: fileBuffer });
            return result.value;
        } else {
            throw new Error(`Unsupported file type: ${mimetype}. Only PDF and DOCX are supported.`);
        }
    } catch (error) {
        console.error("Error extracting text:", error);
        throw new Error("Failed to extract text from file. The document may be corrupted or encrypted.");
    }
}

export const parseResumeToSchema = async (rawText: string): Promise<ResumeData> => {
    const prompt = `You are a highly analytical resume parsing engine.
Your task is to take the following raw extracted text from a resume and precisely map it to the provided JSON schema.

RULES:
1. Extract ONLY what is literally present in the document. DO NOT hallucinate, invent, or describe what a field should be.
2. If a field is not present in the text, output an empty string "" or empty array [] for that field. NEVER output placeholder text like "not specified", "N/A", "optional", or the field name itself.
3. For skills, group them into logical categories (e.g., "Languages", "Frameworks", "Tools", "Soft Skills").
4. Normalize dates to standard string formats (e.g., "Jan 2020", "Present").
5. Return ONLY a valid JSON object. No markdown, no explanation.

RAW RESUME TEXT:
"""
${rawText.substring(0, 30000)}
"""

OUTPUT JSON SCHEMA:
{
    "basics": {
        "name": "",
        "email": "",
        "phone": "",
        "location": "",
        "linkedinUrl": "",
        "portfolioUrl": ""
    },
    "summary": "",
    "skills": [
        { "category": "", "items": [] }
    ],
    "experience": [
        { "company": "", "position": "", "startDate": "", "endDate": "", "bullets": [] }
    ],
    "projects": [
        { "name": "", "description": "", "tools": [], "url": "" }
    ],
    "education": [
        { "institution": "", "degree": "", "year": "" }
    ],
    "certifications": [
        { "name": "", "issuer": "", "year": "" }
    ],
    "awards": [
        { "title": "", "description": "" }
    ]
}`;

    // Strip values that look like AI schema bleed-through
    const sanitizeStr = (v: any): string => {
        if (typeof v !== 'string') return '';
        const t = v.trim();
        if (!t) return '';
        if (/^(string|number|boolean|array|object)$/i.test(t)) return '';
        if (/\(optional\)/i.test(t)) return '';
        if (/not specified/i.test(t)) return '';
        if (/not provided/i.test(t)) return '';
        if (/^n\/a$/i.test(t)) return '';
        if (/^null$/i.test(t)) return '';
        if (t.startsWith('string (')) return '';
        return t;
    };

    try {
        const response = await groq.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            response_format: { type: 'json_object' }
        });

        const jsonString = getResponseText(response);
        const parsed = extractJson(jsonString);

        if (!parsed) {
            throw new Error("Failed to parse AI response into valid JSON");
        }

        // Sanitize basics fields
        const rawBasics = parsed.basics || {};
        const resumeData: ResumeData = {
            basics: {
                name:         sanitizeStr(rawBasics.name),
                email:        sanitizeStr(rawBasics.email),
                phone:        sanitizeStr(rawBasics.phone),
                location:     sanitizeStr(rawBasics.location),
                linkedinUrl:  sanitizeStr(rawBasics.linkedinUrl)  || undefined,
                portfolioUrl: sanitizeStr(rawBasics.portfolioUrl) || undefined,
            },
            summary:        sanitizeStr(parsed.summary),
            skills:         (parsed.skills || []).map((sg: any) => ({ category: sanitizeStr(sg.category), items: (sg.items || []).map(sanitizeStr).filter(Boolean) })).filter((sg: any) => sg.category && sg.items.length),
            experience:     (parsed.experience || []).map((exp: any) => ({ company: sanitizeStr(exp.company), position: sanitizeStr(exp.position), startDate: sanitizeStr(exp.startDate), endDate: sanitizeStr(exp.endDate), bullets: (exp.bullets || []).map(sanitizeStr).filter(Boolean) })),
            projects:       (parsed.projects || []).map((p: any) => ({ name: sanitizeStr(p.name), description: sanitizeStr(p.description), tools: (p.tools || []).map(sanitizeStr).filter(Boolean), url: sanitizeStr(p.url) || undefined })),
            education:      (parsed.education || []).map((edu: any) => ({ institution: sanitizeStr(edu.institution), degree: sanitizeStr(edu.degree), year: sanitizeStr(edu.year) })),
            certifications: (parsed.certifications || []).map((c: any) => ({ name: sanitizeStr(c.name), issuer: sanitizeStr(c.issuer), year: sanitizeStr(c.year) })),
            awards:         (parsed.awards || []).map((a: any) => ({ title: sanitizeStr(a.title), description: sanitizeStr(a.description) }))
        };

        return resumeData;
    } catch (e) {
        console.error("Error structuring resume data with AI:", e);
        throw new Error("Failed to map resume text to schema");
    }
}
