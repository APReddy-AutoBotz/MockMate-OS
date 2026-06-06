/**
 * components/clearspeak/PassageRenderer.tsx
 * Mockmate ClearSpeak — Guided Read passage display component.
 *
 * CRITICAL CONTRACT:
 *   - Renders ONLY from PassageToken[] structured arrays.
 *   - NEVER parses raw strings for slashes or markup.
 *   - Source of truth: implementation_plan.md §8, §9
 *
 * Visual mappings (per plan):
 *   isStressed + pauseType === 'stop'   → bold blue + double-slash gap after
 *   isStressed                          → bold blue
 *   pauseType === 'short'               → / rendered after + small gap
 *   pauseType === 'stop'                → // rendered after + larger gap
 */

import React from 'react';
import type { PassageToken } from './types';

interface PassageRendererProps {
  tokens: PassageToken[];
  /** Highlight a specific token index (e.g. during Repeat-After-Coach playback) */
  activeIndex?: number;
}

const PAUSE_SYMBOL: Record<PassageToken['pauseType'], string | null> = {
  none:  null,
  short: '/',
  stop:  '//',
};

const PassageRenderer: React.FC<PassageRendererProps> = ({ tokens, activeIndex }) => {
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
      className="clearspeak-passage relative px-4 py-2"
      role="text"
      aria-label="Practice passage"
      style={{
        fontFamily: "'Outfit', sans-serif",
        fontSize: '1.4rem',
        lineHeight: 2.4,
        color: 'rgba(255, 255, 255, 0.8)',
      }}
    >
      {/* Optional: The 'Ghost Highlight' container could go here if we want a global sweep */}
      
      {lines.map((line, lineIdx) => (
        <div
          key={lineIdx}
          className="clearspeak-passage__line flex flex-wrap items-baseline gap-x-1.5 mb-2"
        >
          {line.map((token) => {
            const idx = globalIdx++;
            const isActive = idx === activeIndex;
            const symbol = PAUSE_SYMBOL[token.pauseType];

            return (
              <React.Fragment key={idx}>
                <span
                  data-testid={`token-${idx}`}
                  className="transition-all duration-300"
                  style={{
                    fontWeight: token.isStressed ? 800 : 400,
                    color: token.isStressed
                      ? '#34d399' // emerald-400
                      : 'inherit',
                    textShadow: token.isStressed 
                      ? '0 0 15px rgba(16,185,129,0.3)' 
                      : 'none',
                    background: isActive
                      ? 'rgba(16,185,129,0.15)'
                      : 'transparent',
                    borderRadius: '8px',
                    padding: '0 4px',
                    // The 'isActive' state for Repeat-After-Coach
                    borderBottom: isActive ? '2px solid #10b981' : '2px solid transparent',
                  }}
                >
                  {token.text}
                </span>
                {symbol && (
                  <span
                    aria-hidden="true"
                    className="select-none font-bold"
                    style={{
                      color: '#10b981', // emerald-500
                      opacity: 0.4,
                      padding: '0 4px',
                      fontSize: '0.8em',
                      letterSpacing: '0.1em',
                      marginRight: token.pauseType === 'stop' ? '1rem' : '0.5rem',
                    }}
                  >
                    {symbol}
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
