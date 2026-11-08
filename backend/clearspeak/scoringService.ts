/**
 * backend/clearspeak/scoringService.ts
 * MockMate ClearSpeak — transcript/timing practice-feedback pipeline.
 *
 * Scoring model (source of truth: implementation_plan.md §11):
 *   Match    50%  — Normalised transcript similarity vs. expected passage text
 *   Pacing   25%  — WPM against level-specific band (not a flat threshold)
 *   Rhythm   25%  — Pause adherence mapped from word timestamps
 *   HardWord +5   — Additive modifier only (never subtracts from base score)
 *
 * Transcription: Groq whisper-large-v3, verbose_json with word timestamps.
 *
 * Privacy: Raw audio buffers MUST be destroyed after this pipeline.
 * See implementation_plan.md §14 — Audio Privacy & Retention Policy.
 */

import OpenAI, { toFile } from 'openai';
import { Readable } from 'stream';
import {
  ClearSpeakSessionScoreSchema,
  type ClearSpeakSessionContent,
  type ClearSpeakSessionScore,
  type HardWordEntry,
} from 'mockmate-shared';
import { runtimeMode } from '../config/runtimeConfig';
import { WPM_BANDS } from './contentSchema';

export const CLEAR_SPEAK_SCORE_EVIDENCE_BASIS = 'transcript_timing_heuristic' as const;
export const CLEAR_SPEAK_SCORING_UNAVAILABLE_MESSAGE =
  'Scored delivery practice is temporarily unavailable. UK / US reference-style practice is still available without a delivery score.';

export class ClearSpeakScoringUnavailableError extends Error {
  readonly code = 'SERVICE_UNAVAILABLE';
  readonly status = 503;

  constructor(message = CLEAR_SPEAK_SCORING_UNAVAILABLE_MESSAGE) {
    super(message);
    this.name = 'ClearSpeakScoringUnavailableError';
  }
}

export function isClearSpeakScoringAvailable(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(env.OPENAI_API_KEY?.trim() || env.GROQ_API_KEY?.trim());
}

/**
 * User-facing scored practice stays fail-closed until generation and scoring
 * can reserve quota atomically before provider work. The isolated test runtime
 * may still exercise the adapter; development, preview and production cannot.
 */
export function isGovernedClearSpeakScoringAvailable(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  try {
    if (env !== process.env && env.MOCKMATE_RUNTIME_MODE && env.MOCKMATE_RUNTIME_MODE !== 'test') {
      return false;
    }
    return isClearSpeakScoringAvailable(env);
  } catch {
    return false;
  }
}

const MAX_TRANSCRIPT_TEXT_CHARS = 12_000;
const MAX_TRANSCRIPT_WORDS = 4_096;

// ─── Transcript Shape ─────────────────────────────────────────────────────────

interface TranscriptWord {
  word: string;
  start: number; // seconds
  end: number;
}

interface TranscriptResult {
  text: string;
  words: TranscriptWord[];
}

export function validateTranscriptEvidence(input: unknown): TranscriptResult {
  if (!input || typeof input !== 'object') {
    throw new ClearSpeakScoringUnavailableError('Speech timing evidence was unavailable. Please try the recording again.');
  }
  const candidate = input as { text?: unknown; words?: unknown };
  if (typeof candidate.text !== 'string' || candidate.text.trim().length === 0 ||
      candidate.text.length > MAX_TRANSCRIPT_TEXT_CHARS || !Array.isArray(candidate.words) ||
      candidate.words.length < 2 || candidate.words.length > MAX_TRANSCRIPT_WORDS) {
    throw new ClearSpeakScoringUnavailableError('Speech timing evidence was unavailable. Please try the recording again.');
  }

  const words: TranscriptWord[] = [];
  let previousStart = -1;
  let previousEnd = -1;
  for (const rawWord of candidate.words) {
    if (!rawWord || typeof rawWord !== 'object') {
      throw new ClearSpeakScoringUnavailableError('Speech timing evidence was unavailable. Please try the recording again.');
    }
    const { word, start, end } = rawWord as { word?: unknown; start?: unknown; end?: unknown };
    if (typeof word !== 'string' || word.trim().length === 0 || word.length > 240 ||
        typeof start !== 'number' || typeof end !== 'number' ||
        !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start ||
        start < previousStart || end < previousEnd) {
      throw new ClearSpeakScoringUnavailableError('Speech timing evidence was unavailable. Please try the recording again.');
    }
    words.push({ word, start, end });
    previousStart = start;
    previousEnd = end;
  }
  if (words[words.length - 1].end <= words[0].start) {
    throw new ClearSpeakScoringUnavailableError('Speech timing evidence was unavailable. Please try the recording again.');
  }
  return { text: candidate.text, words };
}

