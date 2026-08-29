import React, { useEffect, useState } from 'react';
import { completeInterviewSessionContext } from 'mockmate-shared';
import type { InterviewSessionContext, InterviewPlan, SessionControls, InterviewSetupDraft } from 'mockmate-shared';
import * as mockGeminiService from '../services/mockGeminiService';
import PanelSelector from './PanelSelector';
import SessionBuilder from './SessionBuilder';
import SessionControlsEditor from './SessionControlsEditor';
import { UploadIcon } from './icons/UploadIcon';
import { audioService } from '../services/audioService';

interface SessionPrepProps {
  onContextReady: (context: InterviewSessionContext) => void;
  draft: InterviewSetupDraft;
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

const SessionPrep: React.FC<SessionPrepProps> = ({ onContextReady, draft, onGoBack }) => {
  const [currentDraft, setCurrentDraft] = useState<InterviewSetupDraft>(draft);
  const [selectedPanelIDs, setSelectedPanelIDs] = useState<string[]>(draft.selectedPanelIDs?.length ? draft.selectedPanelIDs : DEFAULT_PANEL_IDS);
  const [sessionControls, setSessionControls] = useState<SessionControls>(draft.controls || defaultControls);
  const [jdText, setJdText] = useState<string>(draft.jdText || '');
  const [plan, setPlan] = useState<InterviewPlan | null>(null);
  const [isPlanReady, setIsPlanReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [matchReasons, setMatchReasons] = useState<Record<string, string>>({});
  const [planError, setPlanError] = useState('');

  useEffect(() => {
    let isActive = true;

    const init = async () => {
      setIsLoading(true);

      try {
        const res = await withSetupTimeout(
          mockGeminiService.calibrateIntent(draft.intentText),
          CALIBRATION_TIMEOUT_MS,
          'Interview setup took too long'
        );

        if (!isActive) return;

        const panelIDs = res.recommendedPanelIDs?.length ? res.recommendedPanelIDs : DEFAULT_PANEL_IDS;
        setSelectedPanelIDs(panelIDs);
        setMatchReasons(res.matchReasons || {});
        setCurrentDraft(prev => ({
          ...prev,
          candidateRole: res.recommendedRole || prev.candidateRole || draft.intentText,
          selectedPanelIDs: panelIDs,
        }));
      } catch (error) {
        if (!isActive) return;

        setSelectedPanelIDs(DEFAULT_PANEL_IDS);
        setMatchReasons({});
        setCurrentDraft(prev => ({
          ...prev,
          candidateRole: prev.candidateRole || draft.intentText,
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
  }, [draft.intentText]);

  const handleGeneratePlan = async () => {
    setIsLoading(true);
    setPlanError('');
    audioService.playStart();
    try {
      const interviewPlan = await mockGeminiService.generateInterviewPlan({
        role: currentDraft.candidateRole || draft.intentText,
        intentText: draft.intentText,
        controls: sessionControls,
        jdText: jdText || undefined,
        selectedPanelIDs,
        snapshotId: currentDraft.groundingRequest?.snapshotId,
        bridgeId: currentDraft.groundingRequest?.bridgeId,
      });
      setPlan(interviewPlan);
      setIsPlanReady(true);
    } catch {
      setPlan(null);
      setIsPlanReady(false);
      setPlanError('We could not generate an authoritative interview plan. No session was created. Check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartSession = () => {
    if (!plan) return;
    audioService.playConfirm();
    const finalDraft: InterviewSetupDraft = {
      ...currentDraft,
      controls: sessionControls,
      selectedPanelIDs,
      jdText: jdText || undefined,
    };
    const context = completeInterviewSessionContext(finalDraft, plan);
    onContextReady(context);
  };

  if (isPlanReady && plan) {
    return (
      <SessionBuilder
        jdInsights={plan.jdInsights}
        questionSet={plan.questionSet}
        planSource={plan.meta.planSource}
        sourceMode={plan.meta.controls.sourceMode}
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
        <button type="button" onClick={onGoBack} className="text-xs font-bold text-white/50 hover:text-white uppercase tracking-widest transition-colors">
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
          <label htmlFor="session-job-description" className="text-[10px] font-bold text-white/60 uppercase tracking-widest flex items-center gap-2">
            <UploadIcon className="w-4 h-4 text-brand-primary" /> Optional: Job Description
          </label>
          <textarea
            id="session-job-description"
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

      {planError && (
        <div role="alert" className="rounded-xl border border-red-400/25 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          {planError}
        </div>
      )}

      <div className="flex justify-end pt-4">
        <button
          type="button"
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
