/**
 * components/clearspeak/PassageRenderer.tsx
 * Mockmate ClearSpeak — Guided Read passage display component.
 *
 * CRITICAL CONTRACT:
 *   - Renders ONLY from PassageToken[] structured arrays.
 *   - Source of truth: implementation_plan.md §8, §9
 *
 * Enhanced with:
 *   - Tap-to-pronounce on any token word
 *   - High-end pause/breath badges instead of raw unstyled slashes
 *   - Accessible stress and cadence indicators
 */

import React from 'react';
import type { PassageToken } from './types';

interface PassageRendererProps {
  tokens: PassageToken[];
  /** Highlight a specific token index (e.g. during Repeat-After-Coach playback) */
  activeIndex?: number;
  /** Interactive tap-to-pronounce word callback */
  onWordClick?: (word: string) => void;
  /** Currently speaking word for active visual feedback */
  activeWord?: string | null;
}

const PAUSE_CONFIG: Record<
  PassageToken['pauseType'],
  { label: string; badgeClass: string; rawSymbol: string } | null
> = {
  none: null,
  short: {
    label: 'pause',
    badgeClass: 'bg-amber-500/10 text-amber-300 border-amber-500/25',
    rawSymbol: '/',
  },
  stop: {
    label: 'breathe',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    rawSymbol: '//',
  },
};

const PassageRenderer: React.FC<PassageRendererProps> = ({
  tokens,
  activeIndex,
  onWordClick,
  activeWord,
}) => {
  // Group tokens into thought groups
  const lines: PassageToken[][] = [];
  let current: PassageToken[] = [];

  tokens.forEach(token => {
    current.push(token);
    if (token.pauseType === 'stop') {
      lines.push(current);
      current = [];
    }
  });
  if (current.length > 0) lines.push(current);

  let globalIdx = 0;

  return (
    <div
      className="clearspeak-passage relative px-2 py-1 sm:px-4 sm:py-2 select-text"
      role="text"
      aria-label="Practice passage"
      style={{
        fontFamily: "'Outfit', sans-serif",
        fontSize: '1.25rem',
        lineHeight: 2.3,
        color: 'rgba(255, 255, 255, 0.9)',
      }}
    >
      {lines.map((line, lineIdx) => (
        <div
          key={lineIdx}
          className="clearspeak-passage__line flex flex-wrap items-center gap-x-1.5 mb-2.5"
        >
          {line.map((token) => {
            const idx = globalIdx++;
            const isActive = idx === activeIndex;
            const cleanText = token.text.replace(/[^a-zA-Z'-]/g, '').toLowerCase();
            const isSpeaking = activeWord === cleanText;
            const pauseInfo = PAUSE_CONFIG[token.pauseType];

            return (
              <React.Fragment key={idx}>
                {onWordClick ? (
                  <button
                    type="button"
                    data-testid={`token-${idx}`}
                    onClick={() => onWordClick(token.text)}
                    title={`Tap to hear "${token.text}" pronounced`}
                    className={`inline-block transition-all duration-200 cursor-pointer rounded px-1.5 py-0.5 text-left focus:outline-none focus:ring-1 focus:ring-brand-primary ${
                      isSpeaking
                        ? 'bg-brand-primary text-brand-dark font-extrabold scale-105 shadow-md shadow-brand-primary/40 ring-2 ring-brand-primary'
                        : token.isStressed
                          ? 'font-extrabold text-emerald-400 hover:bg-emerald-500/20 drop-shadow-[0_0_10px_rgba(52,211,153,0.3)]'
                          : 'font-normal text-slate-100 hover:bg-white/10 hover:text-white'
                    } ${isActive ? 'bg-emerald-500/20 border-b-2 border-emerald-400' : ''}`}
                  >
                    {token.text}
                  </button>
                ) : (
                  <span
                    data-testid={`token-${idx}`}
                    className={`inline-block transition-all duration-200 rounded px-1.5 py-0.5 ${
                      token.isStressed
                        ? 'font-extrabold text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.3)]'
                        : 'font-normal text-slate-100'
                    } ${isActive ? 'bg-emerald-500/20 border-b-2 border-emerald-400' : ''}`}
                  >
                    {token.text}
                  </span>
                )}

                {pauseInfo && (
                  <span
                    aria-hidden="true"
                    title={token.pauseType === 'stop' ? 'Full breath stop' : 'Micro thought-group pause'}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider select-none align-middle mx-1 shadow-sm transition-all ${pauseInfo.badgeClass}`}
                  >
                    <span>⏸</span>
                    <span>{pauseInfo.label}</span>
                  </span>
                )}
              </React.Fragment>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default PassageRenderer;
