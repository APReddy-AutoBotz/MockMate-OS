/**
 * backend/clearspeak/generateService.ts
 * Mockmate ClearSpeak — High-resiliency AI content generation service.
 *
 * Implements a Multi-Provider Adapter Bridge (implementation_plan.md).
 * Primary: Gemini-2.5-Flash (Strict Schema)
 * Fallback: Groq/Llama-3.3-70B (Best-Effort JSON + Strict Validation)
 * Circuit Breaker: 120s cooldown after 3 consecutive failures.
 * Caching: 5-minute TTL on generated passages.
 */

import { GoogleGenAI, Type } from '@google/genai';
import OpenAI from 'openai';
import crypto from 'crypto';
import {
  ClearSpeakSessionContentSchema,
  type ClearSpeakProfile,
  type ClearSpeakSessionContent,
} from 'mockmate-shared';
import {
  buildSystemPrompt,
  CLEARSPEAK_CONTENT_SCHEMA,
  FALLBACK_CONTENT,
} from './contentSchema';

// ─── Interfaces & Types ───────────────────────────────────────────────────────

interface AdapterResult {
  content: ClearSpeakSessionContent | null;
  error?: string;
  latency: number;
  tokens?: { prompt: number; completion: number };
  model: string;
}

interface ClearSpeakAdapter {
  id: string;
  call(prompt: string): Promise<AdapterResult>;
}

// ─── Operational State ────────────────────────────────────────────────────────
// Simplified in-memory state. Note: Resets on server restart.

const circuitBreaker = {
  failures: new Map<string, number>(),
  cooldownUntil: new Map<string, number>(),
};

type PassageCacheEntry = { content: ClearSpeakSessionContent; ts: number };

export class BoundedPassageCache {
  private readonly entries = new Map<string, PassageCacheEntry>();

  get(key: string, now: number, ttlMs: number): ClearSpeakSessionContent | null {
    this.pruneExpired(now, ttlMs);
    const cached = this.entries.get(key);
    return cached ? cached.content : null;
  }

  set(key: string, content: ClearSpeakSessionContent, now: number, maxEntries: number): void {
    if (this.entries.has(key)) this.entries.delete(key);
    while (this.entries.size >= maxEntries) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (!oldest) break;
      this.entries.delete(oldest);
    }
    this.entries.set(key, { content, ts: now });
  }

  pruneExpired(now: number, ttlMs: number): void {
    for (const [key, entry] of this.entries) {
      if (now - entry.ts >= ttlMs) this.entries.delete(key);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}

const passageCache = new BoundedPassageCache();

function boundedPositiveEnvInt(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

export function getClearSpeakGenerationCacheKey(
  profile: ClearSpeakProfile,
  systemPrompt: string,
  recentTopics: string[],
  grounding?: { summary: string; vocabulary: string[] },
): string {
  // Only the digest is retained. Full prompt inputs and consented grounding
  // excerpts never become cache keys, logs, or observable identifiers.
  const input = JSON.stringify({
    ownerScope: profile.userId,
    profile,
    recentTopics,
    systemPrompt,
    grounding: grounding ?? null,
    providers: {
      primary: process.env.AI_GEN_PRIMARY || 'gemini',
      primaryModel: process.env.AI_GEN_MODEL_PRIMARY || 'gemini-2.5-flash',
      fallback: process.env.AI_GEN_FALLBACK || 'groq',
      fallbackModel: process.env.AI_GEN_MODEL_FALLBACK || 'llama-3.3-70b-versatile',
    },
  });
  return crypto.createHash('sha256').update(input).digest('hex');
}

// ─── Gemini Adapter (Primary) ─────────────────────────────────────────────────

class GeminiAdapter implements ClearSpeakAdapter {
  readonly id = 'gemini';
  private modelId = process.env.AI_GEN_MODEL_PRIMARY || 'gemini-2.5-flash';

  private schema = {
    type: Type.OBJECT,
    required: [
      'topicTag', 'difficultyLevel', 'targetSkill', 'keyVocab',
      'passageData', 'repeatPhrase', 'retrySentence', 'bridgeReady', 'interviewBridgeQuestion',
    ],
    properties: {
      topicTag:        { type: Type.STRING },
      difficultyLevel: { type: Type.NUMBER },
      targetSkill:     { type: Type.STRING },
      keyVocab:        { type: Type.ARRAY, items: { type: Type.STRING } },
      passageData: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          required: ['text', 'isStressed', 'pauseType'],
          properties: {
            text:       { type: Type.STRING },
            isStressed: { type: Type.BOOLEAN },
            pauseType:  { type: Type.STRING, enum: ['none', 'short', 'stop'] },
          },
        },
      },
      repeatPhrase:            { type: Type.STRING },
      retrySentence:           { type: Type.STRING },
      bridgeReady:             { type: Type.BOOLEAN },
      interviewBridgeQuestion: { type: Type.STRING },
    },
  };

  async call(prompt: string): Promise<AdapterResult> {
    const start = Date.now();
    try {
      const apiKey = process.env.GOOGLE_API_KEY;
      if (!apiKey) throw new Error('Missing GOOGLE_API_KEY');

      const genAI = new GoogleGenAI({ apiKey });
      const response = await genAI.models.generateContent({
        model: this.modelId,
        config: {
          responseMimeType: 'application/json',
          responseSchema: this.schema as any,
          temperature: 0.7,
        },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });

      const text = response.text;
      const content = JSON.parse(text);

      return {
        content,
        latency: Date.now() - start,
        model: this.modelId,
      };
    } catch (err: any) {
      return {
        content: null,
        error: err.message || 'Gemini error',
        latency: Date.now() - start,
        model: this.modelId,
      };
    }
  }
}

