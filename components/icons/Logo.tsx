
import React from 'react';

interface LogoProps extends React.HTMLAttributes<HTMLDivElement> {
    iconOnly?: boolean;
    className?: string;
}

/**
 * MockMate official brand logo.
 *
 * Brand palette:
 *   #FFBC03  — Amber Yellow  (primary strokes, wordmark accent)
 *   #002C4B  — Deep Navy     (backgrounds, icon fill)
 *   #1B4F72  — Steel Blue    (depth shadow wing)
 *   #A8C5DA  — Sky Tint      (wordmark "Mock" foreground on dark bg)
 */
export const Logo = ({ className = '', iconOnly = false, ...props }: LogoProps) => {
    const AMBER    = '#FFBC03';
    const NAVY     = '#002C4B';
    const STEEL    = '#1B4F72';
    const TINT     = '#A8C5DA';
    const WHITE    = '#FFFFFF';

    return (
        <div className={`flex items-center justify-center ${className}`} {...props}>
            <svg
                viewBox={iconOnly ? '0 0 512 512' : '0 0 2800 512'}
                xmlns="http://www.w3.org/2000/svg"
                role="img"
                aria-label="MockMate Logo"
                className="h-full w-auto"
                preserveAspectRatio="xMinYMid meet"
            >
                <defs>
                    {/* Left wing: bright amber at peak, darkens to steel at foot */}
                    <linearGradient id="mmLeftWing" x1="50%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%"   stopColor={AMBER} />
                        <stop offset="100%" stopColor={STEEL} stopOpacity="0.9" />
                    </linearGradient>

                    {/* Right wing: mirrors — amber at peak, steel at foot */}
                    <linearGradient id="mmRightWing" x1="50%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%"   stopColor={AMBER} />
                        <stop offset="100%" stopColor={STEEL} stopOpacity="0.9" />
                    </linearGradient>

                    {/* Subtle glow behind the M */}
                    <filter id="mmGlow" x="-25%" y="-25%" width="150%" height="150%">
                        <feGaussianBlur stdDeviation="12" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>

                    {/* Drop shadow for depth */}
                    <filter id="mmShadow" x="-10%" y="-10%" width="120%" height="130%">
                        <feDropShadow dx="0" dy="8" stdDeviation="18" floodColor={NAVY} floodOpacity="0.7" />
                    </filter>
                </defs>

                {/* ── Icon background (icon-only mode) ──────────────────── */}
                {iconOnly && (
                    <>
                        <rect x="0" y="0" width="512" height="512" rx="112" fill={NAVY} />
                        {/* Subtle inner ambient glow */}
                        <circle cx="256" cy="200" r="220" fill={AMBER} fillOpacity="0.06" />
                    </>
                )}

                {/* ── The "M" monogram ──────────────────────────────────── */}
                <g filter="url(#mmShadow)">
                    {/* Left wing  — bottom-left foot → left peak → centre valley */}
                    <path
                        d="M 116,404 L 116,136 L 256,314"
                        fill="none"
                        stroke="url(#mmLeftWing)"
                        strokeWidth="72"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                    {/* Right wing — centre valley → right peak → bottom-right foot */}
                    <path
                        d="M 256,314 L 396,136 L 396,404"
                        fill="none"
                        stroke="url(#mmRightWing)"
                        strokeWidth="72"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </g>

                {/* ── Amber highlight dot at the valley (brand accent) ─── */}
                <circle
                    cx="256" cy="318" r="18"
                    fill={AMBER}
                    style={{ filter: `drop-shadow(0 0 10px ${AMBER})` }}
                />

                {/* ── Wordmark (full logo mode only) ───────────────────── */}
                {!iconOnly && (
                    <g transform="translate(680, 358)">
                        <text
                            x="0"
                            y="0"
                            fontFamily="Inter, system-ui, sans-serif"
                            fontSize="260"
                            fontWeight="600"
                            letterSpacing="-10"
                            fill={TINT}
                        >
                            Mock<tspan fill={AMBER} fontWeight="700">Mate</tspan>
                        </text>
                    </g>
                )}
            </svg>
        </div>
    );
};