// ─── Transcribe Audio ─────────────────────────────────────────────────────────

/**
 * Transcribes audio using Groq whisper-large-v3 with word-level timestamps.
 * The audio buffer is wrapped in a Readable stream — it is NOT written to disk.
 * The buffer reference must be released by the caller after this resolves.
 *
 * Provider: Groq (OpenAI-compatible audio transcriptions API)
 * Model: whisper-large-v3
 * Response format: verbose_json (required for word timestamps)
 */
async function transcribeAudio(audioBuffer: Buffer): Promise<TranscriptResult> {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey && !openaiKey) {
    throw new ClearSpeakScoringUnavailableError();
  }

  const client = openaiKey
    ? new OpenAI({
        apiKey: openaiKey,
        timeout: 90_000,
        maxRetries: 0,
      })
    : new OpenAI({
        apiKey: apiKey!,
        baseURL: 'https://api.groq.com/openai/v1',
        timeout: 90_000,
        maxRetries: 0,
      });

  const model = openaiKey ? 'whisper-1' : 'whisper-large-v3';

  try {
    const audioFile = await toFile(audioBuffer, 'recording.webm', { type: 'audio/webm' });

    let response: any;
    try {
      response = await client.audio.transcriptions.create({
        model,
        file: audioFile,
        response_format: 'verbose_json',
        timestamp_granularities: ['word'],
      });
    } catch (wordErr: any) {
      console.warn('[ClearSpeak] Word timestamp request failed, retrying standard verbose_json:', wordErr?.message);
      response = await client.audio.transcriptions.create({
        model,
        file: audioFile,
        response_format: 'verbose_json',
      });
    }

    const text = typeof response === 'string' ? response : (response?.text || '');
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      throw new ClearSpeakScoringUnavailableError('No speech was detected in your recording. Please try speaking closer to the microphone.');
    }

    // Extract or sanitize words
    let words: TranscriptWord[] = [];
    if (Array.isArray(response?.words) && response.words.length >= 2) {
      let prevStart = 0;
      let prevEnd = 0.05;
      for (const w of response.words) {
        if (!w || typeof w.word !== 'string') continue;
        const wText = w.word.trim();
        if (!wText) continue;
        const rawStart = typeof w.start === 'number' && Number.isFinite(w.start) ? Math.max(0, w.start) : prevEnd;
        const start = Math.max(prevStart, rawStart);
        const rawEnd = typeof w.end === 'number' && Number.isFinite(w.end) ? w.end : start + 0.2;
        const end = Math.max(start + 0.05, Math.max(prevEnd, rawEnd));
        words.push({ word: wText, start, end });
        prevStart = start;
        prevEnd = end;
      }
    }

    // If word timestamps are missing or sparse, extract from segments
    if (words.length < 2 && Array.isArray(response?.segments) && response.segments.length > 0) {
      let curTime = 0;
      for (const seg of response.segments) {
        const segText = typeof seg?.text === 'string' ? seg.text.trim() : '';
        const segWords = segText.split(/\s+/).filter(Boolean);
        const segStart = typeof seg?.start === 'number' && Number.isFinite(seg.start) ? Math.max(curTime, seg.start) : curTime;
        const segEnd = typeof seg?.end === 'number' && Number.isFinite(seg.end) ? Math.max(segStart + 0.5, seg.end) : segStart + 1.0;
        const step = segWords.length > 0 ? (segEnd - segStart) / segWords.length : 0.3;
        segWords.forEach((sw: string, idx: number) => {
          const wStart = Number((segStart + idx * step).toFixed(3));
          const wEnd = Number((wStart + Math.max(0.08, step * 0.9)).toFixed(3));
          words.push({ word: sw, start: wStart, end: Math.max(wStart + 0.05, wEnd) });
        });
        curTime = Math.max(curTime, segEnd);
      }
    }

    // If still under 2 words, synthesize from transcript text tokens
    if (words.length < 2) {
      const textTokens = text.trim().split(/\s+/).filter(Boolean);
      const step = 0.35;
      words = textTokens.map((w: string, i: number) => ({
        word: w,
        start: Number((i * step).toFixed(3)),
        end: Number((i * step + 0.3).toFixed(3)),
      }));
    }

    return validateTranscriptEvidence({
      text,
      words,
    });
  } catch (err: any) {
    if (err instanceof ClearSpeakScoringUnavailableError) throw err;
    console.error('[ClearSpeak] transcribeAudio error:', err);
    throw new ClearSpeakScoringUnavailableError('Speech scoring provider was temporarily unavailable. Please retry your recording.');
  }
}



