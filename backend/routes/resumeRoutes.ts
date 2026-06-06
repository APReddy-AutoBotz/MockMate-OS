import express from 'express';
import multer from 'multer';
import { extractTextFromFile, parseResumeToSchema } from '../services/resumeParserService';
import { runATSDiagnostics, runJDMatch } from '../services/resumeScoringService';
import Groq from "groq-sdk";
import { verifyAuthToken } from '../middleware/authMiddleware';
import { enforceUsageLimit } from '../services/usageService';
import { getCachedResult, hashText, setCachedResult } from '../services/cacheService';
import { supabaseAdmin } from '../supabaseAdmin';

const apiKey = process.env.GROQ_API_KEY || 'dummy';
const groq = new Groq({ apiKey });

const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = new Set([
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/msword',
            'text/plain',
        ]);
        if (allowed.has(file.mimetype)) return cb(null, true);
        cb(new Error('Please upload a PDF, DOC, DOCX, or TXT resume.'));
    },
});

router.use(verifyAuthToken);

router.post('/parse', upload.single('resume'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { buffer, mimetype } = req.file;

        // Step 1: Extract pure text
        const rawText = await extractTextFromFile(buffer, mimetype);

        // Step 2: Extract JSON Schema from text
        const resumeData = await parseResumeToSchema(rawText);

        res.json({
            success: true,
            rawText, // Providing raw text per the requirement to show what the ATS parsed
            resumeData
        });

    } catch (error: any) {
        console.error('Resume parsing error:', error);
        res.status(500).json({ error: error.message || 'Failed to parse resume' });
    }
});

router.post('/score', enforceUsageLimit('resume_review'), async (req, res) => {
    try {
        const { resumeData, rawText, jdText } = req.body;
        if (!resumeData) return res.status(400).json({ error: 'Missing resume Data' });

        const cacheKey = hashText({ resumeData, rawText: rawText || '', jdText: jdText || '' });
        const cached = await getCachedResult<any>('resume_score', cacheKey);
        if (cached) return res.json({ ...cached, cached: true });

        const atsDiagnostics = runATSDiagnostics(resumeData, rawText || '');
        let jdMatch = null;
        
        if (jdText) {
            jdMatch = await runJDMatch(resumeData, jdText);
        }

        const payload = { success: true, atsDiagnostics, jdMatch };

        if (supabaseAdmin) {
            const userId = (req as any).user?.uid;
            await supabaseAdmin.from('resume_reviews').insert({
                user_id: userId,
                resume_data: resumeData,
                ats_diagnostics: atsDiagnostics,
                jd_match: jdMatch,
                raw_text_hash: hashText(rawText || resumeData),
                jd_hash: jdText ? hashText(jdText) : null,
                created_at: new Date().toISOString(),
            });
        }

        await setCachedResult('resume_score', cacheKey, payload, 24);
        res.json(payload);
    } catch (error: any) {
        console.error('Resume scoring error:', error);
        res.status(500).json({ error: error.message || 'Failed to score resume' });
    }
});

router.post('/rewrite', enforceUsageLimit('resume_suggestion'), async (req, res) => {
    try {
        const { bulletText, actionVerbsNeeded, context } = req.body;

        const prompt = `You are an expert ATS Resume Writer.
Rewrite the following resume bullet point to maximize ATS visibility and recruiter impact.

RULES:
1. Start with a powerful action verb (e.g., Engineered, Spearheaded, Delivered, Optimized, Architected).
2. Format: [Action Verb] + [What you did] + [Measurable result or scale if present in original].
3. Replace weak/vague language with industry-standard ATS-preferred equivalents.
4. Weave in JD keywords naturally if provided.
5. NEVER invent metrics, tools, or achievements not present in the original.
6. Output ONLY the rewritten bullet — no explanation, no quotes.

ORIGINAL BULLET: "${bulletText}"
JD / CONTEXT (for keyword alignment): "${context || 'None provided — use industry-standard ATS language'}"`;

        const response = await groq.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3
        });

        const rewrittenText = response.choices?.[0]?.message?.content || bulletText;
        res.json({ success: true, original: bulletText, suggestion: rewrittenText.trim() });
    } catch (error: any) {
        console.error('Resume rewrite error:', error);
        res.status(500).json({ error: error.message || 'Failed to rewrite bullet' });
    }
});

