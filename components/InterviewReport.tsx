import { UserProfile } from "../types/ui";
import React, { useCallback } from 'react';
import { FinalReport, QuestionPerformance, AdvisoryPanel, DimensionScore } from "mockmate-shared";
import { generatePdf } from '../services/pdfGenerator';
import { motion } from 'framer-motion';
import { PERSONAS_CONFIG } from '../personas.config';
import PilotFeedbackCard from './PilotFeedbackCard';

const sectionAnimation = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-50px" },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as any }
};

const scrollToTurnAnchor = (turnId?: string, fallbackIndex?: number) => {
  if (!turnId && fallbackIndex === undefined) return;
  const targetId = turnId ? `turn-anchor-${turnId}` : `turn-anchor-index-${fallbackIndex}`;
  const el = document.getElementById(targetId);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ring-2', 'ring-brand-primary', 'transition-all');
    setTimeout(() => {
      el.classList.remove('ring-2', 'ring-brand-primary');
    }, 2500);
  }
};

/* ─── Reasoning Review Score Cards ────────────────────────────────────────── */
const PersonaScoreCard: React.FC<{ advisory: AdvisoryPanel[] }> = React.memo(({ advisory }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
    {advisory.map((adv, i) => {
      const personaNameOnly = adv.name.split('—')[0]?.split('(')[0].trim();
      const personaDetails = PERSONAS_CONFIG.find(p => p.name.toLowerCase().includes(personaNameOnly.toLowerCase()));
      const Icon = personaDetails?.icon;

      return (
        <motion.div
          key={i}
          {...sectionAnimation}
          className="bg-white/[0.02] p-6 md:p-8 flex flex-col gap-6 relative overflow-hidden group border border-white/[0.06] rounded-2xl shadow-xl hover:bg-white/[0.04] transition-all"
        >
          <div className="flex items-start justify-between relative z-10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-brand-primary/5 border border-brand-primary/20 flex items-center justify-center transition-all duration-500">
                {Icon ? <Icon className="w-6 h-6 text-brand-primary transition-colors" /> : <span className="text-lg">💬</span>}
              </div>
              <div className="flex flex-col">
                <span className="text-base font-bold text-white tracking-tight leading-tight">{adv.name}</span>
                <span className="text-[9px] font-bold text-brand-primary uppercase mt-1 tracking-[0.2em] opacity-40">Reasoning Review</span>
              </div>
            </div>
          </div>
          <p className="text-sm text-white/60 leading-relaxed italic border-l-2 border-brand-primary/20 pl-4 py-0.5">
            "{adv.assessment}"
          </p>
        </motion.div>
      );
    })}
  </div>
));

