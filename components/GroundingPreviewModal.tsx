import React, { useEffect, useRef, useState } from 'react';
import { CareerContextItem, GroundingPurpose, GroundingConflict } from 'mockmate-shared';
import { Shield, Check, X, ChevronRight, FileText, Mic, Target, AlertTriangle } from 'lucide-react';

interface GroundingPreviewModalProps {
  purpose: GroundingPurpose;
  items: CareerContextItem[];
  conflicts: GroundingConflict[];
  onConfirm: (selectedItemIds: string[], scope: 'one_time' | 'future_sessions', conflictSelections: Record<string, string>) => void;
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
  const [conflictSelections, setConflictSelections] = useState<Record<string, string>>({});
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

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
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="grounding-dialog-title"
        aria-describedby="grounding-dialog-description"
        tabIndex={-1}
        className="w-full max-w-2xl bg-neutral-900 border border-white/10 rounded-2xl p-6 md:p-8 space-y-6 shadow-2xl overflow-y-auto max-h-[90vh] focus:outline-none"
      >
        <div className="flex items-start justify-between border-b border-white/10 pb-4">
          <div>
            <span className="text-[10px] font-bold text-brand-primary uppercase tracking-[0.14em] flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" /> User-Owned Career Context
            </span>
            <h2 id="grounding-dialog-title" className="text-xl md:text-2xl font-semibold text-white mt-1">
              {getPurposeLabel(purpose)}
            </h2>
            <p id="grounding-dialog-description" className="text-xs text-brand-tint mt-1">
              Select which verified facts to ground this practice session. Unselected items will be excluded.
            </p>
          </div>
          <button type="button" aria-label="Close context selection" onClick={onClose} className="text-brand-tint hover:text-white p-1 transition-colors">
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
              Select one authoritative value for every conflict before continuing.
            </p>
            {conflicts.filter(c => c.requiresUserChoice).map(conflict => (
              <fieldset key={conflict.canonicalKey} className="space-y-1 pt-2">
                <legend className="text-xs font-semibold text-amber-100">{conflict.canonicalKey}</legend>
                {conflict.competingItemIds.map((id, index) => (
                  <label key={id} className="flex items-center gap-2 text-xs text-white/80">
                    <input type="radio" name={`conflict-${conflict.canonicalKey}`} checked={conflictSelections[conflict.canonicalKey] === id}
                      onChange={() => { setConflictSelections(prev => ({ ...prev, [conflict.canonicalKey]: id })); setSelectedIds(prev => [...prev.filter(x => !conflict.competingItemIds.includes(x)), id]); }} />
                    {conflict.descriptions[index] || id}
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
        )}

        {/* Fact Items Selection List */}
        <div className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-brand-tint">
            Available Evidence ({selectedIds.length} of {eligibleItems.length} selected)
          </p>

          {eligibleItems.length === 0 ? (
            <div className="p-4 bg-white/5 rounded-xl text-center text-xs text-white/40">
              No verified context items available yet. You can continue without grounding.
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {eligibleItems.map(item => {
                const isSelected = selectedIds.includes(item.id);
                return (
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    key={item.id}
                    onClick={() => toggleItem(item.id)}
                    className={`flex w-full items-center justify-between p-3.5 rounded-xl border cursor-pointer text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary ${
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
                        <span className="text-[10px] text-brand-tint font-mono truncate max-w-md block">
                          {typeof item.value === 'object' && 'text' in item.value ? item.value.text : JSON.stringify(item.value)}
                        </span>
                      </div>
                    </div>
                    <span className="text-[9px] uppercase font-mono px-2 py-0.5 rounded bg-white/5 text-brand-tint">
                      {item.source.module}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Consent Scope Selection */}
        <div className="border-t border-white/10 pt-4 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-brand-tint">Consent Scope</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setScope('one_time')}
              aria-pressed={scope === 'one_time'}
              className={`p-3 rounded-xl border text-left transition-all ${
                scope === 'one_time' ? 'bg-white/10 border-brand-primary text-white' : 'bg-white/5 border-transparent text-white/40'
              }`}
            >
              <div className="text-xs font-semibold">One-time Session</div>
              <div className="text-[10px] text-white/40 mt-0.5">Use selected facts for this session only</div>
            </button>
            <button
              onClick={() => setScope('future_sessions')}
              aria-pressed={scope === 'future_sessions'}
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
            onClick={() => onConfirm(selectedIds, scope, conflictSelections)}
            disabled={selectedIds.length === 0 || conflicts.some(c => c.requiresUserChoice && !conflictSelections[c.canonicalKey])}
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