router.post('/rewrite/advanced', enforceUsageLimit('resume_suggestion'), async (req, res) => {
    try {
        const { resumeData } = req.body;
        
        const prompt = `You are an expert Resume Stylist.
Task: Take this resume JSON. Group the 'skills' list logically into solid taxonomies (e.g., Languages, Frameworks, Architecture, Soft Skills). Do not invent skills. Then, polish the 'summary' to sound highly professional, confident, and action-oriented. Do not invent experience.

ORIGINAL JSON:
${JSON.stringify({ skills: resumeData.skills, summary: resumeData.summary })}

Output MUST be valid JSON:
{
  "skills": [ { "category": "string", "items": ["string"] } ],
  "summary": "string"
}`;

        const response = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile', // Use the heavier model for complex taxonomy
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            response_format: { type: 'json_object' }
        });

        const resultJson = JSON.parse(response.choices?.[0]?.message?.content || '{}');

        res.json({ success: true, advancedData: resultJson });
    } catch (error: any) {
        console.error('Advanced rewrite error:', error);
        res.status(500).json({ error: error.message || 'Failed to deep polish' });
    }
});

// ─── FULL ATS OPTIMISATION (called automatically after Diagnostics) ──────────
// Rewrites the entire resume — all bullets, summary, and skill groupings —
// using JD keywords if provided, or industry-standard ATS vocabulary if not.
router.post('/rewrite/full', enforceUsageLimit('resume_suggestion'), async (req, res) => {
    try {
        const { resumeData, jdText } = req.body;
        if (!resumeData) return res.status(400).json({ error: 'Missing resumeData' });

        const hasJD = jdText && jdText.trim().length > 50;

        const prompt = `You are a world-class ATS Resume Optimizer working at a top career coaching firm.

Your task is to rewrite an entire resume to maximize ATS compatibility and recruiter impact.

${
  hasJD
    ? `A TARGET JOB DESCRIPTION has been provided. You MUST:
- Extract the key required skills, tools, and keywords from the JD.
- Naturally weave these keywords into the rewritten bullets and summary (only where they make factual sense — do NOT fabricate).
- Align the summary to speak directly to this role.

JOB DESCRIPTION:
"""
${jdText.substring(0, 4000)}
"""`
    : `No JD was provided. You MUST:
- Use industry-standard ATS vocabulary based on the candidate's detected role and industry.
- Use strong, recognized action verbs (Engineered, Spearheaded, Delivered, Optimized, Collaborated, Managed, Analysed, Designed, Implemented, Streamlined, Reduced, Increased, Led, Coordinated, Launched, Resolved).
- Insert quantification placeholders like [X%] or [N users] ONLY if there is no metric in the original — but mark them with [_] so the user knows to fill them in.`
}

RULES (CRITICAL — never violate these):
1. NEVER invent job titles, companies, tools, skills, metrics, or achievements not present in the original.
2. Keep factual content identical — only rewrite the LANGUAGE, not the substance.
3. Each bullet must start with a strong action verb.
4. Bullets must follow the format: [Action Verb] + [What was done] + [Outcome/Scale if available].
5. Summary must be 3-4 sentences max: professional tone, role-specific, keyword-rich.
6. Skills must be grouped logically into categories (e.g., Programming Languages, Frameworks, Tools, Methodologies, Soft Skills).
7. Output MUST be valid JSON conforming exactly to the schema below. No extra text.

ORIGINAL RESUME JSON:
${JSON.stringify(resumeData, null, 2).substring(0, 8000)}

OUTPUT SCHEMA (return ONLY this JSON, no markdown):
{
  "summary": "string",
  "experience": [
    {
      "company": "string (unchanged)",
      "position": "string (unchanged)",
      "startDate": "string (unchanged)",
      "endDate": "string (unchanged)",
      "bullets": ["string (rewritten)"]
    }
  ],
  "skills": [
    { "category": "string", "items": ["string"] }
  ]
}`;

        const response = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.15,
            response_format: { type: 'json_object' }
        });

        const rawJson = response.choices?.[0]?.message?.content || '{}';
        const result = JSON.parse(rawJson);

        // Merge rewritten fields back onto original data (preserve basics/education/projects)
        const optimisedResume = {
            ...resumeData,
            summary: result.summary || resumeData.summary,
            experience: result.experience || resumeData.experience,
            skills: result.skills || resumeData.skills
        };

        res.json({ success: true, optimisedResume, jdUsed: hasJD });
    } catch (error: any) {
        console.error('Full rewrite error:', error);
        res.status(500).json({ error: error.message || 'Failed to optimise resume' });
    }
});

