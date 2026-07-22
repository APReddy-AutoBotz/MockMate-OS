import React, { useEffect, useState } from 'react';
import { InterviewSessionContext, InterviewPlan, SessionControls } from 'mockmate-shared';
import * as mockGeminiService from '../services/mockGeminiService';
import PanelSelector from './PanelSelector';
import SessionBuilder from './SessionBuilder';
import SessionControlsEditor from './SessionControlsEditor';
import { UploadIcon } from './icons/UploadIcon';
import { audioService } from '../services/audioService';

interface SessionPrepProps {
  onContextReady: (context: InterviewSessionContext) => void;
  context: InterviewSessionContext;
  onGoBack: () => void;
}

const defaultControls: SessionControls = {
  difficulty: 'intermediate',
  totalQuestions: 5,
  includeBehavioral: true,
  includeCoding: false,
  timePerQuestion: '90s',
  deliveryMode: 'exam',
  reasoningMode: 'classic_behavioral',
  sourceMode: 'job_description',
};

const DEFAULT_PANEL_IDS = ['p1', 'p2', 'p3'];
const CALIBRATION_TIMEOUT_MS = 12000;

const withSetupTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> => {
  let timeoutId: number | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }
};

const buildFallbackInterviewPlan = (
  intentText: string,
  controls: SessionControls,
  panelIDs: string[],
  candidateRole: string,
): InterviewPlan => {
  const safePanelIDs = panelIDs.length ? panelIDs : DEFAULT_PANEL_IDS;
  return {
    meta: {
      intent: intentText,
      controls: controls,
    },
    jdInsights: {
      role: candidateRole || 'Candidate',
      level: 'Senior',
      mustHaveSkills: ['Problem Solving', 'Communication'],
      niceToHave: [],
      domains: ['Software'],
      tools: ['Git'],
      softSkills: ['Teamwork'],
      competencyWeights: { PROBLEM_FRAMING: 0.5, TRADEOFF_CLARITY: 0.5 }
    },
    questionSet: [
      {
        id: `q_fallback_1`,
        phase: 'scenario',
        difficulty: controls.difficulty,
        question: 'Tell me about a complex project you led and the key technical trade-offs you navigated.',
        expectedSignals: ['Architecture choice', 'Tradeoff reasoning'],
        personaFocus: safePanelIDs[0] || 'p1',
      },
      {
        id: `q_fallback_2`,
        phase: 'behavioral',
        difficulty: controls.difficulty,
        question: 'Describe a situation where you had a disagreement with a team member. How did you handle it?',
        expectedSignals: ['Conflict resolution', 'Empathy'],
        personaFocus: safePanelIDs[1] || 'p2',
      }
    ],
  };
};

