/**
 * backend/clearspeak/contentSchema.ts
 * Mockmate ClearSpeak — canonical JSON generation contract.
 *
 * This module defines:
 *  1. The LLM system prompt template
 *  2. The structured output schema (JSON Schema / function-calling spec)
 *  3. The fallback content bank (15 entries, 5 per level)
 *
 * Source of truth: implementation_plan.md §9
 */

import type { ClearSpeakProfile, ClearSpeakSessionContent } from './types';

// ─── WPM Targets (Level Bands) ────────────────────────────────────────────────
// Source: implementation_plan.md §10

export const WPM_BANDS = {
  1: { target: [90, 110],  penaltyAbove: 115 },
  2: { target: [110, 130], penaltyAbove: 135 },
  3: { target: [130, 150], penaltyAbove: 155 },
} as const;

// ─── Passage Token Counts (per Level) ─────────────────────────────────────────

export const PASSAGE_WORD_COUNTS = {
  1: { min: 25, max: 35, chunkCount: '3-4' },
  2: { min: 40, max: 60, chunkCount: '5-7' },
  3: { min: 70, max: 90, chunkCount: '8+' },
} as const;

// ─── Role Display Labels ───────────────────────────────────────────────────────

export const ROLE_LABELS: Record<ClearSpeakProfile['role'], string> = {
  business_analyst:  'Business Analyst',
  project_manager:   'Project Manager',
  general_corporate: 'General Corporate',
};

// ─── System Prompt Builder ────────────────────────────────────────────────────

/**
 * Builds the LLM system prompt from the user's ClearSpeakProfile.
 * Injected once per generation request as `system` role.
 */
export function buildSystemPrompt(
  profile: ClearSpeakProfile,
  recentTopics: string[],
): string {
  const role = ROLE_LABELS[profile.role];
  const { min, max } = PASSAGE_WORD_COUNTS[profile.level];
  const recentList = recentTopics.length > 0
    ? `Do NOT repeat any of these recent topics: ${recentTopics.join(', ')}.`
    : '';

  return `You are a workplace English speaking coach generating practice content for Mockmate ClearSpeak.

USER CONTEXT:
- Role: ${role}
- Level: ${profile.level} (1=Beginner, 2=Intermediate, 3=Advanced)
- Main Struggle: ${profile.mainStruggle}
- Audience: ${profile.audienceContext}
- Goal: ${profile.goal}

CONTENT RULES (mandatory, no exceptions):
1. The passage must be ${min}–${max} words and feel like REAL workplace speech, not a textbook.
2. Use plain corporate English. No idioms, no phrasal verbs, no slang, no complex SAT vocabulary.
3. The passage must be split into thought-group chunks that feel natural when spoken aloud.
4. Key vocab must be 3 real workplace terms the user will encounter in their role.
5. The repeat_phrase must be a short, punchy real workplace sentence (<=12 words).
6. The retry_sentence must be the single hardest sentence to pronounce in the passage.
7. The interview_bridge_question must map directly to the topic and role.
8. Set bridge_ready to true only if the passage covers workplace communication patterns transferable to interview answers.
9. ${recentList}

FORBIDDEN OUTPUT PATTERNS:
- "See Jane go to work."
- Any mention of ordering coffee, shopping, or generic daily life.
- Idioms like "boil the ocean" or "move the needle."
- Grammar drills disguised as passages.

OUTPUT FORMAT: Strict JSON only. No markdown. No wrapper text.`;
}

// ─── JSON Schema for Structured Output ───────────────────────────────────────
// Used with Gemini responseSchema and as the canonical content contract.

