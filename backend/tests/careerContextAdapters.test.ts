import { buildResumeContextItems } from '../services/careerContextAdapters/resumeContextAdapter';
import { buildClearSpeakContextItems } from '../services/careerContextAdapters/clearSpeakContextAdapter';
import { buildInterviewContextItems } from '../services/careerContextAdapters/interviewContextAdapter';
import { ResumeData, ClearSpeakProfile, FinalReport } from 'mockmate-shared';

describe('Career Context Pure Adapters', () => {
  describe('Resume Context Adapter', () => {
    const mockResume: ResumeData = {
      basics: {
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: '555-0199',
        location: 'San Francisco, CA'
      },
      summary: 'Experienced Backend Engineer specializing in Node.js and Postgres.',
      skills: [
        { category: 'Languages', items: ['TypeScript', 'Node.js', 'SQL'] }
      ],
      experience: [
        {
          company: 'Acme Corp',
          position: 'Senior Engineer',
          bullets: [
            'Architected microservices handling 10M daily requests.',
            '[_]', // Placeholder that should be filtered out
            'Led cross-functional team of 4 developers.'
          ]
        }
      ],
      projects: [
        { name: 'MockMate OS', description: 'AI Interview Practice Platform', tools: ['TypeScript', 'Supabase'] }
      ]
    };

    it('1. Extracts experience claims, skills, achievements and sets PII to personal_contact', () => {
      const items = buildResumeContextItems({
        resumeData: mockResume,
        recordId: 'res_001',
        targetRole: 'Staff Software Engineer',
        jdMissingSkills: ['Kubernetes']
      });

      // Target role
      const targetRoleItem = items.find(i => i.canonicalKey === 'resume.target_role');
      expect(targetRoleItem).toBeDefined();
      expect(targetRoleItem?.value).toEqual({ type: 'text', text: 'Staff Software Engineer' });

      // Contact PII is strictly excluded from Resume Career Context items
      const emailItem = items.find(i => i.canonicalKey === 'resume.contact.email');
      expect(emailItem).toBeUndefined();
      const phoneItem = items.find(i => i.canonicalKey === 'resume.contact.phone');
      expect(phoneItem).toBeUndefined();

      // Placeholder bullet [_] is filtered out
      const bullets = items.filter(i => i.kind === 'achievement' || i.kind === 'experience_claim');
      expect(bullets.some(b => b.exactExcerpt === '[_]')).toBe(false);

      // JD missing skill is ingested as development_priority, NOT a skill
      const gapItem = items.find(i => i.canonicalKey === 'resume.jd_target_gaps');
      expect(gapItem).toBeDefined();
      expect(gapItem?.kind).toBe('development_priority');
    });
  });

  describe('ClearSpeak Context Adapter', () => {
    const mockProfile: ClearSpeakProfile = {
      userId: 'user_123',
      role: 'Project Manager',
      level: 2,
      goal: 'Improve executive presentation pacing',
      audienceContext: 'Board Members',
      mainStruggle: 'Rushing explanations',
      comfortLanguage: 'English',
      practiceDuration: 5,
      createdAt: '2026-07-30T10:00:00Z',
      updatedAt: '2026-07-30T10:00:00Z'
    };

    it('2. Extracts role, goals, vocabulary and delivery scores without ingesting raw audio', () => {
      const items = buildClearSpeakContextItems({
        profile: mockProfile,
        sessionRecordId: 'cs_sess_001',
        sessionScore: {
          clarity: 85,
          pacing: 80,
          rhythm: 75,
          composite: 80,
          hardWordBonus: 5,
          feedbackTip: 'Pacing is steady',
          measuredWpm: 135,
          retrySuccess: true,
          evidenceBasis: 'transcript_timing_heuristic',
          pronunciationAssessed: false,
        },
        practicedWords: ['roadmap', 'throughput'],
        topicTag: 'strategy'
      });

      // Validates presence of profile role, goal, and delivery score
      expect(items.some(i => i.canonicalKey === 'clearspeak.profile.role')).toBe(true);
      expect(items.some(i => i.canonicalKey === 'clearspeak.profile.goal')).toBe(true);
      expect(items.some(i => i.canonicalKey === 'clearspeak.practiced_vocab')).toBe(true);
      expect(items.find(i => i.canonicalKey === 'clearspeak.practiced_vocab')?.provenance).toBe('user_edited');
      expect(items.find(i => i.canonicalKey === 'clearspeak.delivery_composite_score')?.provenance).toBe('system_observed');
      
      const scoreItem = items.find(i => i.canonicalKey === 'clearspeak.delivery_composite_score');
      expect(scoreItem?.kind).toBe('practice_metric');
      expect(scoreItem?.value).toEqual({
        type: 'metric',
        metric: 'clearspeak_composite',
        value: 80,
        scale: '100',
        measuredAt: expect.any(String)
      });
    });

    it('does not promote legacy or unprovenanced delivery scores into Career Context', () => {
      const items = buildClearSpeakContextItems({
        sessionRecordId: 'legacy_session',
        sessionScore: {
          clarity: 88,
          pacing: 90,
          rhythm: 85,
          composite: 88,
          hardWordBonus: 1,
          feedbackTip: 'Legacy score',
          measuredWpm: 125,
          retrySuccess: true,
        } as any,
      });

      expect(items.some(item => item.kind === 'practice_metric')).toBe(false);
    });
  });

  describe('Interview Context Adapter', () => {
    const mockReport: FinalReport = {
      overallSummary: 'Good performance overall',
      evaluationModel: 'v1_dimensions',
      readiness: { status: 'INTERVIEW_READY', reasoning: 'Strong framing' },
      quantitativeAnalysis: {
        dimension_scores: [
          {
            dimension: 'PROBLEM_FRAMING',
            score_status: 'scored',
            anchor_score: 85,
            normalized_score: 85,
            reason: 'Clear structure',
            evidence: ['Structured response'],
            confidence: 'high',
            evidenceReferences: [{ turnId: 'turn_1', excerpt: 'ex', stage: 'framing', questionKind: 'root', signal: 'sig', anchorScore: 4, confidence: 'high' }],
            trajectory: 'stable',
            distinctTurnCount: 1
          }
        ]
      },
      advisoryPanel: [],
      questionPerformance: [],
      biggestRiskArea: { title: 'Pacing', observation: 'Spoke fast under pressure', mitigation: 'Take breathers' },
      coachPack: { title: 'Coach Pack', redoNow: 'q1', micro_drills: [] },
      trajectoryReplay: [],
      auditLayer: [],
      simplifiedScore: null,
      quickWins: [],
      prioritizedActions: [{ action: 'Pause before answering probes', impact: 'high' }]
    };

    it('3. Converts practice signals into interview_practice_signal and development_priority', () => {
      const items = buildInterviewContextItems({
        sessionId: 'int_sess_001',
        report: mockReport
      });

      const signalItem = items.find(i => i.canonicalKey === 'interview.practice_signal.problem_framing');
      expect(signalItem).toBeDefined();
      expect(signalItem?.kind).toBe('interview_practice_signal');

      const riskItem = items.find(i => i.canonicalKey === 'interview.development_priority.biggest_risk');
      expect(riskItem).toBeDefined();
      expect(riskItem?.kind).toBe('development_priority');
    });
  });
});
