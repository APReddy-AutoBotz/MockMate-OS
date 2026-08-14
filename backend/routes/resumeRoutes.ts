import express from 'express';
import multer from 'multer';
import Groq from 'groq-sdk';
import { ResumeDataSchema, ResumeScoreResponseSchema } from 'mockmate-shared';
import {
  GovernedResumeSuggestionResponseSchema,
  RESUME_REWRITE_INTEGRITY_POLICY_VERSION,
  ResumeParseResponseSchema,
  ResumeScoreRequestSchema,
  ResumeSuggestRequestSchema,
} from 'mockmate-shared/resume-integrity';
import { extractTextFromFile, parseResumeToSchema, ResumeProviderUnavailableError } from '../services/resumeParserService';
import { runATSDiagnostics, runJDMatch } from '../services/resumeScoringService';
import {
  assessBulletRewrite,
  assessSummaryRewrite,
  passedResumeRewriteIntegrity,
} from '../services/resumeRewriteIntegrityService';
import { verifyAuthToken } from '../middleware/authMiddleware';
import { enforceUsageLimit } from '../services/usageService';
import { getCachedResult, hashText, setCachedResult } from '../services/cacheService';
import { supabaseAdmin } from '../supabaseAdmin';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set([
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]);
    if (allowed.has(file.mimetype)) return cb(null, true);
    cb(new Error('Please upload a PDF or DOCX resume.'));
  },
});

const providerClient = (): Groq | null => {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  return apiKey ? new Groq({ apiKey }) : null;
};

const providerUnavailable = (res: express.Response) => res.status(503).json({
  error: 'Resume AI service is unavailable because the configured provider is not available.',
  code: 'SERVICE_UNAVAILABLE',
});

const validationError = (res: express.Response, details: unknown) => res.status(400).json({
  error: 'Invalid resume request.',
  code: 'VALIDATION_ERROR',
  details,
});

router.use(verifyAuthToken);

router.post('/parse', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded', code: 'VALIDATION_ERROR' });

    const rawText = await extractTextFromFile(req.file.buffer, req.file.mimetype);
    const resumeData = ResumeDataSchema.parse(await parseResumeToSchema(rawText));
    const payload = ResumeParseResponseSchema.parse({ success: true, rawText, resumeData });
    return res.json(payload);
  } catch (error: any) {
    if (error instanceof ResumeProviderUnavailableError || error?.code === 'RESUME_PROVIDER_UNAVAILABLE') {
      return providerUnavailable(res);
    }
    console.error('[RESUME_PARSE_FAILED]', error?.message || 'unknown');
    return res.status(500).json({ error: 'Failed to parse resume', code: 'INTERNAL_ERROR' });
  }
});

router.post('/score', enforceUsageLimit('resume_review'), async (req, res) => {
  const request = ResumeScoreRequestSchema.safeParse(req.body);
  if (!request.success) return validationError(res, request.error.issues);

  try {
    const { resumeData, rawText, jdText } = request.data;
    const cacheKey = hashText({ resumeData, rawText, jdText });
    const cached = await getCachedResult<unknown>('resume_score', cacheKey);
    const cachedParsed = ResumeScoreResponseSchema.safeParse(cached);
    if (cachedParsed.success) return res.json(cachedParsed.data);

    const atsDiagnostics = runATSDiagnostics(resumeData, rawText);
    const jdMatch = jdText.trim() ? await runJDMatch(resumeData, jdText) : null;
    const payload = ResumeScoreResponseSchema.parse({ success: true, atsDiagnostics, jdMatch });

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
    return res.json(payload);
  } catch (error: any) {
    console.error('[RESUME_SCORE_FAILED]', error?.message || 'unknown');
    return res.status(500).json({ error: 'Failed to score resume', code: 'INTERNAL_ERROR' });
  }
});