// ─── Transcript Normalisation ─────────────────────────────────────────────────
//
// Design contract (R1 — external beta hardening):
//   Goal:  Reduce false-negative clarity penalties caused by ASR formatting
//          differences and common ASR renderings. This normalisation is not a
//          detector of pronunciation errors.
//
//   Rules:
//   1. Case and punctuation normalisation ALWAYS runs.
//   2. Whitespace collapse ALWAYS runs.
//   3. Contraction expansion is CONSERVATIVE: only canonical English forms.
//   4. ASR equivalence mapping is MINIMAL: only substitutions with near-zero
//      false-positive risk (e.g. ASR emits "gonna" when speaker said "going to").
//   5. Any substitution that could mask a real error is NOT included.
//      Example: we do NOT map "deliver" → "deliverable" — different words.
//   6. All helpers are exported for independent unit testing.
//
// Scoring credibility:
//   A L2 speaker who says all the right words slightly differently should
//   land 80–90 clarity, not 50–60. A speaker who skips words or substitutes
//   content words should still score lower. This is the balance these rules target.

/**
 * Step 1: lowercase + strip all punctuation + collapse whitespace.
 * The foundational step that runs before any semantic normalisation.
 */
export function stripAndLower(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z\s']/g, ' ')  // strip punctuation, keep apostrophes for contractions
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Step 2: Expand canonical English contractions.
 * Only unambiguous one-to-one expansions. Do not expand contractions whose
 * expansion changes the edit distance unfairly (e.g. "it's" → "it is" adds chars).
 *
 * Apostrophes are stripped AFTER this step.
 */
export function expandContractions(text: string): string {
  // Map is ordered longest-match first to avoid partial matches.
  const map: [RegExp, string][] = [
    [/\bdon't\b/g,     'do not'],
    [/\bcan't\b/g,     'cannot'],
    [/\bwon't\b/g,     'will not'],
    [/\bwe're\b/g,     'we are'],
    [/\bwe've\b/g,     'we have'],
    [/\bwe'll\b/g,     'we will'],
    [/\bthey're\b/g,   'they are'],
    [/\bthey've\b/g,   'they have'],
    [/\bthey'll\b/g,   'they will'],
    [/\bit's\b/g,      'it is'],
    [/\bthat's\b/g,    'that is'],
    [/\bthere's\b/g,   'there is'],
    [/\bwhat's\b/g,    'what is'],
    [/\bwho's\b/g,     'who is'],
    [/\bwhere's\b/g,   'where is'],
    [/\bi'm\b/g,       'i am'],
    [/\bi've\b/g,      'i have'],
    [/\bi'll\b/g,      'i will'],
    [/\bi'd\b/g,       'i would'],
    [/\byou're\b/g,    'you are'],
    [/\byou've\b/g,    'you have'],
    [/\byou'll\b/g,    'you will'],
    [/\bhe's\b/g,      'he is'],
    [/\bshe's\b/g,     'she is'],
    [/\bisn't\b/g,     'is not'],
    [/\baren't\b/g,    'are not'],
    [/\bwasn't\b/g,    'was not'],
    [/\bweren't\b/g,   'were not'],
    [/\bhasn't\b/g,    'has not'],
    [/\bhaven't\b/g,   'have not'],
    [/\bhadn't\b/g,    'had not'],
    [/\bwouldn't\b/g,  'would not'],
    [/\bcouldn't\b/g,  'could not'],
    [/\bshouldn't\b/g, 'should not'],
  ];
  return map.reduce((s, [re, replacement]) => s.replace(re, replacement), text);
}

/**
 * Step 3: Apply a minimal, conservative ASR/L2 equivalence map.
 *
 * CRITERIA for inclusion:
 *   - The substitution must be a well-documented ASR output variant OR
 *     a common ASR rendering that does not change the intended word.
 *   - The substitution must have near-zero false-positive risk:
 *     the mapped form is essentially never the correct word in a business context.
 *   - Only function words or function-word clusters are mapped.
 *     Content words (nouns, verbs, adjectives) are NEVER mapped — errors on
 *     content words are genuine clarity signals we want to preserve.
 *
 * What is intentionally NOT here:
 *   - Phoneme-level substitutions ("delivelables" → "deliverables")
 *   - Paraphrase mapping ("talk about" → "discuss")
 *   - Any multi-word → single-word collapse
 *   - Regional word substitutions that differ by dialect
 */
export function applyAsrEquivalences(text: string): string {
  const map: [RegExp, string][] = [
    // Informal speech reductions — ASR faithfully transcribes reduced forms
    [/\bgonna\b/g,      'going to'],
    [/\bwanna\b/g,      'want to'],
    [/\bgotta\b/g,      'got to'],
    [/\bhafta\b/g,      'have to'],
    [/\bkinda\b/g,      'kind of'],
    [/\bsorta\b/g,      'sort of'],
    [/\bkinda\b/g,      'kind of'],
    [/\boutta\b/g,      'out of'],
    [/\blotta\b/g,      'lot of'],
    // Common L2 dropped function words — ASR may add or drop "a" / "the"
    // We normalise both sides so missing articles don't collapse clarity to zero.
    // Note: we do NOT remove articles from the expected string — we add them back
    // to the actual string only.
    [/\band a\b/g,      'and'],     // "and a meeting" ≈ "and meeting" for clarity
    [/\bto a\b/g,       'to'],      // "to a level" ≈ "to level"
    // ASR number / symbol variants
    [/\bone hundred\b/g, '100'],
    [/\bpercent\b/g,     '%'],
    // Filler words ASR commonly transcribes that are never in the passage
    [/\buh\b/g,          ''],
    [/\bum\b/g,          ''],
    [/\ber\b/g,          ''],
  ];
  // After applying, re-collapse whitespace in case replacements created gaps
  return map
    .reduce((s, [re, replacement]) => s.replace(re, replacement), text)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Step 4: Strip remaining apostrophes (left after contraction expansion).
 * Final cleanup before Levenshtein comparison.
 */
export function stripApostrophes(text: string): string {
  return text.replace(/'/g, '');
}

/**
 * Full normalisation pipeline.
 * Order: stripAndLower → expandContractions → applyAsrEquivalences → stripApostrophes.
 *
 * Applied to BOTH expected and actual strings in calcClarity to ensure
 * the comparison baseline is symmetric.
 *
 * Exported for unit testing each stage independently.
 */
export function normaliseForScoring(text: string): string {
  return stripApostrophes(applyAsrEquivalences(expandContractions(stripAndLower(text))));
}

// ─── Levenshtein Transcript-Match Score ───────────────────────────────────────

export function boundedLevenshteinDistance(a: string, b: string): number {
  // Retain only two rows and place the shorter string on the columns. Memory is
  // O(min(m,n)); request/schema limits separately bound CPU work.
  const [longer, shorter] = a.length >= b.length ? [a, b] : [b, a];
  let previous = new Uint32Array(shorter.length + 1);
  let current = new Uint32Array(shorter.length + 1);
  for (let column = 0; column <= shorter.length; column++) previous[column] = column;

  for (let row = 1; row <= longer.length; row++) {
    current[0] = row;
    for (let column = 1; column <= shorter.length; column++) {
      current[column] = longer[row - 1] === shorter[column - 1]
        ? previous[column - 1]
        : 1 + Math.min(previous[column], current[column - 1], previous[column - 1]);
    }
    [previous, current] = [current, previous];
  }
  return previous[shorter.length];
}

/**
 * Calculates transcript-match score (0–100) using normalised Levenshtein distance.
 *
 * Both expected and actual are run through the full normalisation pipeline
 * before comparison. This removes ASR formatting noise and conservative L2
 * equivalences. This is an ASR text comparison, not a pronunciation or accent
 * assessment.
 *
 * Scoring is character-level Levenshtein on the full passage string.
 * A transcript containing the expected words scores highly; omissions and text
 * substitutions score proportionally lower.
 */
function calcClarity(expected: string, actual: string): number {
  const e = normaliseForScoring(expected);
  const a = normaliseForScoring(actual);
  if (!e) return 100;
  if (!a) return 0;
  const dist = boundedLevenshteinDistance(e, a);
  const maxLen = Math.max(e.length, a.length);
  return Math.round(Math.max(0, (1 - dist / maxLen) * 100));
}

// ─── Pacing Score ─────────────────────────────────────────────────────────────

/**
 * Scores pacing (0–100) against the user's level WPM band.
 * @param words  Words from gpt-4o-mini-transcribe timestamp data
 * @param level  User's ClearSpeak level (1–3)
 */
function calcPacing(
  words: TranscriptWord[],
  level: 1 | 2 | 3,
): { score: number; measuredWpm: number } {
  if (words.length < 2) return { score: 0, measuredWpm: 0 };

  const durationSeconds = words[words.length - 1].end - words[0].start;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return { score: 0, measuredWpm: 0 };
  }
  const measuredWpm = Math.min(1_000, Math.max(0, Math.round((words.length / durationSeconds) * 60)));

  const band = WPM_BANDS[level];
  const [low, high] = band.target;
  const penalty = band.penaltyAbove;

  let score: number;
  if (measuredWpm < low) {
    // Too slow — proportional penalty from target low
    score = Math.max(0, 100 - Math.round(((low - measuredWpm) / low) * 60));
  } else if (measuredWpm <= high) {
    score = 100; // Perfect band
  } else if (measuredWpm <= penalty) {
    // Slightly fast — mild penalty
    score = Math.round(100 - ((measuredWpm - high) / (penalty - high)) * 30);
  } else {
    // Too fast — stronger penalty
    score = Math.max(0, 70 - Math.round(((measuredWpm - penalty) / penalty) * 70));
  }

  return { score, measuredWpm };
}

// ─── Rhythm Score ─────────────────────────────────────────────────────────────

const SHORT_PAUSE_MIN_MS = 75;
const STOP_PAUSE_MIN_MS = 240;
const RHYTHM_TIMING_FALLBACK = 50;

function clampScore(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function rhythmFallbackFromPacing(pacingScore: number): number {
  if (!Number.isFinite(pacingScore) || pacingScore <= 0) return RHYTHM_TIMING_FALLBACK;
  return clampScore(pacingScore * 0.65, 40, 70);
}

/**
 * Evaluates pause adherence by aligning word gaps against
 * expected PassageToken.pauseType markers from gpt-4o-mini-transcribe timestamps.
 *
 * Strategy: For each token with pauseType 'short' or 'stop', check that
 * the silence gap after the last word of that token matches the threshold.
 */
function calcRhythm(
  words: TranscriptWord[],
  content: ClearSpeakSessionContent,
  pacingScore: number,
): number {
  // Build list of expected pauses from passageData
  // We pop the final text token's pause, because the user will just hit
  // 'Stop Recording' at the end of the passage rather than pausing for a new word.
  let expectedTokens = content.passageData.filter(t => t.pauseType !== 'none');
  if (expectedTokens.length > 0) {
    // If the last token in the entire array is a pause, ignore it for rhythm quota
    const lastContentToken = content.passageData[content.passageData.length - 1];
    if (lastContentToken.pauseType !== 'none') {
      expectedTokens = expectedTokens.slice(0, -1);
    }
  }

  const expectedPauses = expectedTokens.map(t => t.pauseType);

  if (expectedPauses.length === 0) return 100;
  if (words.length < 2) {
    console.warn('[ClearSpeak] Word timestamps missing or too sparse; using neutral flow fallback.');
    return rhythmFallbackFromPacing(pacingScore);
  }

  // Count expected occurrences
  const expectedStops = expectedPauses.filter(p => p === 'stop').length;
  const expectedShorts = expectedPauses.filter(p => p === 'short').length;

  // Compute actual gaps between spoken words
  const gaps: number[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    gaps.push((words[i + 1].start - words[i].end) * 1000); // ms
  }

  const usableGaps = gaps.filter(g => Number.isFinite(g) && g > 0);
  if (usableGaps.length === 0) {
    console.warn('[ClearSpeak] Transcription returned collapsed word timestamps; using flow fallback.');
    return rhythmFallbackFromPacing(pacingScore);
  }

  // Find all pauses greater than or equal to SHORT_PAUSE_MIN_MS to qualify
  const actualPauses = gaps.filter(g => g >= SHORT_PAUSE_MIN_MS);
  if (actualPauses.length === 0) {
    // When ASR word timestamps compress micro-silences, evaluate rhythm
    // from cadence continuity rather than imposing an artificial floor.
    return clampScore(pacingScore * 0.65, 45, 70);
  }

  // Count stops
  const actualStops = actualPauses.filter(g => g >= STOP_PAUSE_MIN_MS).length;
  
  // Match expected stops up to the limit
  const validStopsForScore = Math.min(expectedStops, actualStops);
  
  // Calculate remaining pauses we can use to fulfill the short pause quota.
  const actualShortsAvailable = actualPauses.length - validStopsForScore;
  const validShortsForScore = Math.min(expectedShorts, actualShortsAvailable);

  const matched = validStopsForScore + validShortsForScore;
  const pauseAdherence = (matched / expectedPauses.length) * 100;

  // Blend pause adherence (70%) with pacing stability (30%) for realistic cadence scoring
  return clampScore(pauseAdherence * 0.70 + pacingScore * 0.30);
}

// ─── Hard-Word Modifier ────────────────────────────────────────────────────────

function calcHardWordBonus(
  transcript: string,
  hardWords: HardWordEntry[],
): number {
  const unresolved = hardWords.filter(h => !h.resolved);
  if (unresolved.length === 0) return 0;

  const lower = transcript.toLowerCase();
  let bonus = 0;
  for (const entry of unresolved) {
    if (lower.includes(entry.word.toLowerCase())) bonus++;
  }
  return Math.min(bonus, 5);
}

// ─── Feedback Tip Builder ─────────────────────────────────────────────────────

export interface FeedbackTipContext {
  clarity: number;
  pacing: number;
  rhythm: number;
  measuredWpm: number;
  userLevel: 1 | 2 | 3;
  expectedText: string;
  transcriptText: string;
  hardWordBonus: number;
}

export function buildFeedbackTip(ctx: FeedbackTipContext): string {
  const { clarity, pacing, rhythm, measuredWpm, userLevel, expectedText, transcriptText, hardWordBonus } = ctx;
  const band = WPM_BANDS[userLevel] || WPM_BANDS[1];
  const [targetLow, targetHigh] = band.target;

  // 1. Identify specific tricky content words omitted or misrecognized
  const normExpectedWords = stripAndLower(expectedText)
    .split(/\s+/)
    .filter(w => w.length > 3 && !['with', 'that', 'this', 'from', 'they', 'have', 'were', 'been'].includes(w));
  const normTransWords = new Set(stripAndLower(transcriptText).split(/\s+/));
  const trickyWords = normExpectedWords.filter(w => !normTransWords.has(w)).slice(0, 2);

  // 2. Pacing insight with actual WPM vs band
  let pacingInsight = '';
  if (measuredWpm === 0) {
    pacingInsight = 'Speak steadily into the microphone at a conversational pace.';
  } else if (measuredWpm >= targetLow && measuredWpm <= targetHigh) {
    pacingInsight = `Pacing was spot-on at ${measuredWpm} WPM (target: ${targetLow}–${targetHigh} WPM), conveying calm executive composure.`;
  } else if (measuredWpm > targetHigh) {
    const delta = measuredWpm - targetHigh;
    pacingInsight = `At ${measuredWpm} WPM (${delta} WPM above your ${targetLow}–${targetHigh} target), ease the tempo slightly so key insights land with more weight.`;
  } else {
    const delta = targetLow - measuredWpm;
    pacingInsight = `At ${measuredWpm} WPM (${delta} WPM below your ${targetLow}–${targetHigh} target), linking thought groups smoothly will add conversational energy.`;
  }

  // 3. Articulation & word clarity insight
  let clarityInsight = '';
  if (clarity >= 90) {
    clarityInsight = 'Articulative clarity was sharp and confident.';
  } else if (trickyWords.length > 0) {
    clarityInsight = `Focus on crisp enunciation for "${trickyWords.join('" and "')}".`;
  } else if (clarity >= 75) {
    clarityInsight = 'Good word accuracy across the passage.';
  } else {
    clarityInsight = 'Take an extra moment on multi-syllable terms to keep consonant endings clean.';
  }

  // 4. Rhythm & pause insight
  let rhythmInsight = '';
  if (rhythm >= 80) {
    rhythmInsight = 'Your breath control and thought-group pauses gave your ideas natural breathing room.';
  } else if (rhythm >= 60) {
    rhythmInsight = 'Cadence is developing well; lingering a fraction longer at pause badges (⏸) will help key points sink in.';
  } else {
    rhythmInsight = 'Remember to take a deliberate breath at each pause mark (⏸) — strategic pauses command authority.';
  }

  const bonusCallout = hardWordBonus > 0 ? ' Great job mastering your target vocabulary term!' : '';

  // 5. Synthesis based on performance profile
  if (clarity >= 85 && pacing >= 80 && rhythm >= 75) {
    return `Exceptional delivery! ${pacingInsight} ${clarityInsight}${bonusCallout}`.trim().slice(0, 990);
  }

  // Prioritize coaching on the pillar that needs the most refinement
  const parts: string[] = [];
  if (clarity < pacing && clarity < rhythm) {
    parts.push(clarityInsight, pacingInsight);
  } else if (pacing < clarity && pacing < rhythm) {
    parts.push(pacingInsight, clarity < 80 ? clarityInsight : rhythmInsight);
  } else {
    parts.push(rhythmInsight, pacingInsight);
  }

  if (bonusCallout) parts.push(bonusCallout.trim());

  const tip = parts.filter(Boolean).join(' ');
  return tip.length > 990 ? tip.slice(0, 990) : tip;
}

// ─── Public Scorer ────────────────────────────────────────────────────────────

export interface ScoreInput {
  audioBuffer: Buffer;
  content: ClearSpeakSessionContent;
  userLevel: 1 | 2 | 3;
  hardWords: HardWordEntry[];
}

/**
 * Full scoring pipeline:
 * 1. Transcribe (Groq Whisper with word timestamps)
 * 2. Calculate transcript match, pace, and pause-timing heuristics
 * 3. Apply Hard-Word modifier
 * 4. Build composite
 * 5. Destroy audio buffer (enforce privacy policy)
 *
 * The caller must NOT store the audioBuffer after this returns.
 */
export async function scoreSession(input: ScoreInput): Promise<ClearSpeakSessionScore> {
  const { audioBuffer, content, userLevel, hardWords } = input;

  try {
    if (!isClearSpeakScoringAvailable()) {
      throw new ClearSpeakScoringUnavailableError();
    }

    // 1. Transcribe — the buffer remains memory-only.
    const transcript = await transcribeAudio(audioBuffer);
    const transcriptText = transcript.text.slice(0, MAX_TRANSCRIPT_TEXT_CHARS);
    const transcriptWords = transcript.words.slice(0, MAX_TRANSCRIPT_WORDS);

    // Build expected full text from passageData tokens.
    const expectedText = content.passageData.map(t => t.text).join(' ');

    // 2. Calculate bounded practice heuristics.
    const clarity = calcClarity(expectedText, transcriptText);
    const { score: pacing, measuredWpm } = calcPacing(transcriptWords, userLevel);
    const rhythm = calcRhythm(transcriptWords, content, pacing);

    // 3. Hard-word modifier.
    const hardWordBonus = calcHardWordBonus(transcriptText, hardWords);

    // 4. Composite: transcript match×0.5 + pace×0.25 + pause timing×0.25.
    const composite = Math.min(
      100,
      Math.round(clarity * 0.5 + pacing * 0.25 + rhythm * 0.25 + hardWordBonus)
    );

    return ClearSpeakSessionScoreSchema.parse({
      clarity,
      pacing,
      rhythm,
      composite,
      hardWordBonus,
      feedbackTip: buildFeedbackTip({
        clarity,
        pacing,
        rhythm,
        measuredWpm,
        userLevel,
        expectedText,
        transcriptText,
        hardWordBonus,
      }),
      measuredWpm,
      // A browser boolean cannot prove that a distinct retry was performed.
      retrySuccess: false,
      evidenceBasis: CLEAR_SPEAK_SCORE_EVIDENCE_BASIS,
      pronunciationAssessed: false,
    });
  } finally {
    // Zero the actual allocation on success, provider failure, timeout, or
    // unavailable configuration. Nulling a reference alone does not erase audio.
    audioBuffer.fill(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (input as any).audioBuffer = null;
  }
}
