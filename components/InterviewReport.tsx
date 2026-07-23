import { UserProfile } from "../types/ui";
import React, { useMemo, useCallback } from 'react';
import { FinalReport, QuestionPerformance, AdvisoryPanel } from "mockmate-shared";
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

/* ─── Advisor Score Card ────────────────────────────────────────────────── */
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
                <span className="text-[9px] font-bold text-brand-primary uppercase mt-1 tracking-[0.2em] opacity-40">Interviewer Verdict</span>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-bold text-brand-primary">Evaluator Summary</span>
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

/* ─── Main Scorecard ────────────────────────────────────────────────────── */
const Scorecard: React.FC<{ report: FinalReport; userProfile?: UserProfile | null }> = ({ report }) => {
  const rawScore = report.simplifiedScore
    ?? report.quantitativeAnalysis?.dimension_scores?.find(d => d.normalized_score !== null)?.normalized_score;
    
  const hasValidScore = rawScore !== undefined && rawScore !== null;
  const overallScore = rawScore ?? 0;
  
  const tier = !hasValidScore ? 'INCOMPLETE' : overallScore >= 90 ? 'Very strong' : overallScore >= 80 ? 'Solid progress' : 'Keep practicing';

  const getDimensionScore = (term: string) => {
    const found = report.quantitativeAnalysis?.dimension_scores?.find(d => d.dimension.toLowerCase().includes(term));
    return found?.normalized_score;
  };

  const dimensions = [
    { name: 'Communication', score: getDimensionScore('comm') },
    { name: 'Role knowledge', score: getDimensionScore('tech') },
    { name: 'Confidence', score: getDimensionScore('conf') },
    { name: 'Structure', score: getDimensionScore('struct') },
  ];

  return (
    <div className="bg-white/[0.02] p-8 md:p-12 border border-white/[0.06] rounded-3xl overflow-hidden relative group backdrop-blur-2xl shadow-2xl">
      <div className="absolute top-0 right-0 w-96 h-96 bg-brand-primary/5 rounded-full blur-[100px] -mr-48 -mt-48 pointer-events-none" />

      <div className="flex flex-col lg:flex-row justify-between items-center gap-10 relative z-10">
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
          <p className="text-sm md:text-base text-white/40 max-w-md font-medium leading-relaxed">
            {report.overallSummary}
          </p>
        </div>

        <div className="w-full lg:w-72 grid grid-cols-2 lg:grid-cols-1 gap-3 shrink-0">
          {dimensions.map((d, i) => (
            <div key={i} className="bg-white/[0.02] p-3.5 rounded-xl border border-white/[0.04] flex items-center justify-between">
              <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">{d.name}</span>
              <span className="text-xs font-bold text-brand-primary tracking-widest">{d.score != null ? `${d.score}%` : 'N/A'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ─── Question Breakdown ────────────────────────────────────────────────── */
const QuestionCard: React.FC<{ q: QuestionPerformance; index: number }> = ({ q, index }) => (
  <motion.div
    {...sectionAnimation}
    className="bg-white/[0.02] p-6 md:p-8 rounded-2xl border border-white/[0.06] space-y-6"
  >
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-bold text-brand-primary uppercase tracking-[0.14em]">Question {index + 1}</span>
    </div>

    <h4 className="text-base md:text-lg font-medium text-white leading-snug">{q.question_text}</h4>

    <div className="space-y-4 pt-2">
      <div className="bg-black/20 p-4 rounded-xl border border-white/[0.04]">
        <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest block mb-2">Candidate response</span>
        <p className="text-xs md:text-sm text-white/70 italic leading-relaxed">"{q.user_transcript}"</p>
      </div>

      <div className="bg-brand-primary/[0.02] p-4 rounded-xl border border-brand-primary/10 space-y-2">
        <span className="text-[9px] font-bold text-brand-primary uppercase tracking-widest block">Evaluator feedback</span>
        <p className="text-xs md:text-sm text-white/80 leading-relaxed">{q.feedback}</p>
      </div>
    </div>
  </motion.div>
);

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
          <h2 className="text-3xl md:text-5xl font-medium text-white tracking-tight mt-1">Detailed Scorecard</h2>
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

      <Scorecard report={report} userProfile={userProfile} />

      {report.advisoryPanel && report.advisoryPanel.length > 0 && (
        <section className="space-y-6">
          <h3 className="text-sm font-bold text-white/50 uppercase tracking-[0.14em]">Interviewer Panel Feedback</h3>
          <PersonaScoreCard advisory={report.advisoryPanel} />
        </section>
      )}

      {report.questionPerformance && report.questionPerformance.length > 0 && (
        <section className="space-y-6">
          <h3 className="text-sm font-bold text-white/50 uppercase tracking-[0.14em]">Question Performance</h3>
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
