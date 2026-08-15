import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AdaptiveAnswerSubmissionRequestSchema,
  AdaptiveAnswerSubmissionResponseSchema,
  CareerContextGetResponseSchema,
  CareerContextSnapshotSchema,
  FinalReportSchema,
  GroundingSnapshotCreateRequestSchema,
  GroundingSnapshotCreateResponseSchema,
  InterviewPlanSchema,
  InterviewSessionStartRequestSchema,
  InterviewSessionStartResponseSchema,
  ModuleBridgeCreateRequestSchema,
  ModuleBridgeCreateResponseSchema,
  PlanGenerationRequestSchema,
  SessionControlsSchema,
  type AdaptiveAnswerSubmissionRequest,
  type AdaptiveAnswerSubmissionResponse,
  type CareerContextGetResponse,
  type CareerContextItem,
  type CareerContextSnapshot,
  type FinalReport,
  type InterviewPlan,
  type QuestionBlueprint,
  type SessionControls,
} from 'mockmate-shared';
import { apiClient, ApiError } from '../../services/apiClient';

type Phase = 'setup' | 'starting' | 'asking' | 'submitting' | 'reporting' | 'complete';
type GroundingSource = 'resume' | 'clearspeak';

type PendingTurn = {
  sessionId: string;
  payload: AdaptiveAnswerSubmissionRequest;
};

type PendingGrounding = {
  role: string;
  intent: string;
  sourceModule: GroundingSource;
  purpose: 'resume_to_interview' | 'clearspeak_to_interview';
  itemIds: string[];
  excludedItemIds: string[];
  contextVersion: number;
  sourceRecordId: string;
  consentAcknowledgedAt: string;
  snapshotClientRequestId: string;
  bridgeClientRequestId: string;
  snapshot?: CareerContextSnapshot;
  bridgeId?: string;
};

const MOBILE_CONTROLS: SessionControls = SessionControlsSchema.parse({
  difficulty: 'intermediate',
  totalQuestions: 3,
  includeBehavioral: true,
  includeCoding: false,
  timePerQuestion: 'none',
  deliveryMode: 'coach',
  reasoningMode: 'classic_behavioral',
  sourceMode: 'question_bank',
});

const MOBILE_PANEL_IDS = ['p1'];
const INITIAL_ADAPTIVE_SESSION_VERSION = 1;
const PENDING_GROUNDING_STORAGE_KEY = 'mockmate_pending_grounded_interview_v1';
const MAX_PENDING_GROUNDING_STORAGE_BYTES = 64 * 1024;
const MAX_PENDING_GROUNDING_IDS = 128;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PENDING_GROUNDING_ALLOWED_KEYS = new Set([
  'role',
  'intent',
  'sourceModule',
  'purpose',
  'itemIds',
  'excludedItemIds',
  'contextVersion',
  'sourceRecordId',
  'consentAcknowledgedAt',
  'snapshotClientRequestId',
  'bridgeClientRequestId',
  'snapshot',
  'bridgeId',
]);

