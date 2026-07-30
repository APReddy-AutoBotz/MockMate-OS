import React, { useState } from 'react';
import { CareerContextItem, GroundingPurpose, GroundingConflict } from 'mockmate-shared';
import { Shield, Check, X, ChevronRight, FileText, Mic, Target, AlertTriangle } from 'lucide-react';

interface GroundingPreviewModalProps {
  purpose: GroundingPurpose;
  items: CareerContextItem[];
  conflicts: GroundingConflict[];
  onConfirm: (selectedItemIds: string[], scope: 'one_time' | 'future_sessions') => void;
  onSkip: () => void;
  onClose: () => void;
}

export const GroundingPreviewModal: React.FC<GroundingPreviewModalProps> = ({
  purpose,
  items,
  conflicts,
  onConfirm,
  onSkip,
  onClose,
}) => {
  const eligibleItems = items.filter(i => i.status === 'active' && i.sensitivity !== 'personal_contact');
  const [selectedIds, setSelectedIds] = useState<string[]>(eligibleItems.map(i => i.id));
  const [scope, setScope] = useState<'one_time' | 'future_sessions'>('one_time');

  const toggleItem = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const getPurposeLabel = (p: GroundingPurpose) => {
    switch (p) {
      case 'resume_to_interview': return 'Resume Grounded Interview Practice';
      case 'resume_to_clearspeak': return 'Resume Grounded ClearSpeak Practice';
      case 'clearspeak_to_interview': return 'ClearSpeak Grounded Interview Practice';
      default: return 'Cross-Module Context Grounding';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="w-full max-w-2xl bg-neutral-900 border border-white/10 rounded-2xl p-6 md:p-8 space-y-6 shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex items-start justify-between border-b border-white/10 pb-4">
          <div>
            <span className="text-[10px] font-bold text-brand-primary uppercase tracking-[0.14em] flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" /> User-Owned Career Context
            </span>
            <h2 className="text-xl md:text-2xl font-semibold text-white mt-1">
              {getPurposeLabel(purpose)}
            </h2>
            <p className="text-xs text-white/60 mt-1">
              Select which verified facts to ground this practice session. Unselected items will be excluded.
            </p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white p-1 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conflict Warning */}
        {conflicts.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-amber-400 font-medium text-sm">
              <AlertTriangle className="w-4 h-4" /> Conflict Detected
            </div>
            <p className="text-xs text-amber-200/80">
              Multiple target roles or goals exist in your context. Please ensure your selection below represents your intended practice focus.
            </p>
          </div>
        )}

        {/* Fact Items Selection List */}
        <div className="space-y-3">
          <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">
            Available Evidence ({selectedIds.length} of {eligibleItems.length} selected)
          </label>

          {eligibleItems.length === 0 ? (
            <div className="p-4 bg-white/5 rounded-xl text-center text-xs text-white/40">
              No verified context items available yet. You can continue without grounding.
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {eligibleItems.map(item => {
                const isSelected = selectedIds.includes(item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => toggleItem(item.id)}
                    className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-brand-primary/10 border-brand-primary/40 text-white'
                        : 'bg-white/[0.02] border-white/5 text-white/50 hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                        isSelected ? 'bg-brand-primary border-brand-primary text-black' : 'border-white/20'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <div>
                        <span className="text-xs font-medium block text-white/90">{item.label}</span>
                        <span className="text-[10px] text-white/40 font-mono truncate max-w-md block">
                          {typeof item.value === 'object' && 'text' in item.value ? item.value.text : JSON.stringify(item.value)}
                        </span>
                      </div>
                    </div>
                    <span className="text-[9px] uppercase font-mono px-2 py-0.5 rounded bg-white/5 text-white/40">
                      {item.source.module}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Consent Scope Selection */}
        <div className="border-t border-white/10 pt-4 space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">Consent Scope</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setScope('one_time')}
              className={`p-3 rounded-xl border text-left transition-all ${
                scope === 'one_time' ? 'bg-white/10 border-brand-primary text-white' : 'bg-white/5 border-transparent text-white/40'
              }`}
            >
              <div className="text-xs font-semibold">One-time Session</div>
              <div className="text-[10px] text-white/40 mt-0.5">Use selected facts for this session only</div>
            </button>
            <button
              onClick={() => setScope('future_sessions')}
              className={`p-3 rounded-xl border text-left transition-all ${
                scope === 'future_sessions' ? 'bg-white/10 border-brand-primary text-white' : 'bg-white/5 border-transparent text-white/40'
              }`}
            >
              <div className="text-xs font-semibold">Future Sessions</div>
              <div className="text-[10px] text-white/40 mt-0.5">Remember this selection for future practice</div>
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between border-t border-white/10 pt-4">
          <button
            onClick={onSkip}
            className="px-4 py-2.5 rounded-xl border border-white/10 text-white/60 hover:text-white text-xs font-medium transition-colors"
          >
            Continue Without Grounding
          </button>
          <button
            onClick={() => onConfirm(selectedIds, scope)}
            disabled={selectedIds.length === 0}
            className="px-6 py-2.5 rounded-xl bg-brand-primary text-brand-dark hover:bg-brand-primary/90 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors disabled:opacity-40"
          >
            Continue With Selected Context <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default GroundingPreviewModal;
