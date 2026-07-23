import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  InterviewSessionContext,
  FinalReport,
  QuestionBlueprint,
  AdaptiveAnswerSubmissionResponse,
  ChallengeEvent,
  InterviewStage,
  QuestionKind,
} from 'mockmate-shared';
import * as mockGeminiService from '../services/mockGeminiService';
import PushToTalkInput from './PushToTalkInput';
import CodeEditor from './CodeEditor';
import { PERSONAS_CONFIG } from '../personas.config';
import { audioService } from '../services/audioService';
import { trackQuestionUsage } from '../services/storageService';

interface MockSessionProps {
  sessionContext: InterviewSessionContext;
  onReportGenerated: (report: FinalReport) => void;
  onCancel: () => void;
}

type SessionPhase =
  | 'loading_question'
  | 'asking'
  | 'reviewing'
  | 'feedback_shown'
  | 'confirm_exit'
  | 'confirm_skip'
  | 'generating_report';

const MockSession: React.FC<MockSessionProps> = ({ sessionContext, onReportGenerated, onCancel }) => {
  const [sessionPhase, setSessionPhase] = useState<SessionPhase>('loading_question');
  const [sessionId, setSessionId] = useState<string>('');
  const [openingMessage, setOpeningMessage] = useState<string>('');
  const [currentQuestion, setCurrentQuestion] = useState<QuestionBlueprint | null>(null);
  const [rootQuestionIndex, setRootQuestionIndex] = useState<number>(0);
  const [rootQuestionCount, setRootQuestionCount] = useState<number>(sessionContext.controls?.totalQuestions || 5);
  const [turnIndex, setTurnIndex] = useState<number>(0);
  const [maxTurns, setMaxTurns] = useState<number>(8);
  const [sessionVersion, setSessionVersion] = useState<number>(1);
  const [currentStage, setCurrentStage] = useState<InterviewStage>('framing');
  const [currentPersonaId, setCurrentPersonaId] = useState<string>('p1');
  const [activeChallengeEvent, setActiveChallengeEvent] = useState<ChallengeEvent | null>(null);
  const [coachFeedback, setCoachFeedback] = useState<{ strength?: string; nextFocus?: string } | undefined>(undefined);

  const [lastTranscript, setLastTranscript] = useState<string>('');
  const [codeValue, setCodeValue] = useState<string>('');
  const [codeFeedback, setCodeFeedback] = useState<string | null>(null);
  const [isAnalyzingCode, setIsAnalyzingCode] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [isHintLoading, setIsHintLoading] = useState(false);
  const [idealAnswer, setIdealAnswer] = useState<string | null>(null);
  const [isGeneratingIdeal, setIsGeneratingIdeal] = useState(false);
  const [reportError, setReportError] = useState('');
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string>('');
  const [lastSubmissionResult, setLastSubmissionResult] = useState<AdaptiveAnswerSubmissionResponse | null>(null);

  const deliveryMode = sessionContext.controls?.deliveryMode || 'exam';
  const isCoachMode = deliveryMode === 'coach';
  const reasoningMode = sessionContext.controls?.reasoningMode || 'classic_behavioral';

  useEffect(() => {
    const startSession = async () => {
      setSessionPhase('loading_question');
      try {
        const data = await mockGeminiService.startInterviewSession(sessionContext);
        setSessionId(data.sessionId);
        setOpeningMessage(data.openingMessage);
        setCurrentQuestion(data.firstQuestion);
        setRootQuestionIndex(data.questionIndex);
        setRootQuestionCount(data.totalQuestions);
        setTurnIndex(0);
        setSessionVersion(1);
        setCurrentStage((data.firstQuestion.stage as InterviewStage) || 'framing');

        const personaId = data.firstQuestion.personaFocus || sessionContext.selectedPanelIDs?.[0] || 'p1';
        setCurrentPersonaId(personaId);

        trackQuestionUsage(data.firstQuestion.question, sessionContext.candidateRole);
        audioService.playNotify();
        setSessionPhase('asking');
      } catch (err) {
        console.error('Server authoritative adaptive session start failed:', err);
        onCancel();
      }
    };
    startSession();
  }, [sessionContext]);

  const handleAnswerSubmit = async (transcript: string) => {
    if (!transcript || transcript.trim() === '') {
      setLastTranscript('');
      setTranscriptionError('Transcription unavailable. Retry recording or type your answer.');
      return;
    }
    setTranscriptionError(null);
    audioService.playConfirm();
    setHint(null);
    setLastTranscript(transcript);
    setSessionPhase('reviewing');
  };

  const handleCodeSubmit = async (code: string) => {
    if (!currentQuestion) return;
    setIsAnalyzingCode(true);
    audioService.playStart();
    try {
      const result = await mockGeminiService.analyzeCode(currentQuestion, code);
      setCodeFeedback(result.feedback);
      setLastTranscript(code);
      setSessionPhase('reviewing');
    } catch (e) {
      setLastTranscript(code);
      setSessionPhase('reviewing');
    } finally {
      setIsAnalyzingCode(false);
    }
  };

  const handleAnswerSuccess = (res: AdaptiveAnswerSubmissionResponse) => {
    setLastSubmissionResult(res);
    setSubmissionError('');
    setSessionVersion(res.sessionVersion);
    setTurnIndex(res.turnIndex);
    setMaxTurns(res.maxTurns);
    setRootQuestionIndex(res.rootQuestionIndex);
    setRootQuestionCount(res.rootQuestionCount);
    setCurrentStage(res.stage);
    setActiveChallengeEvent(res.challengeEvent || null);
    setCoachFeedback(res.coachFeedback);

    if (isCoachMode) {
      setSessionPhase('feedback_shown');
      setIsGeneratingIdeal(true);
      mockGeminiService
        .generateIdealAnswer(currentQuestion!.question, currentQuestion!.expectedSignals, lastTranscript)
        .then(sample => setIdealAnswer(sample || 'Sample response unavailable.'))
        .catch(() => setIdealAnswer('Sample response unavailable.'))
        .finally(() => setIsGeneratingIdeal(false));
    } else {
      if (res.isSessionComplete || !res.nextQuestion) {
        generateReport();
      } else {
        setCurrentQuestion(res.nextQuestion);
        setSessionPhase('loading_question');
        setLastTranscript('');
        setCodeValue('');
        setCodeFeedback(null);
        setHint(null);
        setSessionPhase('asking');
      }
    }
  };

  const handleConfirmTranscript = async () => {
    if (!currentQuestion || !sessionId) return;
    audioService.playConfirm();
    setSubmissionError('');
    const clientSubmissionId = crypto.randomUUID();

    try {
      const res = await mockGeminiService.submitAdaptiveTurn(
        sessionId,
        currentQuestion.id,
        sessionVersion,
        clientSubmissionId,
        'answered',
        lastTranscript
      );
      handleAnswerSuccess(res);
    } catch (err: any) {
      console.error('Adaptive turn submission error:', err);
      setSubmissionError(err.message || 'Failed to submit answer. Please retry.');
      setSessionPhase('asking');
    }
  };

  const handleConfirmSkip = async () => {
    if (!currentQuestion || !sessionId) return;
    setSubmissionError('');
    const clientSubmissionId = crypto.randomUUID();

    try {
      const res = await mockGeminiService.submitAdaptiveTurn(
        sessionId,
        currentQuestion.id,
        sessionVersion,
        clientSubmissionId,
        'skipped'
      );
      handleAnswerSuccess(res);
    } catch (err: any) {
      console.error('Skip turn submission failed:', err);
      setSubmissionError(err.message || 'Could not skip turn.');
    }
  };

  const handleProceedAfterFeedback = async () => {
    setIdealAnswer(null);
    if (lastSubmissionResult?.isSessionComplete || !lastSubmissionResult?.nextQuestion) {
      await generateReport();
    } else {
      setCurrentQuestion(lastSubmissionResult.nextQuestion);
      setSessionPhase('loading_question');
      setLastTranscript('');
      setCodeValue('');
      setCodeFeedback(null);
      setHint(null);
      setSessionPhase('asking');
    }
  };

  const handleRequestHint = async () => {
    if (!currentQuestion || isHintLoading) return;
    setIsHintLoading(true);
    audioService.playConfirm();
    try {
      const nudge = await mockGeminiService.getHintForQuestion(currentQuestion.question, currentQuestion.expectedSignals);
      setHint(nudge || 'Hint unavailable.');
    } catch (e) {
      setHint('Hint unavailable.');
    } finally {
      setIsHintLoading(false);
    }
  };

  const generateReport = async () => {
    setSessionPhase('generating_report');
    setReportError('');
    try {
      const report = await mockGeminiService.generateFinalReport(sessionId);
      onReportGenerated(report);
    } catch (error) {
      setReportError('Report generation failed. Please try again, or exit without results.');
      setSessionPhase('confirm_exit');
    }
  };

  const currentPersona = PERSONAS_CONFIG.find(p => p.id === currentPersonaId) || PERSONAS_CONFIG[0];
  const isCodingQuestion = currentQuestion?.phase === 'coding';
  const PersonaIcon = currentPersona.icon;
  const questionKind: QuestionKind = currentQuestion?.questionKind || 'root';

  return (
    <div className="fixed inset-0 flex h-dvh flex-col overflow-hidden bg-brand-dark font-sans">
      {/* Top Progress Bar */}
      <div className="absolute top-0 left-0 w-full h-[2px] bg-white/5 z-50">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, ((turnIndex + 1) / maxTurns) * 100)}%` }}
          className="h-full bg-brand-primary shadow-[0_0_12px_rgba(255,188,3,0.6)] transition-all duration-1000"
        />
      </div>

      <header className="z-30 flex w-full shrink-0 items-center justify-between border-b border-white/[0.06] bg-brand-dark/80 px-3 py-3 backdrop-blur-xl sm:px-5 md:px-10 md:py-4">
        <div className="flex min-w-0 items-center gap-2 md:gap-4">
          <div className={`w-2 h-2 rounded-full ${sessionPhase === 'asking' ? 'bg-brand-primary animate-pulse shadow-[0_0_10px_rgba(255,188,3,0.8)]' : 'bg-white/10'}`} />
          <div className="flex flex-col">
            <span className="truncate text-[9px] font-black uppercase tracking-[0.12em] text-white/50 sm:text-[10px] sm:tracking-[0.2em]">
              Reasoning Mode: <span className="text-brand-primary font-bold">{reasoningMode.replace(/_/g, ' ')}</span>
            </span>
            <span className="text-[9px] text-white/40 font-semibold tracking-wider capitalize">Stage: {currentStage}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-6">
          <div className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 md:gap-2.5 md:px-3">
            <span className="text-[9px] font-bold uppercase tracking-widest text-brand-primary opacity-60">Scenario</span>
            <span className="text-xs font-bold text-white tracking-widest">{rootQuestionIndex + 1} / {rootQuestionCount}</span>
            <span className="text-[9px] text-white/30">|</span>
            <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">Turn {turnIndex + 1} of {maxTurns}</span>
          </div>
          <button
            onClick={() => {
              setReportError('');
              setSessionPhase('confirm_exit');
            }}
            className="text-[10px] font-bold text-white/50 hover:text-white transition-colors uppercase tracking-widest py-1.5"
          >
            Exit
          </button>
        </div>
      </header>

      <main className="relative flex min-h-0 flex-grow overflow-hidden">
        <AnimatePresence mode="wait">
          {(sessionPhase === 'loading_question' || sessionPhase === 'generating_report') && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex flex-col items-center justify-center bg-brand-dark z-40 px-6">
              <div className="w-12 h-12 rounded-full border-[3px] border-brand-primary/10 border-t-brand-primary animate-spin mb-6"></div>
              <p className="text-[10px] font-bold text-brand-primary uppercase tracking-[0.12em] animate-pulse">
                {sessionPhase === 'generating_report' ? 'Analyzing evidence and compiling report…' : 'Adapting next scenario step…'}
              </p>
            </motion.div>
          )}

          {sessionPhase === 'confirm_exit' && (
            <motion.div key="exit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 flex items-center justify-center bg-brand-dark/95 backdrop-blur-xl z-50 p-5">
              <div className="max-w-sm w-full p-8 text-center space-y-6 bg-brand-dark border border-white/[0.1] rounded-3xl shadow-2xl">
                <h3 className="text-xl md:text-2xl font-medium text-white tracking-tight">End session early?</h3>
                <p className="text-xs text-brand-tint leading-relaxed">
                  {turnIndex > 0 ? "You can still generate a scorecard report from completed turns." : "No turns completed yet."}
                </p>
                {reportError && (
                  <div className="rounded-2xl border border-brand-primary/20 bg-brand-primary/10 px-4 py-3 text-left text-xs font-medium leading-relaxed text-brand-primary">
                    {reportError}
                  </div>
                )}
                <div className="flex flex-col gap-3">
                  {turnIndex > 0 && (
                    <button onClick={generateReport} className="bg-brand-primary text-brand-dark font-bold py-4 rounded-xl text-[10px] uppercase tracking-widest shadow-lg shadow-brand-primary/10">Get partial scorecard</button>
                  )}
                  <button onClick={onCancel} className="bg-white/5 text-white/40 font-bold py-4 rounded-xl border border-white/10 text-[10px] uppercase tracking-widest hover:bg-white/10">Exit completely</button>
                  <button onClick={() => setSessionPhase('asking')} className="text-[10px] font-bold text-brand-primary uppercase py-2 tracking-[0.12em]">Resume practice</button>
                </div>
              </div>
            </motion.div>
          )}

          {sessionPhase === 'confirm_skip' && (
            <motion.div key="skip" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 flex items-center justify-center bg-brand-dark/95 backdrop-blur-xl z-50 p-5">
              <div className="max-w-sm w-full p-8 text-center space-y-6 bg-brand-dark border border-white/[0.1] rounded-3xl shadow-2xl">
                <h3 className="text-xl md:text-2xl font-medium text-white tracking-tight">Skip this turn?</h3>
                <p className="text-xs text-brand-tint leading-relaxed">Skipping will advance the scenario without scoring this turn.</p>
                {submissionError && (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-400">
                    {submissionError}
                  </div>
                )}
                <div className="flex flex-col gap-3">
                  <button onClick={handleConfirmSkip} className="bg-brand-primary text-brand-dark font-bold py-4 rounded-xl text-[10px] uppercase tracking-widest">Yes, skip turn</button>
                  <button onClick={() => setSessionPhase('asking')} className="bg-white/5 text-white font-bold py-4 rounded-xl border border-white/10 text-[10px] uppercase tracking-widest">Cancel</button>
                </div>
              </div>
            </motion.div>
          )}

          {sessionPhase === 'reviewing' && (
            <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-50 flex items-center justify-center bg-brand-dark/95 p-4 backdrop-blur-xl sm:p-5">
              <div className="flex h-full w-full max-w-2xl flex-col justify-center text-center md:h-auto">
                <span className="mb-4 text-[9px] font-bold uppercase tracking-[0.12em] text-brand-primary md:mb-6">Review turn response</span>
                <div className="custom-scrollbar mb-6 max-h-[56dvh] overflow-y-auto rounded-2xl border border-white/[0.08] bg-black/20 p-4 shadow-inner sm:p-6 md:mb-8 md:p-10">
                  {isCodingQuestion ? (
                    <pre className="text-left text-brand-primary font-mono text-xs md:text-sm whitespace-pre-wrap leading-relaxed">{lastTranscript}</pre>
                  ) : (
                    <textarea
                      value={lastTranscript}
                      onChange={(e) => setLastTranscript(e.target.value)}
                      className="w-full bg-transparent text-white font-medium text-lg md:text-2xl leading-relaxed focus:outline-none resize-none text-center custom-scrollbar"
                      rows={6}
                    />
                  )}
                </div>
                <div className="flex flex-col justify-center gap-3 px-0 sm:flex-row sm:px-4">
                  <button onClick={handleConfirmTranscript} className="w-full sm:w-auto bg-brand-primary text-brand-dark font-bold py-4 px-10 rounded-xl text-[10px] uppercase tracking-widest shadow-xl shadow-brand-primary/10 order-1 sm:order-2">Submit Turn Answer</button>
                  <button onClick={() => setSessionPhase('asking')} className="w-full sm:w-auto bg-white/5 text-white px-10 py-4 rounded-xl border border-white/10 text-[10px] uppercase tracking-widest order-2 sm:order-1">Re-record</button>
                </div>
              </div>
            </motion.div>
          )}

          {sessionPhase === 'feedback_shown' && (
            <motion.div key="feedback" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-50 flex items-start justify-center overflow-y-auto bg-brand-dark/98 p-4 backdrop-blur-2xl sm:p-5 md:items-center">
              <div className="w-full max-w-2xl space-y-5 py-6 md:space-y-6 md:py-10">
                <div className="text-center space-y-2">
                  <span className="text-[9px] font-bold text-brand-primary uppercase tracking-[0.14em] opacity-90">Coach Guidance & Sample Path</span>
                  <h3 className="text-2xl font-medium tracking-tight text-white md:text-4xl">Turn Reflection</h3>
                </div>

                {coachFeedback && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {coachFeedback.strength && (
                      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5 text-left">
                        <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest block mb-1">Signal Observed</span>
                        <p className="text-xs text-white/90 font-medium">{coachFeedback.strength}</p>
                      </div>
                    )}
                    {coachFeedback.nextFocus && (
                      <div className="bg-brand-primary/10 border border-brand-primary/20 rounded-2xl p-5 text-left">
                        <span className="text-[9px] font-bold text-brand-primary uppercase tracking-widest block mb-1">Next Focus</span>
                        <p className="text-xs text-white/90 font-medium">{coachFeedback.nextFocus}</p>
                      </div>
                    )}
                  </div>
                )}

                <div className="bg-brand-primary/[0.03] border border-brand-primary/10 rounded-2xl p-6 md:p-8 text-left relative overflow-hidden shadow-2xl">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-7 h-7 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary text-xs font-bold">✦</div>
                    <span className="text-[10px] font-bold text-brand-primary uppercase tracking-[0.12em]">One Defensible Reasoning Path</span>
                  </div>

                  {isGeneratingIdeal ? (
                    <div className="flex flex-col items-center gap-3 py-4">
                      <div className="w-5 h-5 rounded-full border-2 border-brand-primary/10 border-t-brand-primary animate-spin" />
                      <p className="text-[10px] text-brand-primary/70 font-bold tracking-[0.12em] uppercase">Generating reasoning path...</p>
                    </div>
                  ) : (
                    <p className="text-sm md:text-lg text-white font-normal leading-relaxed">
                      "{idealAnswer || 'Sample response unavailable.'}"
                    </p>
                  )}
                </div>

                <div className="flex justify-center pt-2">
                  <button
                    onClick={handleProceedAfterFeedback}
                    disabled={isGeneratingIdeal}
                    className="w-full sm:w-auto bg-brand-primary hover:bg-brand-primary/90 disabled:bg-white/5 text-brand-dark disabled:text-brand-tint font-bold py-4 px-16 rounded-xl text-[10px] uppercase tracking-[0.12em] shadow-xl shadow-brand-primary/10 transition-all active:scale-95"
                  >
                    Continue practice
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {sessionPhase === 'asking' && (
            <motion.div key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex w-full flex-grow overflow-hidden">
              {isCodingQuestion ? (
                <div className="flex-grow grid grid-cols-1 lg:grid-cols-12 w-full h-full overflow-hidden">
                  <div className="col-span-12 lg:col-span-4 h-auto lg:h-full bg-black/20 border-b lg:border-r border-white/5 flex flex-col relative z-20 shrink-0">
                    <div className="overflow-y-auto lg:flex-grow custom-scrollbar p-6 md:p-8 space-y-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full flex items-center justify-center bg-brand-primary/5 border border-brand-primary/30 shrink-0">
                          {PersonaIcon && <PersonaIcon className="w-6 h-6 text-brand-primary" />}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-white tracking-widest uppercase">{currentPersona.name}</span>
                          <p className="text-[9px] text-brand-primary font-bold tracking-widest uppercase opacity-40 mt-1">{currentPersona.title}</p>
                        </div>
                      </div>

                      {/* Question Kind Badge */}
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-brand-primary/30 bg-brand-primary/10">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-brand-primary">
                          {questionKind === 'probe' ? 'Follow-up Probe' : questionKind === 'challenge' ? 'Constraint Challenge' : questionKind === 'reflection' ? 'Reflection' : 'Core Scenario'}
                        </span>
                      </div>

                      <div className="space-y-4">
                        <h3 className="font-medium text-white tracking-tight leading-snug text-lg md:text-xl">
                          {currentQuestion?.question || 'Preparing challenge…'}
                        </h3>
                      </div>

                      {hint && (
                        <div className="bg-brand-primary/5 border-l-2 border-brand-primary/60 p-4 rounded-r-xl">
                          <p className="text-[11px] text-brand-tint leading-relaxed italic opacity-80">"{hint}"</p>
                        </div>
                      )}
                    </div>

                    <div className="p-6 border-t border-white/5 bg-black/20">
                      <div className="flex items-center gap-3">
                        <button onClick={handleRequestHint} disabled={isHintLoading} className="flex-1 bg-brand-primary/5 hover:bg-brand-primary/10 text-brand-primary border border-brand-primary/20 font-bold py-3 rounded-lg text-[9px] uppercase tracking-widest transition-all">
                          Hint
                        </button>
                        <button onClick={() => setSessionPhase('confirm_skip')} className="flex-1 bg-white/5 hover:bg-white/10 text-brand-tint border border-white/[0.08] font-bold py-3 rounded-lg text-[9px] uppercase tracking-[0.12em] transition-all">
                          Skip
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="col-span-12 lg:col-span-8 h-full bg-ink overflow-hidden relative group">
                    <CodeEditor
                      value={codeValue}
                      onChange={setCodeValue}
                      onSubmit={handleCodeSubmit}
                      isProcessing={isAnalyzingCode}
                      feedback={codeFeedback}
                      language={currentQuestion?.language}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex w-full flex-grow flex-col items-center justify-start overflow-y-auto bg-ink/30 p-4 pt-6 sm:p-6 md:justify-center md:p-12">
                  <div className="flex w-full max-w-2xl flex-col items-center space-y-6 text-center md:space-y-8">
                    <div className="flex flex-col items-center space-y-3 md:space-y-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-brand-primary/30 bg-brand-primary/5 shadow-[0_0_40px_rgba(255,188,3,0.1)] md:h-18 md:w-18">
                        {PersonaIcon && <PersonaIcon className="h-7 w-7 text-brand-primary md:h-9 md:w-9" />}
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs md:text-sm font-bold text-white tracking-[0.2em] uppercase">{currentPersona.name}</span>
                        <p className="text-[9px] md:text-[10px] text-brand-primary font-bold tracking-[0.2em] uppercase opacity-40">{currentPersona.title}</p>
                      </div>
                    </div>

                    {/* Challenge Banner if active challenge or questionKind = challenge */}
                    {(activeChallengeEvent || questionKind === 'challenge') && (
                      <div className="w-full max-w-xl rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-3.5 text-left shadow-xl shadow-amber-500/5">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs">⚡</span>
                          <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-400">
                            Challenge Event: {activeChallengeEvent?.type?.replace(/_/g, ' ') || 'Interviewer Pushback'}
                          </span>
                        </div>
                        <p className="text-xs text-amber-200/90 leading-relaxed font-normal">
                          {activeChallengeEvent?.rationale || 'Respond to interviewer constraint change or pushback.'}
                        </p>
                      </div>
                    )}

                    {/* Question Kind Tag */}
                    <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full border border-brand-primary/30 bg-brand-primary/10">
                      <span className="text-[9px] font-extrabold uppercase tracking-widest text-brand-primary">
                        {questionKind === 'probe' ? 'Follow-up Probe' : questionKind === 'challenge' ? 'Challenge Question' : questionKind === 'reflection' ? 'Reflection' : 'Core Scenario'}
                      </span>
                    </div>

                    <h3 className="px-0 text-xl font-medium leading-tight tracking-tight text-white sm:px-4 md:text-3xl lg:text-4xl">
                      {currentQuestion?.question ? `"${currentQuestion.question}"` : openingMessage || 'Next scenario coming up…'}
                    </h3>

                    {transcriptionError && (
                      <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-400">
                        {transcriptionError}
                      </div>
                    )}

                    {hint && (
                      <div className="bg-brand-primary/5 border-l-2 border-brand-primary/60 p-5 rounded-r-2xl text-left max-w-lg self-center shadow-xl">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-pulse" />
                          <span className="text-[9px] font-bold text-brand-primary uppercase tracking-widest">Hint</span>
                        </div>
                        <p className="text-xs md:text-sm text-brand-tint leading-relaxed italic opacity-80">"{hint}"</p>
                      </div>
                    )}

                    <div className="flex w-full flex-col items-center gap-6 pt-2 md:gap-8 md:pt-4">
                      <PushToTalkInput onTranscriptSubmit={handleAnswerSubmit} disabled={false} />
                      <div className="flex gap-4 items-center">
                        <button onClick={handleRequestHint} disabled={isHintLoading} className="font-bold text-[9px] text-brand-primary hover:text-white transition-all uppercase tracking-widest px-6 py-2.5 border border-brand-primary/20 rounded-xl bg-brand-primary/5">
                          {isHintLoading ? '…' : 'Hint'}
                        </button>
                        <button onClick={() => setSessionPhase('confirm_skip')} className="font-bold text-[9px] text-brand-tint hover:text-white transition-all uppercase tracking-[0.12em] px-6 py-2.5 border border-white/[0.06] rounded-xl bg-white/[0.02]">
                          Skip
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default MockSession;