// Returns per-bullet ATS proposals — user accepts or rejects each one individually
router.post('/suggest', enforceUsageLimit('resume_suggestion'), async (req, res) => {
    try {
        const { resumeData, jdText } = req.body;
        if (!resumeData) return res.status(400).json({ error: 'Missing resumeData' });

        const cacheKey = hashText({ resumeData, jdText: jdText || '' });
        const cached = await getCachedResult<any>('resume_suggest', cacheKey);
        if (cached) return res.json({ ...cached, cached: true });

        const hasJD = jdText && jdText.trim().length > 50;
        const allBullets: { expIdx: number; bulletIdx: number; original: string }[] = [];

        (resumeData.experience || []).forEach((exp: any, expIdx: number) => {
            (exp.bullets || []).forEach((b: string, bulletIdx: number) => {
                if (b && b.trim()) allBullets.push({ expIdx, bulletIdx, original: b.trim() });
            });
        });

        if (allBullets.length === 0) {
            return res.json({ success: true, bulletSuggestions: [], summarySuggestion: null });
        }

        const bulletBlock = allBullets.map((item, i) => `${i + 1}. "${item.original}"`).join('\n');

        const prompt = `You are an expert ATS Resume Writer.

${
  hasJD
    ? `Target Job Description (use its keywords where factually appropriate):\n"""\n${jdText.substring(0, 3000)}\n"""`
    : `No JD provided. Use industry-standard ATS vocabulary and strong action verbs.`
}

For each numbered bullet below, write an improved ATS-optimised version.
RULES:
- Start each bullet with a strong action verb.
- Use the format: [Action Verb] + [What was done] + [Outcome/scale if originally present].
- NEVER invent facts, metrics, tools, or achievements not in the original.
- Only rewrite the LANGUAGE — preserve all factual content.
- If a bullet is already strong, you may keep it identical.
- Output ONLY valid JSON.

BULLETS TO IMPROVE:
${bulletBlock}

OUTPUT (return ONLY this JSON array, no other text):
[
  { "idx": 1, "suggested": "Rewritten bullet text here" },
  { "idx": 2, "suggested": "Rewritten bullet text here" }
]`;

        // Also get a summary suggestion
        const summaryPrompt = resumeData.summary && resumeData.summary.length > 20
            ? `Rewrite this professional summary to be ATS-optimised, keyword-rich, and 3-4 sentences max.${hasJD ? ` Align it to this job: ${jdText.substring(0, 1000)}` : ' Use industry-standard language for the candidate role.'}

ORIGINAL SUMMARY: "${resumeData.summary}"

Output ONLY the rewritten summary text.`
            : null;

        const [bulletsRes, summaryRes] = await Promise.all([
            groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.15,
                response_format: { type: 'json_object' }
            }),
            summaryPrompt ? groq.chat.completions.create({
                model: 'llama-3.1-8b-instant',
                messages: [{ role: 'user', content: summaryPrompt }],
                temperature: 0.2
            }) : Promise.resolve(null)
        ]);

        // Parse bullet suggestions
        let parsedBullets: { idx: number; suggested: string }[] = [];
        try {
            const raw = bulletsRes.choices?.[0]?.message?.content || '{}';
            const parsed = JSON.parse(raw);
            // The model may return { suggestions: [...] } or just [...]
            const arr = Array.isArray(parsed) ? parsed : (parsed.suggestions || parsed.bullets || Object.values(parsed)[0] || []);
            parsedBullets = Array.isArray(arr) ? arr : [];
        } catch { parsedBullets = []; }

        // Map back to expIdx/bulletIdx
        const bulletSuggestions = parsedBullets
            .filter((p: any) => p && p.idx && p.suggested)
            .map((p: any) => {
                const item = allBullets[p.idx - 1];
                if (!item) return null;
                return { expIdx: item.expIdx, bulletIdx: item.bulletIdx, original: item.original, suggested: p.suggested.trim() };
            })
            .filter(Boolean);

        const summarySuggestion = summaryRes
            ? (summaryRes.choices?.[0]?.message?.content || '').trim() || null
            : null;

        const payload = { success: true, bulletSuggestions, summarySuggestion, jdUsed: hasJD };
        await setCachedResult('resume_suggest', cacheKey, payload, 24);
        res.json(payload);
    } catch (error: any) {
        console.error('Suggest error:', error);
        res.status(500).json({ error: error.message || 'Failed to generate suggestions' });
    }
});

export default router;