/* ─── Main Canonical Dimension Scorecard ────────────────────────────────── */
const Scorecard: React.FC<{ report: FinalReport }> = ({ report }) => {
  const rawScore = report.simplifiedScore
    ?? report.quantitativeAnalysis?.dimension_scores?.find(d => d.score_status === 'scored' && d.normalized_score !== null)?.normalized_score;
    
  const hasValidScore = rawScore !== undefined && rawScore !== null;
  const overallScore = rawScore ?? 0;
  
  const tier = !hasValidScore ? 'INCOMPLETE' : overallScore >= 90 ? 'Very strong' : overallScore >= 80 ? 'Solid progress' : 'Keep practicing';

  const dimensionScores: DimensionScore[] = report.quantitativeAnalysis?.dimension_scores || [];

  return (
    <div className="bg-white/[0.02] p-8 md:p-12 border border-white/[0.06] rounded-3xl overflow-hidden relative group backdrop-blur-2xl shadow-2xl space-y-8">
      <div className="absolute top-0 right-0 w-96 h-96 bg-brand-primary/5 rounded-full blur-[100px] -mr-48 -mt-48 pointer-events-none" />

      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-10 relative z-10">
        <div className="text-center md:text-left space-y-4">
          <div className="flex items-center justify-center md:justify-start gap-6">
            <span className="text-6xl md:text-8xl font-black text-white tracking-tight leading-none drop-shadow-lg">
              {hasValidScore ? overallScore : 'N/A'}
            </span>
            <div className="flex flex-col items-start gap-2">
              {hasValidScore && <span className="text-xl text-white/10 font-bold">/ 100</span>}
              <span className="bg-brand-primary text-brand-dark px-3 py-1 rounded-lg font-black text-[9px] tracking-[0.2em] uppercase">{tier}</span>
            </div>
          </div>
          <p className="text-sm md:text-base text-white/60 max-w-2xl font-medium leading-relaxed">
            {report.overallSummary}
          </p>
        </div>
      </div>

      {/* Canonical Dimension Breakdown Grid */}
      <div className="space-y-4 pt-4 border-t border-white/[0.06]">
        <h3 className="text-xs font-bold text-white/50 uppercase tracking-[0.16em]">Reasoning Dimension Breakdown</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {dimensionScores.map((dim, i) => {
            const dimTitle = dim.dimensionName || dim.dimension.replace(/_/g, ' ');
            const isScored = dim.score_status === 'scored';
            const isInsufficient = dim.score_status === 'insufficient_evidence';

            return (
              <div
                key={i}
                className="bg-white/[0.02] p-5 rounded-2xl border border-white/[0.05] flex flex-col justify-between space-y-4 hover:border-brand-primary/20 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-white tracking-wide">{dimTitle}</span>
                    <span className="text-[9px] font-semibold text-white/40 uppercase tracking-widest mt-0.5">
                      {dim.score_status} {dim.confidence ? `• ${dim.confidence} confidence` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {isScored && (
                      <span className="text-lg font-black text-brand-primary tracking-tight">
                        {dim.normalized_score}%
                      </span>
                    )}
                    {isInsufficient && (
                      <span className="text-xs font-bold text-yellow-400/80 bg-yellow-400/10 px-2 py-0.5 rounded uppercase tracking-wider text-[9px]">
                        Insufficient Evidence
                      </span>
                    )}
                    {!isScored && !isInsufficient && (
                      <span className="text-xs font-bold text-white/30 bg-white/5 px-2 py-0.5 rounded uppercase tracking-wider text-[9px]">
                        Not Tested
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-xs text-white/60 leading-relaxed">
                  {dim.reason}
                </p>

                {dim.evidenceReferences && dim.evidenceReferences.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-white/[0.04]">
                    <span className="text-[9px] font-bold text-brand-primary uppercase tracking-widest block">Evidence References</span>
                    <div className="space-y-1.5">
                      {dim.evidenceReferences.map((ref, refIdx) => (
                        <button
                          key={refIdx}
                          onClick={() => scrollToTurnAnchor(ref.turnId)}
                          className="w-full text-left bg-black/30 hover:bg-black/50 p-2.5 rounded-lg border border-white/[0.04] transition-all group/ref"
                        >
                          <div className="flex items-center justify-between text-[9px] font-bold text-white/40 uppercase mb-1">
                            <span className="group-hover/ref:text-brand-primary transition-colors">
                              Turn ID: {ref.turnId.slice(0, 8)}... ({ref.stage || 'framing'})
                            </span>
                            <span className="text-brand-primary">View Source ↵</span>
                          </div>
                          <p className="text-xs text-white/70 italic line-clamp-2">
                            "{ref.excerpt}"
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {dim.hasChallengeEvidence && (
                  <div className="flex items-center gap-1.5 text-[9px] font-bold text-brand-primary uppercase tracking-wider">
                    <span>⚡ Includes Challenge/Recovery Pushback Evidence</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* ─── Evidence from Responses (Question Breakdown) ─────────────────────── */
const QuestionCard: React.FC<{ q: QuestionPerformance; index: number }> = ({ q, index }) => {
  const anchorId = q.turnId ? `turn-anchor-${q.turnId}` : `turn-anchor-index-${index}`;

  return (
    <motion.div
      id={anchorId}
      {...sectionAnimation}
      className="bg-white/[0.02] p-6 md:p-8 rounded-2xl border border-white/[0.06] space-y-6 scroll-mt-24 transition-all"
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-brand-primary uppercase tracking-[0.14em]">Question {index + 1}</span>
        {q.turnId && (
          <span className="text-[9px] font-bold text-white/30 tracking-widest">
            ID: {q.turnId}
          </span>
        )}
      </div>

      <h4 className="text-base md:text-lg font-medium text-white leading-snug">{q.question_text}</h4>

      <div className="space-y-4 pt-2">
        <div className="bg-black/20 p-4 rounded-xl border border-white/[0.04]">
          <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest block mb-2">Candidate response</span>
          <p className="text-xs md:text-sm text-white/70 italic leading-relaxed">"{q.user_transcript}"</p>
        </div>

        {q.feedback && q.feedback.trim() !== '' && q.feedback !== 'Candidate response recorded and evaluated.' && (
          <div className="bg-brand-primary/[0.02] p-4 rounded-xl border border-brand-primary/10 space-y-2">
            <span className="text-[9px] font-bold text-brand-primary uppercase tracking-widest block">Practice Feedback</span>
            <p className="text-xs md:text-sm text-white/80 leading-relaxed">{q.feedback}</p>
          </div>
        )}
      </div>
    </motion.div>
  );
};

interface InterviewReportProps {
  report: FinalReport;
  onRestart: () => void;
  userProfile?: UserProfile | null;
  sessionId?: string;
}

export const InterviewReport: React.FC<InterviewReportProps> = ({ report, onRestart, userProfile, sessionId }) => {
  const [isDownloading, setIsDownloading] = React.useState(false);

  const handleDownloadPdf = useCallback(async () => {
    setIsDownloading(true);
    try {
      await generatePdf(report);
    } catch (e) {
      console.error(e);
    } finally {
      setIsDownloading(false);
    }
  }, [report]);

  return (
    <div className="w-full max-w-5xl mx-auto px-4 md:px-8 py-10 md:py-16 space-y-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <span className="text-[9px] font-bold text-brand-primary uppercase tracking-[0.2em]">Session Complete</span>
          <h2 className="text-3xl md:text-5xl font-medium text-white tracking-tight mt-1">Reasoning Scorecard</h2>
        </div>
        <div className="flex gap-4">
          <button
            onClick={handleDownloadPdf}
            disabled={isDownloading}
            className="px-6 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl border border-white/10 text-[10px] font-bold uppercase tracking-widest transition-all"
          >
            {isDownloading ? 'Exporting...' : 'Export PDF'}
          </button>
          <button
            onClick={onRestart}
            className="px-6 py-3 bg-brand-primary text-brand-dark rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-brand-primary/90 transition-all shadow-lg shadow-brand-primary/10"
          >
            New Practice
          </button>
        </div>
      </div>

      <Scorecard report={report} />

      {report.advisoryPanel && report.advisoryPanel.length > 0 && (
        <section className="space-y-6">
          <h3 className="text-sm font-bold text-white/50 uppercase tracking-[0.14em]">Reasoning Review</h3>
          <PersonaScoreCard advisory={report.advisoryPanel} />
        </section>
      )}

      {report.questionPerformance && report.questionPerformance.length > 0 && (
        <section className="space-y-6">
          <h3 className="text-sm font-bold text-white/50 uppercase tracking-[0.14em]">Evidence from Your Responses</h3>
          <div className="space-y-6">
            {report.questionPerformance.map((q, i) => (
              <QuestionCard key={i} q={q} index={i} />
            ))}
          </div>
        </section>
      )}

      {sessionId && (
        <PilotFeedbackCard sessionId={sessionId} />
      )}
    </div>
  );
};

export default InterviewReport;