export const CLEARSPEAK_CONTENT_SCHEMA = {
  name: 'generate_clearspeak_session',
  description: 'Generate a ClearSpeak practice session with structured passage data.',
  parameters: {
    type: 'object',
    required: [
      'topicTag',
      'difficultyLevel',
      'targetSkill',
      'keyVocab',
      'passageData',
      'repeatPhrase',
      'retrySentence',
      'bridgeReady',
      'interviewBridgeQuestion',
    ],
    properties: {
      topicTag: { type: 'string', description: 'Short topic label, e.g. "Stakeholder Pushback"' },
      difficultyLevel: { type: 'number', enum: [1, 2, 3] },
      targetSkill: { type: 'string', description: 'Primary skill being practiced, e.g. "Pacing & Tone"' },
      keyVocab: {
        type: 'array',
        items: { type: 'string' },
        minItems: 3,
        maxItems: 3,
        description: 'Exactly 3 role-specific vocabulary terms',
      },
      passageData: {
        type: 'array',
        description: 'Ordered array of passage tokens. Frontend renders these directly.',
        items: {
          type: 'object',
          required: ['text', 'isStressed', 'pauseType'],
          properties: {
            text: { type: 'string', description: 'The spoken text of this token' },
            isStressed: { type: 'boolean', description: 'Render as bold/highlighted' },
            pauseType: {
              type: 'string',
              enum: ['none', 'short', 'stop'],
              description: 'none = no gap, short = brief pause (/), stop = full stop (//)' },
          },
        },
      },
      repeatPhrase: { type: 'string', description: 'Short sentence for Repeat-After-Coach, <=12 words' },
      retrySentence: { type: 'string', description: 'The hardest-to-pronounce sentence from the passage' },
      bridgeReady: { type: 'boolean' },
      interviewBridgeQuestion: { type: 'string', description: 'A real interview question linked to the topic' },
    },
    additionalProperties: false,
  },
};

// ─── Fallback Content Bank ────────────────────────────────────────────────────
// Used when LLM generation fails. Must always produce valid ClearSpeakSessionContent.
// Status (R2): 15 entries — 5 per level. Sufficient for external beta.
// TODO(v1.1): Expand to 10+ per role before wider rollout.

