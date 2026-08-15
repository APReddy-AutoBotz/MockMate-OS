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
import {
  AdaptiveAnswerSubmissionRequestSchema,
  AdaptiveAnswerSubmissionResponseSchema,
  FinalReportSchema,
  InterviewPlanSchema,
  InterviewSessionStartRequestSchema,
  InterviewSessionStartResponseSchema,
  PlanGenerationRequestSchema,
  SessionControlsSchema,
  type AdaptiveAnswerSubmissionRequest,
  type AdaptiveAnswerSubmissionResponse,
  type FinalReport,
  type InterviewPlan,
  type QuestionBlueprint,
  type SessionControls,
} from 'mockmate-shared';
import { apiClient, ApiError } from '../../services/apiClient';

type Phase = 'setup' | 'starting' | 'asking' | 'submitting' | 'reporting' | 'complete';

type PendingTurn = {
  sessionId: string;
  payload: AdaptiveAnswerSubmissionRequest;
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

function createUuidV4(): string {
  const randomUuid = (globalThis as any)?.crypto?.randomUUID;
  if (typeof randomUuid === 'function') return randomUuid.call((globalThis as any).crypto);
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
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
  const pendingTurnRef = useRef<PendingTurn | null>(null);
  const sessionEpochRef = useRef(0);

  const progressLabel = useMemo(() => {
    if (!rootQuestionCount) return 'Preparing session';
    const scenario = Math.min(rootQuestionIndex + 1, rootQuestionCount);
    return `Scenario ${scenario} of ${rootQuestionCount}${maxTurns ? ` · Turn ${turnIndex + 1} of ${maxTurns}` : ''}`;
  }, [maxTurns, rootQuestionCount, rootQuestionIndex, turnIndex]);

  useEffect(() => () => {
    // Invalidate any in-flight plan/turn/report response after native route exit.
    sessionEpochRef.current += 1;
  }, []);

  const resetSession = () => {
    // A request already in flight may still complete. Advancing the epoch makes
    // that response stale so it cannot resurrect or overwrite a reset/new session.
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

  const startInterview = async () => {
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
      const planRequest = PlanGenerationRequestSchema.parse({
        role: trimmedRole,
        intent: trimmedIntent,
        controls: MOBILE_CONTROLS,
        selectedPanelIDs: MOBILE_PANEL_IDS,
      });
      const generatedPlan = await apiClient.post('/interview/plan', InterviewPlanSchema, planRequest);
      if (requestEpoch !== sessionEpochRef.current) return;

      const sessionRequest = InterviewSessionStartRequestSchema.parse({
        context: {
          candidateRole: trimmedRole,
          intentText: trimmedIntent,
          selectedPanelIDs: MOBILE_PANEL_IDS,
          controls: generatedPlan.meta.controls,
          interviewPlan: generatedPlan,
          sessionType: 'structured',
          jdInsights: generatedPlan.jdInsights,
        },
      });
      const started = await apiClient.post(
        '/interview/sessions',
        InterviewSessionStartResponseSchema,
        sessionRequest,
      );
      if (requestEpoch !== sessionEpochRef.current) return;

      setPlan(generatedPlan);
      setSessionId(started.sessionId);
      // Backend createSession initializes adaptive v2 sessions at version 1.
      // Every subsequent value comes only from AdaptiveAnswerSubmissionResponseSchema.
      setSessionVersion(INITIAL_ADAPTIVE_SESSION_VERSION);
      setCurrentQuestion(started.firstQuestion);
      setOpeningMessage(started.openingMessage);
      setRootQuestionIndex(started.questionIndex);
      setRootQuestionCount(started.totalQuestions);
      setTurnIndex(0);
      // maxTurns is not part of the start response. Do not guess it client-side;
      // display it only after the first authoritative adaptive response supplies it.
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
      // Clear the last question before report generation. If report generation
      // fails, the UI must offer report retry rather than allowing a stale turn
      // to be resubmitted against a completed authoritative session.
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

  if (phase === 'setup' || phase === 'starting') {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Interview Practice</Text>
          <Text style={styles.subtitle}>
            Native Interview uses the same server-authoritative adaptive engine as MockMate on the web. Questions, evaluation, progression and reports come from the backend; mobile does not invent fallbacks.
          </Text>

          <View style={styles.card}>
            <Text style={styles.label}>Target role</Text>
            <TextInput
              value={role}
              onChangeText={setRole}
              placeholder="e.g. Product Manager"
              placeholderTextColor="#64748b"
              style={styles.input}
              editable={phase !== 'starting'}
            />
            <Text style={styles.label}>Practice goal</Text>
            <TextInput
              value={intent}
              onChangeText={setIntent}
              placeholder="What do you want this interview to focus on?"
              placeholderTextColor="#64748b"
              multiline
              style={[styles.input, styles.textArea]}
              editable={phase !== 'starting'}
            />
            <View style={styles.policyCard}>
              <Text style={styles.policyTitle}>Mobile V1 session profile</Text>
              <Text style={styles.muted}>3 core scenarios · coach mode · intermediate · typed answers · no coding · ungrounded unless a governed bridge is explicitly added later.</Text>
            </View>
            <TouchableOpacity
              style={[styles.primaryButton, phase === 'starting' && styles.disabled]}
              disabled={phase === 'starting'}
              onPress={() => void startInterview()}
            >
              {phase === 'starting' ? <ActivityIndicator color="#0b1329" /> : <Text style={styles.primaryButtonText}>Generate & start interview</Text>}
            </TouchableOpacity>
          </View>

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
  policyCard: { backgroundColor: 'rgba(59,130,246,0.08)', borderRadius: 12, padding: 13, marginBottom: 16 },
  policyTitle: { color: '#ffffff', fontWeight: '700', fontSize: 13, marginBottom: 4 },
  muted: { color: '#94a3b8', fontSize: 12, lineHeight: 18 },
  primaryButton: { backgroundColor: '#d4af37', borderRadius: 12, paddingVertical: 15, paddingHorizontal: 16, alignItems: 'center' },
  primaryButtonText: { color: '#0b1329', fontSize: 14, fontWeight: '800' },
  secondaryButton: { borderRadius: 12, borderWidth: 1, borderColor: 'rgba(212,175,55,0.35)', paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center' },
  secondaryButtonText: { color: '#d4af37', fontSize: 13, fontWeight: '800' },
  disabled: { opacity: 0.5 },
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