const SessionPrep: React.FC<SessionPrepProps> = ({ onContextReady, context, onGoBack }) => {
  const [currentContext, setCurrentContext] = useState<InterviewSessionContext>(context);
  const [selectedPanelIDs, setSelectedPanelIDs] = useState<string[]>(context.selectedPanelIDs || DEFAULT_PANEL_IDS);
  const [sessionControls, setSessionControls] = useState<SessionControls>(context.controls || defaultControls);
  const [jdText, setJdText] = useState<string>('');
  const [plan, setPlan] = useState<InterviewPlan | null>(context.interviewPlan || null);
  const [isPlanReady, setIsPlanReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [matchReasons, setMatchReasons] = useState<Record<string, string>>({});

  useEffect(() => {
    let isActive = true;

    const init = async () => {
      setIsLoading(true);

      try {
        const res = await withSetupTimeout(
          mockGeminiService.calibrateIntent(context.intentText),
          CALIBRATION_TIMEOUT_MS,
          'Interview setup took too long'
        );

        if (!isActive) return;

        const panelIDs = res.recommendedPanelIDs?.length ? res.recommendedPanelIDs : DEFAULT_PANEL_IDS;
        setSelectedPanelIDs(panelIDs);
        setMatchReasons(res.matchReasons || {});
        setCurrentContext(prev => ({
          ...prev,
          candidateRole: res.recommendedRole || prev.candidateRole || context.intentText,
          selectedPanelIDs: panelIDs,
        }));
      } catch (error) {
        if (!isActive) return;

        setSelectedPanelIDs(DEFAULT_PANEL_IDS);
        setMatchReasons({});
        setCurrentContext(prev => ({
          ...prev,
          candidateRole: prev.candidateRole || context.intentText,
          selectedPanelIDs: DEFAULT_PANEL_IDS,
        }));
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    init();

    return () => {
      isActive = false;
    };
  }, [context.intentText]);

  const handleGeneratePlan = async () => {
    setIsLoading(true);
    audioService.playStart();
    try {
      const interviewPlan = await mockGeminiService.generateInterviewPlan(
        currentContext.candidateRole || context.intentText,
        context.intentText,
        sessionControls,
        jdText || undefined
      );
      setPlan(interviewPlan);
      setIsPlanReady(true);
    } catch (err) {
      const fallbackPlan = buildFallbackInterviewPlan(
        context.intentText,
        sessionControls,
        selectedPanelIDs,
        currentContext.candidateRole,
      );
      setPlan(fallbackPlan);
      setIsPlanReady(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartSession = () => {
    if (!plan) return;
    audioService.playConfirm();
    onContextReady({
      ...currentContext,
      selectedPanelIDs,
      interviewPlan: plan,
      competencyWeights: Object.entries(plan.jdInsights?.competencyWeights || {}),
      jdInsights: plan.jdInsights,
    });
  };

  if (isPlanReady && plan) {
    return (
      <SessionBuilder
        jdInsights={plan.jdInsights}
        questionSet={plan.questionSet}
        onAdjustSpecs={() => { audioService.playEnd(); setIsPlanReady(false); }}
        onInitialize={handleStartSession}
      />
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto px-4 md:px-8 py-10 md:py-16 space-y-12">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[9px] font-bold text-brand-primary uppercase tracking-[0.2em]">Step 1 of 2</span>
          <h2 className="text-3xl md:text-5xl font-medium text-white tracking-tight mt-1">Configure Session</h2>
        </div>
        <button onClick={onGoBack} className="text-xs font-bold text-white/50 hover:text-white uppercase tracking-widest transition-colors">
          Back
        </button>
      </div>

      <div className="space-y-8">
        <PanelSelector
          selectedPanelIDs={selectedPanelIDs}
          onSelectionChange={setSelectedPanelIDs}
          matchReasons={matchReasons}
        />

        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 md:p-8 space-y-4">
          <label className="text-[10px] font-bold text-white/60 uppercase tracking-widest flex items-center gap-2">
            <UploadIcon className="w-4 h-4 text-brand-primary" /> Optional: Job Description
          </label>
          <textarea
            value={jdText}
            onChange={e => setJdText(e.target.value)}
            placeholder="Paste target job description to tailor questions..."
            rows={4}
            className="w-full bg-black/20 border border-white/[0.08] rounded-xl p-4 text-sm text-white focus:outline-none focus:border-brand-primary/50 transition-colors resize-none"
          />
        </div>

        <SessionControlsEditor
          controls={sessionControls}
          onChange={setSessionControls}
        />
      </div>

      <div className="flex justify-end pt-4">
        <button
          onClick={handleGeneratePlan}
          disabled={isLoading}
          className="w-full sm:w-auto bg-brand-primary hover:bg-brand-primary/90 text-brand-dark font-bold py-4 px-12 rounded-xl text-[10px] uppercase tracking-[0.14em] shadow-xl shadow-brand-primary/10 transition-all disabled:opacity-50"
        >
          {isLoading ? 'Generating Plan...' : 'Generate Practice Plan'}
        </button>
      </div>
    </div>
  );
};

export default SessionPrep;