// ─── Groq Adapter (Fallback) ──────────────────────────────────────────────────

class GroqAdapter implements ClearSpeakAdapter {
  readonly id = 'groq';
  private modelId = process.env.AI_GEN_MODEL_FALLBACK || 'llama-3.3-70b-versatile';

  async call(prompt: string): Promise<AdapterResult> {
    const start = Date.now();
    try {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) throw new Error('Missing GROQ_API_KEY');

      const client = new OpenAI({
        apiKey,
        baseURL: 'https://api.groq.com/openai/v1',
      });

      const response = await client.chat.completions.create({
        model: this.modelId,
        messages: [
          { role: 'system', content: 'Respond strictly in JSON format matching the schema provided.' },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.5,
      });

      const text = response.choices[0]?.message?.content;
      if (!text) throw new Error('Empty response from Groq');
      
      const content = JSON.parse(text);

      return {
        content,
        latency: Date.now() - start,
        model: this.modelId,
        tokens: {
          prompt: response.usage?.prompt_tokens || 0,
          completion: response.usage?.completion_tokens || 0,
        },
      };
    } catch (err: any) {
      return {
        content: null,
        error: err.message || 'Groq error',
        latency: Date.now() - start,
        model: this.modelId,
      };
    }
  }
}

// ─── Resiliency Orchestrator ──────────────────────────────────────────────────

const adapters: Record<string, ClearSpeakAdapter> = {
  gemini: new GeminiAdapter(),
  groq: new GroqAdapter(),
};

async function generateWithResilience(
  profile: ClearSpeakProfile,
  systemPrompt: string,
  recentTopics: string[],
  grounding?: { summary: string; vocabulary: string[] },
): Promise<ClearSpeakSessionContent | null> {
  const primaryId = process.env.AI_GEN_PRIMARY || 'gemini';
  const fallbackId = process.env.AI_GEN_FALLBACK || 'groq';

  // 1. Caching Check
  const cacheKey = getClearSpeakGenerationCacheKey(profile, systemPrompt, recentTopics, grounding);
  const now = Date.now();
  const ttl = boundedPositiveEnvInt(process.env.AI_GEN_CACHE_TTL_SEC, 300, 3_600) * 1000;
  const maxEntries = boundedPositiveEnvInt(process.env.AI_GEN_CACHE_MAX_ENTRIES, 100, 500);
  const cached = passageCache.get(cacheKey, now, ttl);
  if (cached) {
    console.info('[ClearSpeak/Resilience] Serving owner-scoped cached content.');
    return cached;
  }

  const routine = [primaryId, fallbackId];

  for (const providerId of routine) {
    const adapter = adapters[providerId];
    if (!adapter) continue;

    // 2. Health / Circuit Breaker Check
    const cooldown = circuitBreaker.cooldownUntil.get(providerId) || 0;
    if (Date.now() < cooldown) {
      console.warn(`[ClearSpeak/Resilience] Skipping ${providerId} (Cooldown active)`);
      continue;
    }

    try {
      const result = await adapter.call(systemPrompt);

      // 3. Validation Pass
      const isValid = result.content && isValidContent(result.content);

      // 4. Observability Logging
      console.log(JSON.stringify({
        type: 'cs_gen_observability',
        provider: providerId,
        model: result.model,
        latency_ms: result.latency,
        status: isValid ? 'success' : 'fail',
        error: result.error,
        schema_valid: isValid,
        tokens: result.tokens,
      }));

      if (isValid && result.content) {
        // Reset failure counter on success
        circuitBreaker.failures.set(providerId, 0);

        // A schema-valid provider response is not, by itself, evidence that the
        // provider used the consented snapshot. Ground every accepted provider
        // response with the same deterministic transformation as the safety
        // fallback before it can be cached or persisted as snapshot-bound.
        const acceptedContent = grounding?.summary
          ? applyAuthoritativeGrounding(result.content, profile, grounding)
          : result.content;
        
        // Populate Cache
        passageCache.set(cacheKey, acceptedContent, Date.now(), maxEntries);
        
        return acceptedContent;
      }

      // Handle Failure / Bad Schema
      const fails = (circuitBreaker.failures.get(providerId) || 0) + 1;
      circuitBreaker.failures.set(providerId, fails);
      if (fails >= 3) {
        console.error(`[ClearSpeak/Resilience] Tripping circuit breaker for ${providerId}`);
        circuitBreaker.cooldownUntil.set(providerId, Date.now() + 120000); // 120s
      }
    } catch (err) {
      console.error(`[ClearSpeak/Resilience] Critical error in ${providerId} adapter:`, err);
    }
  }

  return null;
}