router.post('/suggest', enforceUsageLimit('resume_suggestion'), async (req, res) => {
  const request = ResumeSuggestRequestSchema.safeParse(req.body);
  if (!request.success) return validationError(res, request.error.issues);

  const groq = providerClient();
  if (!groq) return providerUnavailable(res);

  try {
    const { resumeData, jdText } = request.data;
    const cacheKey = hashText({ policy: RESUME_REWRITE_INTEGRITY_POLICY_VERSION, resumeData, jdText });
    const cached = await getCachedResult<unknown>('resume_suggest_governed_v1', cacheKey);
    const cachedParsed = GovernedResumeSuggestionResponseSchema.safeParse(cached);
    if (cachedParsed.success) return res.json(cachedParsed.data);

    const allBullets: { expIdx: number; bulletIdx: number; original: string }[] = [];
    (resumeData.experience || []).forEach((exp, expIdx) => {
      (exp.bullets || []).forEach((bullet, bulletIdx) => {
        const original = bullet.trim();
        if (original) allBullets.push({ expIdx, bulletIdx, original });
      });
    });

    if (allBullets.length === 0 && !(resumeData.summary || '').trim()) {
      const emptyPayload = GovernedResumeSuggestionResponseSchema.parse({
        success: true,
        bulletSuggestions: [],
        summarySuggestion: null,
        jdUsed: Boolean(jdText.trim()),
        integrityPolicyVersion: RESUME_REWRITE_INTEGRITY_POLICY_VERSION,
        filteredSuggestionCount: 0,
      });
      return res.json(emptyPayload);
    }

    const hasJD = jdText.trim().length > 50;
    const bulletBlock = allBullets.map((item, i) => `${i + 1}. ${item.original}`).join('\n');
    const resumeEvidence = JSON.stringify(resumeData).substring(0, 12_000);

    const bulletPrompt = `You are a resume wording assistant. You propose wording only; the candidate remains the authority over facts.

NON-NEGOTIABLE RULES:
- Never add a metric, percentage, number, employer, client, technology, certification, skill, responsibility, outcome, scope, or achievement that is not evidenced in the supplied resume.
- A target job description may influence emphasis only. Never convert a JD requirement into candidate experience.
- Never use placeholders such as [X%], [N users], TBD, or invented estimates.
- Preserve every factual number and named technology already present in each bullet.
- Keep the meaning of each bullet unchanged and improve only clarity, action verbs, concision, and ATS readability.
- Return a JSON object exactly shaped as {"suggestions":[{"idx":1,"suggested":"..."}]}.

CANDIDATE RESUME EVIDENCE:\n${resumeEvidence}
${hasJD ? `\nTARGET JD FOR EMPHASIS ONLY:\n${jdText.substring(0, 4_000)}` : ''}

BULLETS:\n${bulletBlock}`;

    const summaryPrompt = (resumeData.summary || '').trim()
      ? `You are a resume wording assistant. Rewrite the professional summary using only facts already evidenced in the candidate resume below. Do not add technologies, years of experience, metrics, job titles, certifications, industries, achievements, or JD requirements unless they are already present in the resume. Do not use placeholders. Return JSON exactly as {"suggested":"..."}.\n\nRESUME EVIDENCE:\n${resumeEvidence}${hasJD ? `\n\nTARGET JD FOR EMPHASIS ONLY:\n${jdText.substring(0, 2_000)}` : ''}\n\nORIGINAL SUMMARY:\n${resumeData.summary}`
      : null;

    const [bulletResponse, summaryResponse] = await Promise.all([
      allBullets.length
        ? groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: bulletPrompt }],
            temperature: 0.1,
            response_format: { type: 'json_object' },
          })
        : Promise.resolve(null),
      summaryPrompt
        ? groq.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: [{ role: 'user', content: summaryPrompt }],
            temperature: 0.1,
            response_format: { type: 'json_object' },
          })
        : Promise.resolve(null),
    ]);

    let filteredSuggestionCount = 0;
    const bulletSuggestions: any[] = [];
    const seen = new Set<number>();

    if (bulletResponse) {
      let candidates: unknown[] = [];
      try {
        const parsed = JSON.parse(bulletResponse.choices?.[0]?.message?.content || '{}');
        candidates = Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];
      } catch {
        candidates = [];
        filteredSuggestionCount += allBullets.length;
      }

      for (const candidate of candidates) {
        const idx = Number((candidate as any)?.idx);
        const suggested = typeof (candidate as any)?.suggested === 'string' ? (candidate as any).suggested.trim() : '';
        if (!Number.isInteger(idx) || idx < 1 || idx > allBullets.length || seen.has(idx) || !suggested) {
          filteredSuggestionCount++;
          continue;
        }
        seen.add(idx);
        const item = allBullets[idx - 1];
        const assessment = assessBulletRewrite(resumeData, item.expIdx, item.bulletIdx, item.original, suggested);
        if (!assessment.safe) {
          filteredSuggestionCount++;
          continue;
        }
        bulletSuggestions.push({ ...item, suggested, integrity: passedResumeRewriteIntegrity() });
      }
    }

    let summarySuggestion: any = null;
    if (summaryResponse && (resumeData.summary || '').trim()) {
      try {
        const parsed = JSON.parse(summaryResponse.choices?.[0]?.message?.content || '{}');
        const suggested = typeof parsed?.suggested === 'string' ? parsed.suggested.trim() : '';
        const original = resumeData.summary || '';
        const assessment = assessSummaryRewrite(resumeData, original, suggested);
        if (suggested && assessment.safe) {
          summarySuggestion = { original, suggested, integrity: passedResumeRewriteIntegrity() };
        } else if (suggested) {
          filteredSuggestionCount++;
        }
      } catch {
        filteredSuggestionCount++;
      }
    }

    const payload = GovernedResumeSuggestionResponseSchema.parse({
      success: true,
      bulletSuggestions,
      summarySuggestion,
      jdUsed: hasJD,
      integrityPolicyVersion: RESUME_REWRITE_INTEGRITY_POLICY_VERSION,
      filteredSuggestionCount,
    });
    await setCachedResult('resume_suggest_governed_v1', cacheKey, payload, 24);
    return res.json(payload);
  } catch (error: any) {
    console.error('[RESUME_SUGGEST_PROVIDER_FAILED]', error?.message || 'unknown');
    return providerUnavailable(res);
  }
});

const legacyRewriteDisabled = (_req: express.Request, res: express.Response) => res.status(410).json({
  error: 'Bulk or auto-applied AI resume rewrites are disabled. Use /api/resume/suggest and accept individual suggestions.',
  code: 'CONFLICT',
});

router.post('/rewrite', legacyRewriteDisabled);
router.post('/rewrite/advanced', legacyRewriteDisabled);
router.post('/rewrite/full', legacyRewriteDisabled);

export default router;
