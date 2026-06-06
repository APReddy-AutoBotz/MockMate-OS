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
import type { ClearSpeakProfile, ClearSpeakSessionContent } from './types';
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

const passageCache = new Map<string, { content: ClearSpeakSessionContent; ts: number }>();

function getCacheKey(p: ClearSpeakProfile, recentTopics: string[]): string {
  const t = recentTopics.join(',').slice(-30);
  return `${p.role}:${p.level}:${p.goal.slice(0, 20)}:${t}`;
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
  recentTopics: string[]
): Promise<ClearSpeakSessionContent | null> {
  const primaryId = process.env.AI_GEN_PRIMARY || 'gemini';
  const fallbackId = process.env.AI_GEN_FALLBACK || 'groq';

  // 1. Caching Check
  const cacheKey = getCacheKey(profile, recentTopics);
  const cached = passageCache.get(cacheKey);
  const ttl = parseInt(process.env.AI_GEN_CACHE_TTL_SEC || '300') * 1000;
  if (cached && Date.now() - cached.ts < ttl) {
    console.info('[ClearSpeak/Resilience] Serving from cache:', cacheKey);
    return cached.content;
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
        
        // Populate Cache
        passageCache.set(cacheKey, { content: result.content, ts: Date.now() });
        
        return result.content;
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
): Promise<ClearSpeakSessionContent> {
  // FAST PATH: Force exactly 5 hardcoded passages per session to protect API usage
  if (sessionAttemptLength < 5) {
    return selectFallback(profile.level, recentTopics);
  }

  const systemPrompt = buildSystemPrompt(profile, recentTopics);

  const result = await generateWithResilience(profile, systemPrompt, recentTopics);
  if (result) return result;

  // Final Safety net: Use static bank if both providers fail
  console.warn('[ClearSpeak/Resilience] All AI providers failed. Falling back to static content bank.');
  return selectFallback(profile.level, recentTopics);
}

// ─── Validation ───────────────────────────────────────────────────────────────

function isValidContent(raw: unknown): raw is ClearSpeakSessionContent {
  if (!raw || typeof raw !== 'object') return false;
  const c = raw as Partial<ClearSpeakSessionContent>;
  return (
    typeof c.topicTag === 'string' &&
    [1, 2, 3].includes(c.difficultyLevel as number) &&
    Array.isArray(c.keyVocab) && c.keyVocab.length === 3 &&
    Array.isArray(c.passageData) && c.passageData.length > 0 &&
    typeof c.repeatPhrase === 'string' &&
    typeof c.retrySentence === 'string' &&
    typeof c.bridgeReady === 'boolean' &&
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