// ─── Public Generator ─────────────────────────────────────────────────────────

export async function generateSession(
  profile: ClearSpeakProfile,
  recentTopics: string[] = [],
  sessionAttemptLength: number = 0,
  grounding?: { summary: string; vocabulary: string[] },
): Promise<ClearSpeakSessionContent> {
  // FAST PATH: Force exactly 5 hardcoded passages per session to protect API usage
  if (sessionAttemptLength < 5) {
    const fallback = selectFallback(profile.level, recentTopics);
    if (!grounding?.summary) return fallback;
    return applyAuthoritativeGrounding(fallback, profile, grounding);
  }

  const systemPrompt = buildSystemPrompt(profile, recentTopics, grounding?.summary);

  const result = await generateWithResilience(profile, systemPrompt, recentTopics, grounding);
  if (result) return result;

  // Final Safety net: Use static bank if both providers fail
  console.warn('[ClearSpeak/Resilience] All AI providers failed. Falling back to static content bank.');
  const fallback = selectFallback(profile.level, recentTopics);
  if (!grounding?.summary) return fallback;
  return applyAuthoritativeGrounding(fallback, profile, grounding);
}

/**
 * Makes the authoritative snapshot facts materially affect every grounded
 * ClearSpeak artifact, regardless of whether its base content came from a
 * provider or the static safety bank. Keeping this transformation shared is a
 * server-side guarantee: schema-valid but generic provider output cannot be
 * accepted as grounded merely because the prompt contained snapshot facts.
 */
export function applyAuthoritativeGrounding(
  content: ClearSpeakSessionContent,
  profile: ClearSpeakProfile,
  grounding: { summary: string; vocabulary: string[] },
): ClearSpeakSessionContent {
  const boundedSummary = grounding.summary.trim().slice(0, 12_000);
  const passageText = boundedSummary.slice(0, 240).trim() ||
    `Practice a concise update for ${profile.role}`.slice(0, 240);
  const groundedVocabulary = grounding.vocabulary
    .map(word => word.trim().slice(0, 80))
    .filter(Boolean);
  const keyVocab = [...new Set([...groundedVocabulary, ...content.keyVocab])].slice(0, 3);
  const grounded = {
    ...content,
    topicTag: `Resume practice: ${groundedVocabulary.slice(0, 2).join(' / ') || profile.role}`.slice(0, 80),
    keyVocab,
    passageData: [{ text: passageText, isStressed: false, pauseType: 'stop' as const }],
    repeatPhrase: passageText.split(/\s+/).slice(0, 12).join(' '),
    retrySentence: passageText.split(/\s+/).slice(0, 18).join(' '),
  };
  return ClearSpeakSessionContentSchema.parse(grounded);
}

// ─── Validation ───────────────────────────────────────────────────────────────

function isValidContent(raw: unknown): raw is ClearSpeakSessionContent {
  const parsed = ClearSpeakSessionContentSchema.safeParse(raw);
  if (!parsed.success) return false;
  const c = parsed.data;
  return (
    c.keyVocab.length === 3 &&
    typeof c.repeatPhrase === 'string' &&
    typeof c.retrySentence === 'string' &&
    typeof c.interviewBridgeQuestion === 'string'
  );
}

// ─── Static Fallback Bank ─────────────────────────────────────────────────────

function selectFallback(
  level: ClearSpeakProfile['level'],
  recentTopics: string[] = [],
): ClearSpeakSessionContent {
  const levelMatches = FALLBACK_CONTENT.filter(f => f.difficultyLevel === level);
  const pool = levelMatches.length > 0 ? levelMatches : FALLBACK_CONTENT;
  const fresh = pool.filter(f => !recentTopics.includes(f.topicTag));
  const candidates = fresh.length > 0 ? fresh : pool;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