export const FALLBACK_CONTENT: ClearSpeakSessionContent[] = [

  // ─────────────────────────────────────────────────────────────────────────────
  // LEVEL 1 — Beginner (25–35 words, 3–4 chunks, target 90–110 WPM)
  // ─────────────────────────────────────────────────────────────────────────────

  {
    topicTag: 'Scope Management',
    difficultyLevel: 1,
    targetSkill: 'Pacing & Clarity',
    keyVocab: ['scope', 'deliverable', 'timeline'],
    passageData: [
      { text: 'We need to review',    isStressed: false, pauseType: 'none'  },
      { text: 'the project scope',    isStressed: true,  pauseType: 'short' },
      { text: 'before adding',        isStressed: false, pauseType: 'none'  },
      { text: 'any new deliverables', isStressed: true,  pauseType: 'stop'  },
      { text: 'The timeline',         isStressed: false, pauseType: 'none'  },
      { text: 'is at risk',           isStressed: true,  pauseType: 'stop'  },
    ],
    repeatPhrase: 'The timeline is at risk.',
    retrySentence: 'We need to review the project scope before adding any new deliverables.',
    bridgeReady: true,
    interviewBridgeQuestion: 'Tell me about a time you had to push back on scope creep.',
  },

  {
    topicTag: 'Status Updates',
    difficultyLevel: 1,
    targetSkill: 'Sentence Rhythm',
    keyVocab: ['update', 'progress', 'blocker'],
    passageData: [
      { text: 'I want to share',    isStressed: false, pauseType: 'none'  },
      { text: 'a quick update',     isStressed: true,  pauseType: 'short' },
      { text: 'on our progress.',   isStressed: false, pauseType: 'stop'  },
      { text: 'We are on track',    isStressed: false, pauseType: 'none'  },
      { text: 'for this week.',     isStressed: false, pauseType: 'stop'  },
      { text: 'There is one',       isStressed: false, pauseType: 'none'  },
      { text: 'blocker to discuss', isStressed: true,  pauseType: 'stop'  },
    ],
    repeatPhrase: 'I want to share a quick update.',
    retrySentence: 'There is one blocker to discuss.',
    bridgeReady: false,
    interviewBridgeQuestion: 'How do you communicate project status to a team that is behind schedule?',
  },

  {
    topicTag: 'Meeting Action Items',
    difficultyLevel: 1,
    targetSkill: 'Pacing',
    keyVocab: ['action item', 'responsible', 'deadline'],
    passageData: [
      { text: 'Let me confirm',       isStressed: false, pauseType: 'none'  },
      { text: 'the action items',     isStressed: true,  pauseType: 'short' },
      { text: 'before we close.',     isStressed: false, pauseType: 'stop'  },
      { text: 'Each item needs',      isStressed: false, pauseType: 'none'  },
      { text: 'one person',           isStressed: true,  pauseType: 'none'  },
      { text: 'responsible',          isStressed: true,  pauseType: 'none'  },
      { text: 'and a clear deadline', isStressed: true,  pauseType: 'stop'  },
    ],
    repeatPhrase: 'Each item needs one person responsible.',
    retrySentence: 'Let me confirm the action items before we close.',
    bridgeReady: false,
    interviewBridgeQuestion: 'Describe how you track follow-up tasks after a stakeholder meeting.',
  },

  {
    topicTag: 'Asking for Clarification',
    difficultyLevel: 1,
    targetSkill: 'Tone & Confidence',
    keyVocab: ['clarify', 'requirement', 'confirm'],
    passageData: [
      { text: 'Can I clarify',          isStressed: false, pauseType: 'none'  },
      { text: 'one requirement',         isStressed: true,  pauseType: 'short' },
      { text: 'before I continue?',      isStressed: false, pauseType: 'stop'  },
      { text: 'I want to confirm',       isStressed: false, pauseType: 'none'  },
      { text: 'that I understood',       isStressed: false, pauseType: 'none'  },
      { text: 'the request correctly.',  isStressed: true,  pauseType: 'stop'  },
    ],
    repeatPhrase: 'I want to confirm I understood correctly.',
    retrySentence: 'Can I clarify one requirement before I continue?',
    bridgeReady: false,
    interviewBridgeQuestion: 'Tell me about a time you had to ask a stakeholder for more detail on a requirement.',
  },

  {
    topicTag: 'Risk Communication',
    difficultyLevel: 1,
    targetSkill: 'Stress Marking',
    keyVocab: ['risk', 'impact', 'mitigate'],
    passageData: [
      { text: 'I need to flag',     isStressed: false, pauseType: 'none'  },
      { text: 'a potential risk',   isStressed: true,  pauseType: 'short' },
      { text: 'on this project.',   isStressed: false, pauseType: 'stop'  },
      { text: 'The impact',         isStressed: false, pauseType: 'none'  },
      { text: 'could be high',      isStressed: true,  pauseType: 'none'  },
      { text: 'if not addressed.',  isStressed: false, pauseType: 'stop'  },
    ],
    repeatPhrase: 'I need to flag a potential risk.',
    retrySentence: 'The impact could be high if not addressed.',
    bridgeReady: true,
    interviewBridgeQuestion: 'Describe a situation where you identified and communicated a risk early.',
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // LEVEL 2 — Intermediate (40–60 words, 5–7 chunks, target 110–130 WPM)
  // ─────────────────────────────────────────────────────────────────────────────

  {
    topicTag: 'Stakeholder Pushback',
    difficultyLevel: 2,
    targetSkill: 'Assertive Pacing',
    keyVocab: ['priority', 'constraint', 'trade-off'],
    passageData: [
      { text: 'I understand your concern,',          isStressed: false, pauseType: 'short' },
      { text: 'and I want to address it directly.',  isStressed: true,  pauseType: 'stop'  },
      { text: 'Given the current constraints,',      isStressed: false, pauseType: 'short' },
      { text: 'we have to make a trade-off',         isStressed: true,  pauseType: 'none'  },
      { text: 'between speed and quality.',          isStressed: false, pauseType: 'stop'  },
      { text: 'My recommendation',                  isStressed: false, pauseType: 'none'  },
      { text: 'is to prioritise the release',       isStressed: true,  pauseType: 'none'  },
      { text: 'and fix the remaining issues',       isStressed: false, pauseType: 'none'  },
      { text: 'in the next sprint.',                isStressed: false, pauseType: 'stop'  },
    ],
    repeatPhrase: 'We have to make a trade-off between speed and quality.',
    retrySentence: 'I understand your concern, and I want to address it directly.',
    bridgeReady: true,
    interviewBridgeQuestion: 'Tell me about a time a stakeholder disagreed with your recommendation.',
  },

  {
    topicTag: 'Requirements Gathering',
    difficultyLevel: 2,
    targetSkill: 'Clarity & Tone',
    keyVocab: ['requirement', 'acceptance criteria', 'sign-off'],
    passageData: [
      { text: 'Before we start development,',       isStressed: false, pauseType: 'short' },
      { text: 'I need to confirm the requirements', isStressed: true,  pauseType: 'none'  },
      { text: 'with all stakeholders.',             isStressed: false, pauseType: 'stop'  },
      { text: 'Each requirement must have',         isStressed: false, pauseType: 'none'  },
      { text: 'clear acceptance criteria',          isStressed: true,  pauseType: 'none'  },
      { text: 'and a formal sign-off',              isStressed: true,  pauseType: 'none'  },
      { text: 'from the business owner.',           isStressed: false, pauseType: 'stop'  },
    ],
    repeatPhrase: 'Each requirement must have clear acceptance criteria.',
    retrySentence: 'Before we start development, I need to confirm the requirements with all stakeholders.',
    bridgeReady: true,
    interviewBridgeQuestion: 'How do you ensure requirements are complete before a project begins?',
  },

  {
    topicTag: 'Project Kickoff',
    difficultyLevel: 2,
    targetSkill: 'Rhythm & Confidence',
    keyVocab: ['kickoff', 'objective', 'milestone'],
    passageData: [
      { text: 'Welcome to the project kickoff.',    isStressed: false, pauseType: 'stop'  },
      { text: 'Today we will align',               isStressed: false, pauseType: 'none'  },
      { text: 'on our main objectives',            isStressed: true,  pauseType: 'none'  },
      { text: 'and key milestones.',               isStressed: false, pauseType: 'stop'  },
      { text: 'Each team will have',               isStressed: false, pauseType: 'none'  },
      { text: 'a clear set of responsibilities',   isStressed: true,  pauseType: 'none'  },
      { text: 'by end of this session.',           isStressed: false, pauseType: 'stop'  },
    ],
    repeatPhrase: 'Today we will align on our main objectives.',
    retrySentence: 'Each team will have a clear set of responsibilities by end of this session.',
    bridgeReady: false,
    interviewBridgeQuestion: 'How do you run a project kickoff meeting to ensure alignment from day one?',
  },

  {
    topicTag: 'Data Analysis Update',
    difficultyLevel: 2,
    targetSkill: 'Pacing & Stress',
    keyVocab: ['analysis', 'finding', 'recommendation'],
    passageData: [
      { text: 'I have completed',           isStressed: false, pauseType: 'none'  },
      { text: 'the initial data analysis',  isStressed: true,  pauseType: 'short' },
      { text: 'for this quarter.',          isStressed: false, pauseType: 'stop'  },
      { text: 'The main finding is',        isStressed: false, pauseType: 'none'  },
      { text: 'that conversion dropped',    isStressed: true,  pauseType: 'none'  },
      { text: 'by twelve percent',          isStressed: true,  pauseType: 'short' },
      { text: 'in the last two weeks.',     isStressed: false, pauseType: 'stop'  },
      { text: 'My recommendation is',       isStressed: false, pauseType: 'none'  },
      { text: 'to investigate the source.', isStressed: true,  pauseType: 'stop'  },
    ],
    repeatPhrase: 'My recommendation is to investigate the source.',
    retrySentence: 'The main finding is that conversion dropped by twelve percent in the last two weeks.',
    bridgeReady: true,
    interviewBridgeQuestion: 'Describe a time you found an insight in data that changed a business decision.',
  },

  {
    topicTag: 'Budget Discussion',
    difficultyLevel: 2,
    targetSkill: 'Tone Under Pressure',
    keyVocab: ['budget', 'allocation', 'justification'],
    passageData: [
      { text: 'I want to walk you through',   isStressed: false, pauseType: 'none'  },
      { text: 'the budget allocation',        isStressed: true,  pauseType: 'none'  },
      { text: 'for this initiative.',         isStressed: false, pauseType: 'stop'  },
      { text: 'The total cost is justified',  isStressed: true,  pauseType: 'none'  },
      { text: 'by the projected savings',     isStressed: false, pauseType: 'none'  },
      { text: 'over the next two quarters.',  isStressed: false, pauseType: 'stop'  },
      { text: 'I am happy to clarify',        isStressed: false, pauseType: 'none'  },
      { text: 'any line item in detail.',     isStressed: true,  pauseType: 'stop'  },
    ],
    repeatPhrase: 'The total cost is justified by the projected savings.',
    retrySentence: 'I want to walk you through the budget allocation for this initiative.',
    bridgeReady: true,
    interviewBridgeQuestion: 'Tell me about a time you had to justify a significant budget request.',
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // LEVEL 3 — Advanced (70–90 words, 8+ chunks, target 130–150 WPM)
  // ─────────────────────────────────────────────────────────────────────────────

  {
    topicTag: 'Executive Presentation',
    difficultyLevel: 3,
    targetSkill: 'Pacing & Authority',
    keyVocab: ['strategic', 'initiative', 'stakeholder alignment'],
    passageData: [
      { text: 'Thank you for the time today.',              isStressed: false, pauseType: 'stop'  },
      { text: 'I will present three strategic initiatives', isStressed: true,  pauseType: 'none'  },
      { text: 'that require your approval.',               isStressed: false, pauseType: 'stop'  },
      { text: 'Each initiative has been reviewed',         isStressed: false, pauseType: 'none'  },
      { text: 'by the relevant business owners,',          isStressed: false, pauseType: 'short' },
      { text: 'and stakeholder alignment',                 isStressed: true,  pauseType: 'none'  },
      { text: 'has been confirmed at the working level.',  isStressed: false, pauseType: 'stop'  },
      { text: 'I will address',                           isStressed: false, pauseType: 'none'  },
      { text: 'implementation risk',                      isStressed: true,  pauseType: 'none'  },
      { text: 'and resource implications',                isStressed: false, pauseType: 'none'  },
      { text: 'for each proposal.',                       isStressed: false, pauseType: 'stop'  },
    ],
    repeatPhrase: 'Stakeholder alignment has been confirmed at the working level.',
    retrySentence: 'I will present three strategic initiatives that require your approval.',
    bridgeReady: true,
    interviewBridgeQuestion: 'Describe a time you presented a strategic recommendation to senior leadership.',
  },

  {
    topicTag: 'Conflict Resolution',
    difficultyLevel: 3,
    targetSkill: 'Tone & Rhythm',
    keyVocab: ['resolution', 'underlying concern', 'consensus'],
    passageData: [
      { text: 'When two teams',                    isStressed: false, pauseType: 'none'  },
      { text: 'have conflicting priorities,',      isStressed: true,  pauseType: 'short' },
      { text: 'my approach is to start',           isStressed: false, pauseType: 'none'  },
      { text: 'by understanding',                  isStressed: false, pauseType: 'none'  },
      { text: 'the underlying concern',            isStressed: true,  pauseType: 'short' },
      { text: 'on each side.',                     isStressed: false, pauseType: 'stop'  },
      { text: 'I facilitate a structured session', isStressed: false, pauseType: 'none'  },
      { text: 'to surface trade-offs',             isStressed: true,  pauseType: 'short' },
      { text: 'and build consensus',               isStressed: false, pauseType: 'none'  },
      { text: 'around a shared outcome.',          isStressed: false, pauseType: 'stop'  },
      { text: 'The goal is a resolution',          isStressed: false, pauseType: 'none'  },
      { text: 'both teams can commit to.',         isStressed: true,  pauseType: 'stop'  },
    ],
    repeatPhrase: 'The goal is a resolution both teams can commit to.',
    retrySentence: 'I facilitate a structured session to surface trade-offs and build consensus.',
    bridgeReady: true,
    interviewBridgeQuestion: 'Tell me about a time you resolved a conflict between two business units.',
  },

  {
    topicTag: 'Process Improvement',
    difficultyLevel: 3,
    targetSkill: 'Stress & Clarity',
    keyVocab: ['bottleneck', 'efficiency', 'root cause'],
    passageData: [
      { text: 'After reviewing the process end-to-end,', isStressed: false, pauseType: 'short' },
      { text: 'I identified three key bottlenecks',      isStressed: true,  pauseType: 'none'  },
      { text: 'that are slowing down delivery.',         isStressed: false, pauseType: 'stop'  },
      { text: 'The root cause in each case',             isStressed: false, pauseType: 'none'  },
      { text: 'is a lack of clear ownership',            isStressed: true,  pauseType: 'none'  },
      { text: 'at the handoff point.',                   isStressed: false, pauseType: 'stop'  },
      { text: 'My proposed changes',                    isStressed: false, pauseType: 'none'  },
      { text: 'target each bottleneck directly',        isStressed: true,  pauseType: 'none'  },
      { text: 'and should improve efficiency',          isStressed: false, pauseType: 'none'  },
      { text: 'by approximately thirty percent.',       isStressed: false, pauseType: 'stop'  },
    ],
    repeatPhrase: 'The root cause in each case is a lack of clear ownership.',
    retrySentence: 'After reviewing the process end-to-end, I identified three key bottlenecks that are slowing down delivery.',
    bridgeReady: true,
    interviewBridgeQuestion: 'Describe a process improvement initiative you led and the measurable outcome.',
  },

  {
    topicTag: 'Change Management',
    difficultyLevel: 3,
    targetSkill: 'Pacing & Confidence',
    keyVocab: ['change management', 'adoption', 'resistance'],
    passageData: [
      { text: 'Managing change effectively',           isStressed: false, pauseType: 'none'  },
      { text: 'requires more than a good plan.',       isStressed: true,  pauseType: 'stop'  },
      { text: 'Resistance to change',                  isStressed: false, pauseType: 'none'  },
      { text: 'is a natural response,',                isStressed: false, pauseType: 'short' },
      { text: 'and it must be addressed',              isStressed: true,  pauseType: 'none'  },
      { text: 'through clear communication',           isStressed: false, pauseType: 'none'  },
      { text: 'and visible leadership support.',       isStressed: true,  pauseType: 'stop'  },
      { text: 'Adoption is highest',                   isStressed: false, pauseType: 'none'  },
      { text: 'when people understand the reason',     isStressed: false, pauseType: 'none'  },
      { text: 'behind the change,',                    isStressed: false, pauseType: 'short' },
      { text: 'not just the process.',                 isStressed: true,  pauseType: 'stop'  },
    ],
    repeatPhrase: 'Resistance to change must be addressed through clear communication.',
    retrySentence: 'Adoption is highest when people understand the reason behind the change, not just the process.',
    bridgeReady: true,
    interviewBridgeQuestion: 'Tell me about a change you managed where adoption was a challenge.',
  },

  {
    topicTag: 'Vendor Negotiation',
    difficultyLevel: 3,
    targetSkill: 'Authority & Clarity',
    keyVocab: ['negotiation', 'contractual obligation', 'leverage'],
    passageData: [
      { text: 'Before entering any negotiation,',        isStressed: false, pauseType: 'short' },
      { text: 'I define our walk-away point clearly',    isStressed: true,  pauseType: 'none'  },
      { text: 'and what leverage we hold.',              isStressed: false, pauseType: 'stop'  },
      { text: 'In this case,',                          isStressed: false, pauseType: 'short' },
      { text: 'the vendor has contractual obligations',  isStressed: true,  pauseType: 'none'  },
      { text: 'they have not yet met,',                  isStressed: false, pauseType: 'short' },
      { text: 'which gives us a strong position.',       isStressed: true,  pauseType: 'stop'  },
      { text: 'My goal in this meeting',                isStressed: false, pauseType: 'none'  },
      { text: 'is to secure a revised delivery date',   isStressed: false, pauseType: 'none'  },
      { text: 'with a penalty clause attached.',        isStressed: true,  pauseType: 'stop'  },
    ],
    repeatPhrase: 'The vendor has contractual obligations they have not yet met.',
    retrySentence: 'Before entering any negotiation, I define our walk-away point clearly and what leverage we hold.',
    bridgeReady: true,
    interviewBridgeQuestion: 'Describe a high-stakes negotiation you led and how you prepared for it.',
  },

];
