import {
  InterviewSetupDraftSchema,
  InterviewSessionContextSchema,
  CareerContextItemSchema,
  CareerContextSnapshotSchema,
  ModuleBridgeSessionSchema,
  GroundingConsentSchema,
  GroundingReferenceSchema,
  createBlankInterviewSetupDraft,
  createResumeGroundedInterviewDraft,
  createClearSpeakGroundedInterviewDraft,
  completeInterviewSessionContext,
  InterviewPlan
} from '../src/index';

describe('P0-3 Career Context and Grounding Shared Contracts', () => {
  const dummyPlan: InterviewPlan = {
    meta: {
      intent: 'Practice interview',
      controls: {
        difficulty: 'intermediate',
        totalQuestions: 4,
        includeBehavioral: true,
        includeCoding: false,
        timePerQuestion: '90s',
        deliveryMode: 'exam',
        reasoningMode: 'classic_behavioral',
        sourceMode: 'job_description'
      }
    },
    jdInsights: {},
    questionSet: [
      {
        id: 'q1',
        phase: 'scenario',
        difficulty: 'intermediate',
        question: 'Describe your leadership experience.',
        expectedSignals: ['leadership'],
        personaFocus: 'lead',
        groundingReferences: [
          {
            contextItemId: '11111111-1111-1111-1111-111111111111',
            sourceModule: 'resume',
            sourceRecordId: '22222222-2222-2222-2222-222222222222',
            sourcePath: 'experience[0].bullets[0]',
            label: 'Led team of 5 engineers',
            exactExcerpt: 'Led a cross-functional team of 5 engineers to deliver project X',
            purpose: 'resume_to_interview'
          }
        ]
      }
    ]
  };

  it('1. InterviewSetupDraft accepts pre-plan state without interviewPlan', () => {
    const draft = createBlankInterviewSetupDraft('Software Engineer', 'System Architecture Practice');
    expect(InterviewSetupDraftSchema.safeParse(draft).success).toBe(true);
    expect((draft as any).interviewPlan).toBeUndefined();
  });

  it('2. InterviewSessionContext strictly requires interviewPlan', () => {
    const draft = createBlankInterviewSetupDraft('Software Engineer', 'System Architecture Practice');
    
    // Incomplete payload lacking interviewPlan fails validation
    const incompleteContext = {
      candidateRole: draft.candidateRole,
      intentText: draft.intentText,
      selectedPanelIDs: draft.selectedPanelIDs,
      controls: draft.controls,
      sessionType: draft.sessionType,
      // missing interviewPlan
    };
    expect(InterviewSessionContextSchema.safeParse(incompleteContext).success).toBe(false);

    // Completed payload with interviewPlan passes validation
    const fullContext = completeInterviewSessionContext(draft, dummyPlan);
    expect(InterviewSessionContextSchema.safeParse(fullContext).success).toBe(true);
  });

  it('3. CareerContextItem enforces strict schema validation and rejects invalid kinds', () => {
    const validItem = {
      id: '11111111-1111-1111-1111-111111111111',
      userId: '00000000-0000-0000-0000-000000000000',
      kind: 'target_role',
      canonicalKey: 'profile.target_role',
      label: 'Target Role',
      value: { type: 'text', text: 'Senior Software Engineer' },
      source: {
        module: 'resume',
        recordId: '22222222-2222-2222-2222-222222222222',
        fieldPath: 'targetRole',
        sourceRevision: 'rev_1',
        sourceHash: 'hash_abc',
        capturedAt: '2026-07-30T10:00:00Z'
      },
      exactExcerpt: 'Senior Software Engineer',
      provenance: 'user_confirmed',
      status: 'active',
      sensitivity: 'standard',
      createdAt: '2026-07-30T10:00:00Z',
      updatedAt: '2026-07-30T10:00:00Z'
    };
    expect(CareerContextItemSchema.safeParse(validItem).success).toBe(true);

    const invalidKind = {
      ...validItem,
      kind: 'hiring_recommendation_score' // Invalid kind
    };
    expect(CareerContextItemSchema.safeParse(invalidKind).success).toBe(false);

    const invalidValue = {
      ...validItem,
      value: { type: 'unknown_unrestricted_payload', data: 'anything' } // Invalid discriminated union
    };
    expect(CareerContextItemSchema.safeParse(invalidValue).success).toBe(false);
  });

  it('4. GroundingConsentSchema enforces strict purpose and scope boundaries', () => {
    const validConsent = {
      scope: 'one_time',
      purpose: 'resume_to_interview',
      includedItemIds: ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'],
      excludedItemIds: ['33333333-3333-3333-3333-333333333333'],
      sourceModules: ['resume'],
      acknowledgedAt: '2026-07-30T10:00:00Z'
    };
    expect(GroundingConsentSchema.safeParse(validConsent).success).toBe(true);

    const invalidConsent = {
      ...validConsent,
      purpose: 'global_hiring_rank' // Invalid purpose
    };
    expect(GroundingConsentSchema.safeParse(invalidConsent).success).toBe(false);
  });

  it('5. CareerContextSnapshotSchema enforces immutability structure', () => {
    const snapshot = {
      id: '44444444-4444-4444-4444-444444444444',
      userId: '00000000-0000-0000-0000-000000000000',
      purpose: 'resume_to_interview',
      contextVersion: 1,
      itemIds: ['11111111-1111-1111-1111-111111111111'],
      projection: {
        targetRole: 'Product Manager',
        skills: ['Roadmapping', 'Agile']
      },
      conflicts: [],
      consent: {
        scope: 'one_time',
        purpose: 'resume_to_interview',
        includedItemIds: ['11111111-1111-1111-1111-111111111111'],
        excludedItemIds: [],
        sourceModules: ['resume'],
        acknowledgedAt: '2026-07-30T10:00:00Z'
      },
      createdAt: '2026-07-30T10:00:00Z',
      sourceModules: ['resume']
    };
    expect(CareerContextSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it('6. ModuleBridgeSessionSchema enforces status lifecycle', () => {
    const bridge = {
      id: '55555555-5555-5555-5555-555555555555',
      userId: '00000000-0000-0000-0000-000000000000',
      sourceModule: 'clearspeak',
      targetModule: 'interview',
      purpose: 'clearspeak_to_interview',
      snapshotId: '44444444-4444-4444-4444-444444444444',
      status: 'confirmed',
      clientRequestId: '66666666-6666-6666-6666-666666666666',
      createdAt: '2026-07-30T10:00:00Z',
      updatedAt: '2026-07-30T10:00:00Z'
    };
    expect(ModuleBridgeSessionSchema.safeParse(bridge).success).toBe(true);

    const invalidStatus = {
      ...bridge,
      status: 'permanently_bound' // Invalid status
    };
    expect(ModuleBridgeSessionSchema.safeParse(invalidStatus).success).toBe(false);
  });

  it('7. GroundingReferenceSchema differs from candidate answer evidence', () => {
    const reference = {
      contextItemId: '11111111-1111-1111-1111-111111111111',
      sourceModule: 'resume',
      sourceRecordId: '22222222-2222-2222-2222-222222222222',
      sourcePath: 'experience[0].bullets[1]',
      label: 'Optimized SQL queries by 40%',
      exactExcerpt: 'Optimized Postgres SQL queries reducing latency by 40%',
      purpose: 'resume_to_interview'
    };
    expect(GroundingReferenceSchema.safeParse(reference).success).toBe(true);
  });

  it('8. Resume and ClearSpeak grounded draft builders produce valid strict draft schemas', () => {
    const snapId = '44444444-4444-4444-4444-444444444444';
    const bridgeId = '55555555-5555-5555-5555-555555555555';
    const resumeDraft = createResumeGroundedInterviewDraft(snapId, bridgeId, 'Backend Architect', 'Interview based on my resume');
    expect(InterviewSetupDraftSchema.safeParse(resumeDraft).success).toBe(true);
    expect(resumeDraft.groundingRequest?.snapshotId).toBe(snapId);

    const speakDraft = createClearSpeakGroundedInterviewDraft(snapId, bridgeId, 'Tech Lead', 'How do you handle scope creep?');
    expect(InterviewSetupDraftSchema.safeParse(speakDraft).success).toBe(true);
    expect(speakDraft.bridgeIntent?.bridgeQuestion).toBe('How do you handle scope creep?');
  });
});
