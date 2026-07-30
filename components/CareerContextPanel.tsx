import React, { useEffect, useState } from 'react';
import { CareerContextItem, CareerContextState } from 'mockmate-shared';
import { Shield, Check, Trash2, AlertCircle, RefreshCw, ChevronLeft } from 'lucide-react';
import { apiClient } from '../services/apiClient';

interface CareerContextPanelProps {
  onBack: () => void;
}

export const CareerContextPanel: React.FC<CareerContextPanelProps> = ({ onBack }) => {
  const [items, setItems] = useState<CareerContextItem[]>([]);
  const [state, setState] = useState<CareerContextState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRebuilding, setIsRebuilding] = useState(false);

  const fetchContext = async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.get<any>('career-context');
      if (res) {
        setItems(res.activeItems ? [...res.activeItems, ...(res.pendingItems || [])] : []);
        setState(res.state || null);
      }
    } catch (e) {
      console.error('Failed to load career context', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchContext();
  }, []);

  const handleRebuild = async () => {
    setIsRebuilding(true);
    try {
      await apiClient.post<any>('career-context/rebuild', {});
      await fetchContext();
    } catch (e) {
      console.error('Failed to rebuild career context', e);
    } finally {
      setIsRebuilding(false);
    }
  };

  const handleDecision = async (itemId: string, decision: 'confirm' | 'revoke') => {
    try {
      await apiClient.post<any>(`career-context/items/${itemId}/decision`, { decision });
      await fetchContext();
    } catch (e) {
      console.error('Failed to apply item decision', e);
    }
  };

  const handleTogglePersonalization = async () => {
    if (!state) return;
    try {
      const res = await apiClient.post<any>('career-context/preference', {
        personalizationEnabled: !state.personalizationEnabled,
      });
      if (res?.state) setState(res.state);
    } catch (e) {
      console.error('Failed to toggle preference', e);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 md:px-8 py-8 md:py-12 space-y-8">
      <div className="flex items-center justify-between border-b border-white/10 pb-6">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <span className="text-[10px] font-bold text-brand-primary uppercase tracking-[0.14em] flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" /> User-Owned Grounding
            </span>
            <h1 className="text-2xl md:text-3xl font-semibold text-white mt-0.5">Career Context Hub</h1>
          </div>
        </div>

        <button
          onClick={handleRebuild}
          disabled={isRebuilding}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-medium transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRebuilding ? 'animate-spin' : ''}`} />
          {isRebuilding ? 'Rebuilding...' : 'Rebuild Context'}
        </button>
      </div>

      {/* State & Preferences */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white/[0.02] border border-white/10 rounded-2xl p-6">
        <div>
          <div className="text-xs font-medium text-white/50">Active Context Version</div>
          <div className="text-2xl font-bold text-white mt-1 font-mono">v{state?.contextVersion || 1}</div>
          <div className="text-[10px] text-white/40 mt-1">Increments automatically on edits, confirmations, or revocations</div>
        </div>

        <div className="flex items-center justify-between border-t md:border-t-0 md:border-l border-white/10 pt-4 md:pt-0 md:pl-6">
          <div>
            <div className="text-xs font-semibold text-white">Practice Evidence Personalization</div>
            <div className="text-[11px] text-white/50 mt-0.5">Allow prior practice signals to tailor future interview sessions</div>
          </div>
          <button
            onClick={handleTogglePersonalization}
            className={`w-12 h-6 rounded-full transition-colors relative p-1 ${
              state?.personalizationEnabled ? 'bg-brand-primary' : 'bg-white/20'
            }`}
          >
            <div className={`w-4 h-4 rounded-full bg-black transition-transform ${
              state?.personalizationEnabled ? 'translate-x-6' : 'translate-x-0'
            }`} />
          </button>
        </div>
      </div>

      {/* Items List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white/60">
            Stored Context Items ({items.length})
          </h2>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-white/40 text-xs">Loading career context items...</div>
        ) : items.length === 0 ? (
          <div className="p-8 bg-white/[0.02] border border-white/5 rounded-2xl text-center space-y-3">
            <AlertCircle className="w-6 h-6 text-white/30 mx-auto" />
            <div className="text-sm text-white/60">No stored career context items found.</div>
            <div className="text-xs text-white/40">Complete a Resume review or ClearSpeak practice session to populate context.</div>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map(item => (
              <div key={item.id} className="bg-white/[0.02] border border-white/10 rounded-xl p-4 flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white">{item.label}</span>
                    <span className={`text-[9px] uppercase px-2 py-0.5 rounded font-mono ${
                      item.provenance === 'user_confirmed' ? 'bg-emerald-500/20 text-emerald-300' :
                      item.provenance === 'inferred_pending' ? 'bg-amber-500/20 text-amber-300' :
                      'bg-white/10 text-white/60'
                    }`}>
                      {item.provenance}
                    </span>
                    <span className="text-[9px] uppercase px-2 py-0.5 rounded font-mono bg-white/5 text-white/40">
                      {item.source.module}
                    </span>
                  </div>
                  <div className="text-xs text-white/70">
                    {typeof item.value === 'object' && 'text' in item.value ? item.value.text : JSON.stringify(item.value)}
                  </div>
                  {item.exactExcerpt && (
                    <div className="text-[10px] text-white/40 font-mono italic">
                      Source Excerpt: "{item.exactExcerpt}"
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {item.status === 'pending_confirmation' && (
                    <button
                      onClick={() => handleDecision(item.id, 'confirm')}
                      className="p-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 transition-colors"
                      title="Confirm fact"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDecision(item.id, 'revoke')}
                    className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
                    title="Revoke fact"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CareerContextPanel;