function createUuidV4(): string {
  const randomUuid = (globalThis as any)?.crypto?.randomUUID;
  if (typeof randomUuid === 'function') return randomUuid.call((globalThis as any).crypto);
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function careerItemValue(item: CareerContextItem): string {
  switch (item.value.type) {
    case 'text':
      return item.value.text;
    case 'string_list':
      return item.value.values.join(', ');
    case 'metric':
      return `${item.value.metric}: ${item.value.value}${item.value.scale ? ` ${item.value.scale}` : ''}`;
    case 'evidence':
      return item.value.summary;
    default:
      return item.label;
  }
}

function sameIds(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((value, index) => value === b[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function parseUuidArray(value: unknown, allowEmpty: boolean): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_PENDING_GROUNDING_IDS || (!allowEmpty && value.length === 0)) return null;
  if (!value.every(isUuid)) return null;
  const ids = value as string[];
  return new Set(ids).size === ids.length ? ids : null;
}

function validatePendingGroundingRecovery(value: unknown): PendingGrounding | null {
  if (!isRecord(value)) return null;
  if (Object.keys(value).some((key) => !PENDING_GROUNDING_ALLOWED_KEYS.has(key))) return null;

  const role = isBoundedString(value.role, 500) ? value.role : null;
  const intent = isBoundedString(value.intent, 4000) ? value.intent : null;
  const sourceModule = value.sourceModule === 'resume' || value.sourceModule === 'clearspeak' ? value.sourceModule : null;
  const purpose = value.purpose === 'resume_to_interview' || value.purpose === 'clearspeak_to_interview' ? value.purpose : null;
  const itemIds = parseUuidArray(value.itemIds, false);
  const excludedItemIds = parseUuidArray(value.excludedItemIds, true);
  const contextVersion = Number.isInteger(value.contextVersion) && Number(value.contextVersion) >= 1
    ? Number(value.contextVersion)
    : null;
  const sourceRecordId = isBoundedString(value.sourceRecordId, 500) ? value.sourceRecordId : null;
  const consentAcknowledgedAt = isBoundedString(value.consentAcknowledgedAt, 80) && !Number.isNaN(Date.parse(value.consentAcknowledgedAt))
    ? value.consentAcknowledgedAt
    : null;
  const snapshotClientRequestId = isUuid(value.snapshotClientRequestId) ? value.snapshotClientRequestId : null;
  const bridgeClientRequestId = isUuid(value.bridgeClientRequestId) ? value.bridgeClientRequestId : null;

  if (!role || !intent || !sourceModule || !purpose || !itemIds || !excludedItemIds || !contextVersion ||
      !sourceRecordId || !consentAcknowledgedAt || !snapshotClientRequestId || !bridgeClientRequestId) return null;
  if ((sourceModule === 'resume' && purpose !== 'resume_to_interview') ||
      (sourceModule === 'clearspeak' && purpose !== 'clearspeak_to_interview')) return null;
  if (excludedItemIds.some((id) => itemIds.includes(id))) return null;

  const requestValidation = GroundingSnapshotCreateRequestSchema.safeParse({
    purpose,
    includedItemIds: itemIds,
    excludedItemIds,
    conflictSelections: {},
    consent: {
      scope: 'one_time',
      purpose,
      includedItemIds: itemIds,
      excludedItemIds,
      sourceModules: [sourceModule],
      acknowledgedAt: consentAcknowledgedAt,
    },
    expectedContextVersion: contextVersion,
    clientRequestId: snapshotClientRequestId,
  });
  if (!requestValidation.success) return null;

  let snapshot: CareerContextSnapshot | undefined;
  if (value.snapshot !== undefined) {
    const parsedSnapshot = CareerContextSnapshotSchema.safeParse(value.snapshot);
    if (!parsedSnapshot.success) return null;
    snapshot = parsedSnapshot.data;
    if (snapshot.purpose !== purpose || snapshot.contextVersion !== contextVersion || !sameIds(snapshot.itemIds, itemIds) ||
        snapshot.sourceModules.length !== 1 || snapshot.sourceModules[0] !== sourceModule ||
        snapshot.consent.scope !== 'one_time' || snapshot.consent.purpose !== purpose ||
        !sameIds(snapshot.consent.includedItemIds, itemIds) ||
        !sameIds(snapshot.consent.excludedItemIds, excludedItemIds) ||
        snapshot.consent.sourceModules.length !== 1 || snapshot.consent.sourceModules[0] !== sourceModule) return null;
  }

  let bridgeId: string | undefined;
  if (value.bridgeId !== undefined) {
    if (!snapshot || !isUuid(value.bridgeId)) return null;
    bridgeId = value.bridgeId;
    const bridgeValidation = ModuleBridgeCreateRequestSchema.safeParse({
      sourceModule,
      targetModule: 'interview',
      purpose,
      snapshotId: snapshot.id,
      sourceRecordId,
      clientRequestId: bridgeClientRequestId,
    });
    if (!bridgeValidation.success) return null;
  }

  return {
    role,
    intent,
    sourceModule,
    purpose,
    itemIds,
    excludedItemIds,
    contextVersion,
    sourceRecordId,
    consentAcknowledgedAt,
    snapshotClientRequestId,
    bridgeClientRequestId,
    ...(snapshot ? { snapshot } : {}),
    ...(bridgeId ? { bridgeId } : {}),
  };
}

async function persistPendingGroundingRecovery(pending: PendingGrounding): Promise<void> {
  const validated = validatePendingGroundingRecovery(pending);
  if (!validated) throw new Error('Grounded Interview recovery state failed local validation.');
  const serialized = JSON.stringify(validated);
  if (serialized.length > MAX_PENDING_GROUNDING_STORAGE_BYTES) {
    throw new Error('Grounded Interview recovery state exceeds the local safety bound.');
  }
  await AsyncStorage.setItem(PENDING_GROUNDING_STORAGE_KEY, serialized);
}

async function restorePendingGroundingRecovery(): Promise<PendingGrounding | null> {
  const raw = await AsyncStorage.getItem(PENDING_GROUNDING_STORAGE_KEY);
  if (!raw) return null;
  if (raw.length > MAX_PENDING_GROUNDING_STORAGE_BYTES) {
    await AsyncStorage.removeItem(PENDING_GROUNDING_STORAGE_KEY);
    return null;
  }
  try {
    const validated = validatePendingGroundingRecovery(JSON.parse(raw));
    if (!validated) {
      await AsyncStorage.removeItem(PENDING_GROUNDING_STORAGE_KEY);
      return null;
    }
    return validated;
  } catch {
    await AsyncStorage.removeItem(PENDING_GROUNDING_STORAGE_KEY);
    return null;
  }
}

export default function InterviewScreen() {
  const [phase, setPhase] = useState<Phase>('setup');
  const [role, setRole] = useState('');
  const [intent, setIntent] = useState('Practice a realistic interview and improve how I frame decisions.');
  const [plan, setPlan] = useState<InterviewPlan | null>(null);
  const [sessionId, setSessionId] = useState('');
  const [sessionVersion, setSessionVersion] = useState(INITIAL_ADAPTIVE_SESSION_VERSION);
  const [currentQuestion, setCurrentQuestion] = useState<QuestionBlueprint | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [openingMessage, setOpeningMessage] = useState('');
  const [rootQuestionIndex, setRootQuestionIndex] = useState(0);
  const [rootQuestionCount, setRootQuestionCount] = useState(0);
  const [turnIndex, setTurnIndex] = useState(0);
  const [maxTurns, setMaxTurns] = useState(0);
  const [stage, setStage] = useState('framing');
  const [coachFeedback, setCoachFeedback] = useState<{ strength?: string; nextFocus?: string } | null>(null);
  const [report, setReport] = useState<FinalReport | null>(null);
  const [errorText, setErrorText] = useState('');
  const [hasPendingTurn, setHasPendingTurn] = useState(false);
  const [useCareerContext, setUseCareerContext] = useState(false);
  const [careerContext, setCareerContext] = useState<CareerContextGetResponse | null>(null);
  const [groundingSource, setGroundingSource] = useState<GroundingSource>('resume');
  const [selectedContextItemIds, setSelectedContextItemIds] = useState<string[]>([]);
  const [groundingConsent, setGroundingConsent] = useState(false);
  const [loadingContext, setLoadingContext] = useState(false);
  const [hasPendingGrounding, setHasPendingGrounding] = useState(false);
  const [groundingRecoveryChecked, setGroundingRecoveryChecked] = useState(false);
  const pendingTurnRef = useRef<PendingTurn | null>(null);
  const pendingGroundingRef = useRef<PendingGrounding | null>(null);
  const sessionEpochRef = useRef(0);

  const progressLabel = useMemo(() => {
    if (!rootQuestionCount) return 'Preparing session';
    const scenario = Math.min(rootQuestionIndex + 1, rootQuestionCount);
    return `Scenario ${scenario} of ${rootQuestionCount}${maxTurns ? ` · Turn ${turnIndex + 1} of ${maxTurns}` : ''}`;
  }, [maxTurns, rootQuestionCount, rootQuestionIndex, turnIndex]);

  const eligibleContextItems = useMemo(() => {
    if (!careerContext) return [];
    return careerContext.activeItems.filter((item) =>
      item.source.module === groundingSource &&
      item.sensitivity === 'standard' &&
      item.provenance !== 'inferred_pending'
    );
  }, [careerContext, groundingSource]);

  const unresolvedConflicts = careerContext?.conflicts.filter((conflict) => conflict.requiresUserChoice) ?? [];

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const restored = await restorePendingGroundingRecovery();
          if (!active) return;
          if (restored) {
            pendingGroundingRef.current = restored;
            setRole(restored.role);
            setIntent(restored.intent);
            setGroundingSource(restored.sourceModule);
            setSelectedContextItemIds(restored.itemIds);
            setGroundingConsent(true);
            setUseCareerContext(true);
            setHasPendingGrounding(true);
          }
        } catch {
          if (active) setErrorText('Saved grounded-launch recovery could not be checked. Grounded Interview is blocked until local recovery storage is available.');
        } finally {
          if (active) setGroundingRecoveryChecked(true);
        }
      })();
    }, 0);

    return () => {
      active = false;
      clearTimeout(timer);
      sessionEpochRef.current += 1;
    };
  }, []);

  const loadCareerContext = async (): Promise<CareerContextGetResponse | null> => {
    if (pendingGroundingRef.current) {
      setErrorText('Retry or abandon the saved grounded launch before loading mutable Career Context.');
      return null;
    }
    setLoadingContext(true);
    try {
      const response = await apiClient.get('/career-context', CareerContextGetResponseSchema);
      setCareerContext(response);
      return response;
    } catch (error: any) {
      setErrorText(error?.message || 'Career Context is unavailable.');
      return null;
    } finally {
      setLoadingContext(false);
    }
  };

  const clearGroundingDraft = async (): Promise<void> => {
    await AsyncStorage.removeItem(PENDING_GROUNDING_STORAGE_KEY);
    pendingGroundingRef.current = null;
    setHasPendingGrounding(false);
    setGroundingConsent(false);
  };

  const abandonPendingGrounding = () => {
    Alert.alert(
      'Abandon pending grounded launch?',
      'This discards only the saved local retry selectors for this one grounded launch. It does not delete Career Context facts. If an earlier server request committed, its immutable server record remains governed by the backend.',
      [
        { text: 'Keep retry', style: 'cancel' },
        {
          text: 'Abandon launch',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await clearGroundingDraft();
                setErrorText('');
              } catch {
                setErrorText('MockMate could not clear the saved grounded-launch recovery. Keep this setup unchanged and retry instead.');
              }
            })();
          },
        },
      ],
    );
  };

  const resetSession = () => {
    sessionEpochRef.current += 1;
    setPhase('setup');
    setPlan(null);
    setSessionId('');
    setSessionVersion(INITIAL_ADAPTIVE_SESSION_VERSION);
    setCurrentQuestion(null);
    setAnswerText('');
    setOpeningMessage('');
    setRootQuestionIndex(0);
    setRootQuestionCount(0);
    setTurnIndex(0);
    setMaxTurns(0);
    setStage('framing');
    setCoachFeedback(null);
    setReport(null);
    setErrorText('');
    pendingTurnRef.current = null;
    setHasPendingTurn(false);
  };

  const generateReport = async (activeSessionId: string) => {
    const requestEpoch = sessionEpochRef.current;
    setPhase('reporting');
    setErrorText('');
    try {
      const finalReport = await apiClient.post(
        `/interview/sessions/${activeSessionId}/report`,
        FinalReportSchema,
        {},
      );
      if (requestEpoch !== sessionEpochRef.current) return;
      setReport(finalReport);
      setPhase('complete');
    } catch (error: any) {
      if (requestEpoch !== sessionEpochRef.current) return;
      setPhase('asking');
      setErrorText(error?.message || 'The authoritative report is unavailable. Retry report generation.');
    }
  };

  const materializePendingGrounding = async (initial: PendingGrounding): Promise<{ snapshot: CareerContextSnapshot; bridgeId: string }> => {
    let pending = initial;
    let snapshot = pending.snapshot;

    if (!snapshot) {
      const snapshotRequest = GroundingSnapshotCreateRequestSchema.parse({
        purpose: pending.purpose,
        includedItemIds: pending.itemIds,
        excludedItemIds: pending.excludedItemIds,
        conflictSelections: {},
        consent: {
          scope: 'one_time',
          purpose: pending.purpose,
          includedItemIds: pending.itemIds,
          excludedItemIds: pending.excludedItemIds,
          sourceModules: [pending.sourceModule],
          acknowledgedAt: pending.consentAcknowledgedAt,
        },
        expectedContextVersion: pending.contextVersion,
        clientRequestId: pending.snapshotClientRequestId,
      });
      const snapshotResponse = await apiClient.post(
        '/career-context/snapshots',
        GroundingSnapshotCreateResponseSchema,
        snapshotRequest,
      );
      snapshot = snapshotResponse.snapshot;
      pending = { ...pending, snapshot };
      pendingGroundingRef.current = pending;
      await persistPendingGroundingRecovery(pending);
    }

    let bridgeId = pending.bridgeId;
    if (!bridgeId) {
      const bridgeRequest = ModuleBridgeCreateRequestSchema.parse({
        sourceModule: pending.sourceModule,
        targetModule: 'interview',
        purpose: pending.purpose,
        snapshotId: snapshot.id,
        sourceRecordId: pending.sourceRecordId,
        clientRequestId: pending.bridgeClientRequestId,
      });
      const bridgeResponse = await apiClient.post(
        '/career-context/bridges',
        ModuleBridgeCreateResponseSchema,
        bridgeRequest,
      );
      bridgeId = bridgeResponse.bridge.id;
      pending = { ...pending, snapshot, bridgeId };
      pendingGroundingRef.current = pending;
      await persistPendingGroundingRecovery(pending);
    }

    return { snapshot, bridgeId };
  };

  const resolveGroundingLineage = async (
    trimmedRole: string,
    trimmedIntent: string,
  ): Promise<{ snapshot: CareerContextSnapshot; bridgeId: string }> => {
    const existing = pendingGroundingRef.current;
    if (existing) {
      const exactRetry = existing.role === trimmedRole &&
        existing.intent === trimmedIntent &&
        existing.sourceModule === groundingSource &&
        sameIds(existing.itemIds, selectedContextItemIds);
      if (!exactRetry) {
        throw new Error('A grounded launch may already have committed. Keep the original role, goal, source and fact selection and retry the exact launch.');
      }
      return materializePendingGrounding(existing);
    }

    const fresh = await apiClient.get('/career-context', CareerContextGetResponseSchema);
    setCareerContext(fresh);
    if (!fresh.state.personalizationEnabled) {
      throw new Error('Career Context personalization is disabled. Enable it before starting a grounded interview.');
    }
    if (fresh.conflicts.some((conflict) => conflict.requiresUserChoice)) {
      throw new Error('Career Context has unresolved conflicts. Review them before creating a grounded interview.');
    }

    const eligible = fresh.activeItems.filter((item) =>
      item.source.module === groundingSource &&
      item.sensitivity === 'standard' &&
      item.provenance !== 'inferred_pending'
    );
    const selected = eligible.filter((item) => selectedContextItemIds.includes(item.id));
    if (selected.length === 0 || selected.length !== selectedContextItemIds.length) {
      setSelectedContextItemIds(selected.map((item) => item.id));
      throw new Error('Career Context changed before launch. Review the refreshed fact selection and try again.');
    }
    if (!groundingConsent) {
      throw new Error('Confirm one-time Career Context consent before starting a grounded interview.');
    }

    const itemIds = selected.map((item) => item.id);
    const pending: PendingGrounding = {
      role: trimmedRole,
      intent: trimmedIntent,
      sourceModule: groundingSource,
      purpose: groundingSource === 'resume' ? 'resume_to_interview' : 'clearspeak_to_interview',
      itemIds,
      excludedItemIds: eligible.filter((item) => !itemIds.includes(item.id)).map((item) => item.id),
      contextVersion: fresh.state.contextVersion,
      sourceRecordId: selected[0].source.recordId,
      consentAcknowledgedAt: new Date().toISOString(),
      snapshotClientRequestId: createUuidV4(),
      bridgeClientRequestId: createUuidV4(),
    };
    await persistPendingGroundingRecovery(pending);
    pendingGroundingRef.current = pending;
    setHasPendingGrounding(true);
    return materializePendingGrounding(pending);
  };

  const startInterview = async () => {
    if (!groundingRecoveryChecked) {
      setErrorText('MockMate is still checking for a saved grounded launch.');
      return;
    }
    const trimmedRole = role.trim();
    const trimmedIntent = intent.trim();
    if (!trimmedRole || !trimmedIntent) {
      Alert.alert('Role and goal required', 'Enter the role you are preparing for and what you want to practice.');
      return;
    }

    const requestEpoch = sessionEpochRef.current;
    setPhase('starting');
    setErrorText('');
    try {
      let grounding: { snapshot: CareerContextSnapshot; bridgeId: string } | null = null;
      if (useCareerContext) {
        grounding = await resolveGroundingLineage(trimmedRole, trimmedIntent);
        if (requestEpoch !== sessionEpochRef.current) return;
      } else if (pendingGroundingRef.current) {
        throw new Error('An exact grounded launch is pending. Retry it before switching to ungrounded practice.');
      }

      const planRequest = PlanGenerationRequestSchema.parse({
        role: trimmedRole,
        intent: trimmedIntent,
        controls: MOBILE_CONTROLS,
        selectedPanelIDs: MOBILE_PANEL_IDS,
        ...(grounding ? { snapshotId: grounding.snapshot.id, bridgeId: grounding.bridgeId } : {}),
      });
      const generatedPlan = await apiClient.post('/interview/plan', InterviewPlanSchema, planRequest);
      if (requestEpoch !== sessionEpochRef.current) return;

      if (grounding) {
        const authority = generatedPlan.authority;
        if (!authority || authority.snapshotId !== grounding.snapshot.id || authority.bridgeId !== grounding.bridgeId) {
          throw new Error('The server did not return matching authoritative grounding lineage for this Interview plan.');
        }
      }

      const sessionRequest = InterviewSessionStartRequestSchema.parse({
        context: {
          candidateRole: trimmedRole,
          intentText: trimmedIntent,
          selectedPanelIDs: MOBILE_PANEL_IDS,
          controls: generatedPlan.meta.controls,
          interviewPlan: generatedPlan,
          sessionType: 'structured',
          jdInsights: generatedPlan.jdInsights,
          ...(grounding ? {
            groundingSnapshot: grounding.snapshot,
            bridgeSessionId: grounding.bridgeId,
          } : {}),
        },
      });
      const started = await apiClient.post(
        '/interview/sessions',
        InterviewSessionStartResponseSchema,
        sessionRequest,
      );
      if (requestEpoch !== sessionEpochRef.current) return;

      pendingGroundingRef.current = null;
      setHasPendingGrounding(false);
      setGroundingConsent(false);
      try {
        await AsyncStorage.removeItem(PENDING_GROUNDING_STORAGE_KEY);
      } catch {
        setErrorText('Interview started, but MockMate could not clear local grounded-launch recovery. The server session remains authoritative.');
      }
      setPlan(generatedPlan);
      setSessionId(started.sessionId);
      setSessionVersion(INITIAL_ADAPTIVE_SESSION_VERSION);
      setCurrentQuestion(started.firstQuestion);
      setOpeningMessage(started.openingMessage);
      setRootQuestionIndex(started.questionIndex);
      setRootQuestionCount(started.totalQuestions);
      setTurnIndex(0);
      setMaxTurns(0);
      setStage(started.firstQuestion.stage || 'framing');
      setCoachFeedback(null);
      setAnswerText('');
      setPhase('asking');
    } catch (error: any) {
      if (requestEpoch !== sessionEpochRef.current) return;
      setPhase('setup');
      setErrorText(
        error instanceof ApiError && error.status === 429
          ? 'Your current interview practice allowance is used. Continue with saved work or try again when the allowance resets.'
          : error?.message || 'Interview practice is currently unavailable.',
      );
    }
  };

  const applyTurnResult = async (response: AdaptiveAnswerSubmissionResponse) => {
    pendingTurnRef.current = null;
    setHasPendingTurn(false);
    setSessionVersion(response.sessionVersion);
    setRootQuestionIndex(response.rootQuestionIndex);
    setRootQuestionCount(response.rootQuestionCount);
    setTurnIndex(response.turnIndex);
    setMaxTurns(response.maxTurns);
    setStage(response.stage);
    setCoachFeedback(response.coachFeedback || null);
    setAnswerText('');

    if (response.isSessionComplete || !response.nextQuestion) {
      setCurrentQuestion(null);
      if (!sessionId) {
        setErrorText('The authoritative session identifier is missing.');
        setPhase('asking');
        return;
      }
      await generateReport(sessionId);
      return;
    }

    setCurrentQuestion(response.nextQuestion);
    setPhase('asking');
  };

  const submitPendingTurn = async (pending: PendingTurn) => {
    const requestEpoch = sessionEpochRef.current;
    setPhase('submitting');
    setErrorText('');
    try {
      const response = await apiClient.post(
        `/interview/sessions/${pending.sessionId}/answers`,
        AdaptiveAnswerSubmissionResponseSchema,
        pending.payload,
      );
      if (requestEpoch !== sessionEpochRef.current) return;
      await applyTurnResult(response);
    } catch (error: any) {
      if (requestEpoch !== sessionEpochRef.current) return;
      const terminal = error instanceof ApiError && [400, 409, 422].includes(error.status);
      if (terminal) {
        pendingTurnRef.current = null;
        setHasPendingTurn(false);
      }
      setPhase('asking');
      setErrorText(
        terminal
          ? 'This turn no longer matches the authoritative session state. Start a new session rather than guessing the next question.'
          : error?.message || 'The turn may not have reached the server. Retry the same turn to preserve idempotency.',
      );
    }
  };

  const prepareAndSubmitTurn = async (answerKind: 'answered' | 'skipped') => {
    if (!sessionId || !currentQuestion) return;
    const normalizedAnswer = answerText.trim();
    if (answerKind === 'answered' && !normalizedAnswer) {
      Alert.alert('Answer required', 'Type an answer or choose Skip question.');
      return;
    }

    const existing = pendingTurnRef.current;
    const canReuse = existing &&
      existing.sessionId === sessionId &&
      existing.payload.questionId === currentQuestion.id &&
      existing.payload.expectedSessionVersion === sessionVersion &&
      existing.payload.answerKind === answerKind &&
      (existing.payload.answerText || '') === (answerKind === 'answered' ? normalizedAnswer : '');

    const payload = canReuse
      ? existing.payload
      : AdaptiveAnswerSubmissionRequestSchema.parse({
          questionId: currentQuestion.id,
          expectedSessionVersion: sessionVersion,
          clientSubmissionId: createUuidV4(),
          answerKind,
          ...(answerKind === 'answered' ? { answerText: normalizedAnswer } : {}),
        });

    const pending = { sessionId, payload };
    pendingTurnRef.current = pending;
    setHasPendingTurn(true);
    await submitPendingTurn(pending);
  };

  const retryPendingTurn = async () => {
    const pending = pendingTurnRef.current;
    if (!pending) return;
    await submitPendingTurn(pending);
  };

  const toggleCareerContext = async () => {
    if (hasPendingGrounding) {
      Alert.alert('Exact retry required', 'A grounded launch may already have committed. Retry that exact launch before changing grounding mode.');
      return;
    }
    const next = !useCareerContext;
    setUseCareerContext(next);
    setGroundingConsent(false);
    setSelectedContextItemIds([]);
    if (next && !careerContext) await loadCareerContext();
  };

  const chooseGroundingSource = (source: GroundingSource) => {
    if (hasPendingGrounding) {
      Alert.alert('Exact retry required', 'Retry the pending grounded launch before changing its source.');
      return;
    }
    setGroundingSource(source);
    setSelectedContextItemIds([]);
    setGroundingConsent(false);
  };

  const toggleContextItem = (itemId: string) => {
    if (hasPendingGrounding) return;
    setSelectedContextItemIds((current) => current.includes(itemId)
      ? current.filter((id) => id !== itemId)
      : [...current, itemId]
    );
    setGroundingConsent(false);
  };

  if (phase === 'setup' || phase === 'starting') {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Interview Practice</Text>
          <Text style={styles.subtitle}>
            Native Interview uses the same server-authoritative adaptive engine as MockMate on the web. Questions, evaluation, progression and reports come from the backend; Career Context is optional and always explicit.
          </Text>

          <View style={styles.card}>
            <Text style={styles.label}>Target role</Text>
            <TextInput
              value={role}
              onChangeText={setRole}
              placeholder="e.g. Product Manager"
              placeholderTextColor="#64748b"
              style={styles.input}
              editable={groundingRecoveryChecked && phase !== 'starting' && !hasPendingGrounding}
            />
            <Text style={styles.label}>Practice goal</Text>
            <TextInput
              value={intent}
              onChangeText={setIntent}
              placeholder="What do you want this interview to focus on?"
              placeholderTextColor="#64748b"
              multiline
              style={[styles.input, styles.textArea]}
              editable={groundingRecoveryChecked && phase !== 'starting' && !hasPendingGrounding}
            />
            <View style={styles.policyCard}>
              <Text style={styles.policyTitle}>Mobile session profile</Text>
              <Text style={styles.muted}>3 core scenarios · coach mode · intermediate · typed answers · no coding. Ungrounded by default; optional Career Context requires one-time consent and server-authoritative lineage.</Text>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.optionHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.policyTitle}>Use Career Context</Text>
                <Text style={styles.muted}>Create a one-time immutable grounding snapshot from facts you explicitly select.</Text>
              </View>
              <TouchableOpacity
                style={[styles.toggleButton, useCareerContext && styles.toggleButtonActive, hasPendingGrounding && styles.disabled]}
                disabled={!groundingRecoveryChecked || phase === 'starting' || hasPendingGrounding}
                onPress={() => void toggleCareerContext()}
              >
                <Text style={useCareerContext ? styles.toggleTextActive : styles.toggleText}>{useCareerContext ? 'ON' : 'OFF'}</Text>
              </TouchableOpacity>
            </View>

            {!groundingRecoveryChecked ? (
              <View style={styles.loadingBlock}>
                <ActivityIndicator color="#d4af37" />
                <Text style={styles.muted}>Checking saved grounded-launch recovery…</Text>
              </View>
            ) : useCareerContext ? (
              <>
                {loadingContext ? (
                  <View style={styles.loadingBlock}>
                    <ActivityIndicator color="#d4af37" />
                    <Text style={styles.muted}>Loading authoritative Career Context…</Text>
                  </View>
                ) : careerContext ? (
                  <>
                    <Text style={styles.contextStatus}>
                      Personalization: {careerContext.state.personalizationEnabled ? 'enabled' : 'disabled'} · Context v{careerContext.state.contextVersion}
                    </Text>
                    {unresolvedConflicts.length > 0 ? (
                      <View style={styles.warningCard}>
                        <Text style={styles.warningText}>Grounded launch is blocked by {unresolvedConflicts.length} unresolved Career Context conflict(s). Review Career Context first.</Text>
                      </View>
                    ) : null}

                    <Text style={styles.label}>Grounding source</Text>
                    <View style={styles.sourceRow}>
                      {(['resume', 'clearspeak'] as GroundingSource[]).map((source) => (
                        <TouchableOpacity
                          key={source}
                          style={[styles.sourceChoice, groundingSource === source && styles.sourceChoiceActive]}
                          disabled={phase === 'starting' || hasPendingGrounding}
                          onPress={() => chooseGroundingSource(source)}
                        >
                          <Text style={groundingSource === source ? styles.sourceChoiceTextActive : styles.sourceChoiceText}>
                            {source === 'resume' ? 'Resume' : 'ClearSpeak'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={styles.label}>Select confirmed facts</Text>
                    {eligibleContextItems.length === 0 ? (
                      <Text style={styles.muted}>No standard-sensitivity active {groundingSource === 'resume' ? 'Resume' : 'ClearSpeak'} facts are available. Rebuild/confirm facts in Career Context first.</Text>
                    ) : eligibleContextItems.map((item) => {
                      const selected = selectedContextItemIds.includes(item.id);
                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={[styles.contextItem, selected && styles.contextItemSelected]}
                          disabled={phase === 'starting' || hasPendingGrounding}
                          onPress={() => toggleContextItem(item.id)}
                        >
                          <Text style={styles.contextCheck}>{selected ? '✓' : '○'}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.contextItemTitle}>{item.label || item.kind.replace(/_/g, ' ')}</Text>
                            <Text style={styles.contextItemValue}>{careerItemValue(item)}</Text>
                            <Text style={styles.contextItemMeta}>{item.provenance.replace(/_/g, ' ')} · {item.source.recordId}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}

                    <TouchableOpacity
                      style={[styles.consentBox, groundingConsent && styles.consentBoxActive, hasPendingGrounding && styles.disabled]}
                      disabled={phase === 'starting' || hasPendingGrounding || selectedContextItemIds.length === 0}
                      onPress={() => setGroundingConsent((current) => !current)}
                    >
                      <Text style={styles.contextCheck}>{groundingConsent ? '✓' : '○'}</Text>
                      <Text style={styles.consentText}>I consent to use only the selected facts for this one Interview session. This creates immutable server-authoritative snapshot/bridge lineage.</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.smallButton} disabled={phase === 'starting' || hasPendingGrounding} onPress={() => void loadCareerContext()}>
                      <Text style={styles.smallButtonText}>Reload Career Context</Text>
                    </TouchableOpacity>
                  </>
                ) : hasPendingGrounding ? (
                  <Text style={styles.muted}>Saved grounded-launch recovery is ready. Retry the exact launch before loading mutable Career Context.</Text>
                ) : (
                  <TouchableOpacity style={styles.smallButton} onPress={() => void loadCareerContext()}>
                    <Text style={styles.smallButtonText}>Load Career Context</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : null}
          </View>

          {hasPendingGrounding ? (
            <View style={styles.warningCard}>
              <Text style={styles.warningText}>A grounded launch may already have committed server-side. Keep this setup unchanged and retry the exact launch; MockMate will reuse the same persisted snapshot/bridge request IDs.</Text>
              <TouchableOpacity style={styles.abandonButton} disabled={phase === 'starting'} onPress={abandonPendingGrounding}>
                <Text style={styles.abandonButtonText}>Abandon pending grounded launch</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.primaryButton, (phase === 'starting' || !groundingRecoveryChecked) && styles.disabled]}
            disabled={phase === 'starting' || !groundingRecoveryChecked}
            onPress={() => void startInterview()}
          >
            {phase === 'starting'
              ? <ActivityIndicator color="#0b1329" />
              : !groundingRecoveryChecked
                ? <Text style={styles.primaryButtonText}>Checking saved launch…</Text>
                : <Text style={styles.primaryButtonText}>{hasPendingGrounding ? 'Retry exact grounded launch' : 'Generate & start interview'}</Text>}
          </TouchableOpacity>

          {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (phase === 'complete' && report) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <Text style={styles.title}>Interview Report</Text>
          <View style={styles.card}>
            <Text style={styles.readiness}>{String(report.readiness.status).replace(/_/g, ' ')}</Text>
            <Text style={styles.reportSummary}>{report.overallSummary}</Text>
            <Text style={styles.muted}>{report.readiness.reasoning}</Text>
          </View>
          <TouchableOpacity style={styles.primaryButton} onPress={resetSession}>
            <Text style={styles.primaryButtonText}>Start another interview</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Interview Practice</Text>
            <Text style={styles.progress}>{progressLabel}</Text>
          </View>
          <TouchableOpacity onPress={resetSession}>
            <Text style={styles.exitText}>Exit</Text>
          </TouchableOpacity>
        </View>

        {plan?.authority ? (
          <View style={styles.groundedBadge}>
            <Text style={styles.groundedBadgeText}>Grounded · server-authoritative Career Context</Text>
          </View>
        ) : null}

        {openingMessage ? <Text style={styles.opening}>{openingMessage}</Text> : null}

        <View style={styles.stageBadge}>
          <Text style={styles.stageText}>Stage: {stage.replace(/_/g, ' ')}</Text>
        </View>

        {currentQuestion && (
          <>
            <View style={styles.questionCard}>
              <Text style={styles.questionKind}>{(currentQuestion.questionKind || 'root').replace(/_/g, ' ')}</Text>
              <Text style={styles.questionText}>{currentQuestion.question}</Text>
            </View>

            {coachFeedback && (coachFeedback.strength || coachFeedback.nextFocus) ? (
              <View style={styles.coachCard}>
                {coachFeedback.strength ? <Text style={styles.coachText}>Strength: {coachFeedback.strength}</Text> : null}
                {coachFeedback.nextFocus ? <Text style={styles.coachText}>Next focus: {coachFeedback.nextFocus}</Text> : null}
              </View>
            ) : null}

            <TextInput
              value={answerText}
              onChangeText={(value) => {
                setAnswerText(value);
                const pending = pendingTurnRef.current;
                if (pending && pending.payload.answerKind === 'answered' && pending.payload.answerText !== value.trim()) {
                  pendingTurnRef.current = null;
                  setHasPendingTurn(false);
                }
              }}
              placeholder="Type your answer here…"
              placeholderTextColor="#64748b"
              multiline
              style={styles.answerInput}
              editable={phase === 'asking'}
            />

            {(phase === 'submitting' || phase === 'reporting') ? (
              <View style={styles.loadingBlock}>
                <ActivityIndicator size="large" color="#d4af37" />
                <Text style={styles.muted}>{phase === 'reporting' ? 'Compiling authoritative report…' : 'Submitting governed turn…'}</Text>
              </View>
            ) : (
              <View style={styles.actionRow}>
                <TouchableOpacity style={[styles.primaryButton, styles.flexButton]} onPress={() => void prepareAndSubmitTurn('answered')}>
                  <Text style={styles.primaryButtonText}>Submit answer</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.secondaryButton, styles.flexButton]} onPress={() => void prepareAndSubmitTurn('skipped')}>
                  <Text style={styles.secondaryButtonText}>Skip question</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {phase === 'reporting' && !currentQuestion ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator size="large" color="#d4af37" />
            <Text style={styles.muted}>Compiling authoritative report…</Text>
          </View>
        ) : null}

        {errorText ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{errorText}</Text>
            {hasPendingTurn ? (
              <TouchableOpacity style={styles.secondaryButton} onPress={() => void retryPendingTurn()}>
                <Text style={styles.secondaryButtonText}>Retry same turn</Text>
              </TouchableOpacity>
            ) : sessionId && !currentQuestion ? (
              <TouchableOpacity style={styles.secondaryButton} onPress={() => void generateReport(sessionId)}>
                <Text style={styles.secondaryButtonText}>Retry report</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.secondaryButton} onPress={resetSession}>
                <Text style={styles.secondaryButtonText}>Start a new interview</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null}

        {plan?.meta.planSource ? <Text style={styles.footerText}>Plan source: {plan.meta.planSource.replace(/_/g, ' ')}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1329' },
  scrollContainer: { padding: 20, paddingBottom: 48 },
  title: { color: '#ffffff', fontSize: 25, fontWeight: '800' },
  subtitle: { color: '#94a3b8', fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 22 },
  card: { backgroundColor: '#1a233d', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', marginBottom: 16 },
  label: { color: '#94a3b8', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 7 },
  input: { backgroundColor: '#0b1329', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', color: '#ffffff', paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, marginBottom: 16 },
  textArea: { minHeight: 110, textAlignVertical: 'top' },
  policyCard: { backgroundColor: 'rgba(59,130,246,0.08)', borderRadius: 12, padding: 13, marginBottom: 4 },
  policyTitle: { color: '#ffffff', fontWeight: '700', fontSize: 13, marginBottom: 4 },
  muted: { color: '#94a3b8', fontSize: 12, lineHeight: 18 },
  primaryButton: { backgroundColor: '#d4af37', borderRadius: 12, paddingVertical: 15, paddingHorizontal: 16, alignItems: 'center', marginBottom: 14 },
  primaryButtonText: { color: '#0b1329', fontSize: 14, fontWeight: '800' },
  secondaryButton: { borderRadius: 12, borderWidth: 1, borderColor: 'rgba(212,175,55,0.35)', paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center' },
  secondaryButtonText: { color: '#d4af37', fontSize: 13, fontWeight: '800' },
  smallButton: { alignSelf: 'flex-start', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(212,175,55,0.30)', paddingVertical: 9, paddingHorizontal: 12, marginTop: 10 },
  smallButtonText: { color: '#d4af37', fontSize: 11, fontWeight: '800' },
  abandonButton: { alignSelf: 'flex-start', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(248,113,113,0.45)', paddingVertical: 9, paddingHorizontal: 12, marginTop: 10 },
  abandonButtonText: { color: '#f87171', fontSize: 11, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  optionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleButton: { minWidth: 54, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#0b1329', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  toggleButtonActive: { backgroundColor: 'rgba(212,175,55,0.12)', borderColor: '#d4af37' },
  toggleText: { color: '#94a3b8', fontSize: 11, fontWeight: '800' },
  toggleTextActive: { color: '#d4af37', fontSize: 11, fontWeight: '800' },
  contextStatus: { color: '#cbd5e1', fontSize: 12, lineHeight: 18, marginTop: 14, marginBottom: 12 },
  sourceRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  sourceChoice: { flex: 1, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', paddingVertical: 11 },
  sourceChoiceActive: { borderColor: '#d4af37', backgroundColor: 'rgba(212,175,55,0.10)' },
  sourceChoiceText: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
  sourceChoiceTextActive: { color: '#d4af37', fontSize: 12, fontWeight: '800' },
  contextItem: { flexDirection: 'row', gap: 10, backgroundColor: '#111c36', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  contextItemSelected: { borderColor: 'rgba(212,175,55,0.55)', backgroundColor: 'rgba(212,175,55,0.07)' },
  contextCheck: { color: '#d4af37', fontSize: 18, fontWeight: '800', minWidth: 20 },
  contextItemTitle: { color: '#ffffff', fontSize: 13, fontWeight: '800', marginBottom: 3 },
  contextItemValue: { color: '#cbd5e1', fontSize: 12, lineHeight: 18, marginBottom: 4 },
  contextItemMeta: { color: '#64748b', fontSize: 10 },
  consentBox: { flexDirection: 'row', gap: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', padding: 13, marginTop: 12 },
  consentBoxActive: { borderColor: '#d4af37', backgroundColor: 'rgba(212,175,55,0.07)' },
  consentText: { color: '#cbd5e1', fontSize: 12, lineHeight: 18, flex: 1 },
  warningCard: { backgroundColor: 'rgba(245,158,11,0.08)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', padding: 12, marginTop: 10, marginBottom: 14 },
  warningText: { color: '#fde68a', fontSize: 12, lineHeight: 18 },
  groundedBadge: { alignSelf: 'flex-start', backgroundColor: 'rgba(16,185,129,0.10)', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)' },
  groundedBadgeText: { color: '#6ee7b7', fontSize: 10, fontWeight: '800' },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  progress: { color: '#94a3b8', fontSize: 12, marginTop: 4 },
  exitText: { color: '#f87171', fontSize: 12, fontWeight: '800', paddingVertical: 8 },
  opening: { color: '#cbd5e1', fontSize: 13, lineHeight: 19, marginBottom: 12 },
  stageBadge: { alignSelf: 'flex-start', backgroundColor: 'rgba(212,175,55,0.09)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginBottom: 12 },
  stageText: { color: '#d4af37', fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
  questionCard: { backgroundColor: '#1a233d', borderRadius: 18, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', marginBottom: 14 },
  questionKind: { color: '#d4af37', fontSize: 10, textTransform: 'uppercase', fontWeight: '800', letterSpacing: 0.8, marginBottom: 8 },
  questionText: { color: '#ffffff', fontSize: 19, lineHeight: 28, fontWeight: '700' },
  coachCard: { backgroundColor: 'rgba(16,185,129,0.08)', borderRadius: 12, padding: 13, marginBottom: 14 },
  coachText: { color: '#d1fae5', fontSize: 12, lineHeight: 18, marginBottom: 3 },
  answerInput: { minHeight: 150, backgroundColor: '#111c36', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', color: '#ffffff', padding: 15, fontSize: 15, lineHeight: 22, textAlignVertical: 'top', marginBottom: 14 },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  flexButton: { flex: 1 },
  loadingBlock: { alignItems: 'center', gap: 10, paddingVertical: 20 },
  errorCard: { backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.20)', borderRadius: 12, padding: 13, gap: 10, marginBottom: 14 },
  errorText: { color: '#fecaca', fontSize: 13, lineHeight: 19 },
  readiness: { color: '#d4af37', fontSize: 13, fontWeight: '800', textTransform: 'uppercase', marginBottom: 10 },
  reportSummary: { color: '#ffffff', fontSize: 18, lineHeight: 27, fontWeight: '700', marginBottom: 12 },
  footerText: { color: '#64748b', fontSize: 10, textAlign: 'center', marginTop: 10 },
});