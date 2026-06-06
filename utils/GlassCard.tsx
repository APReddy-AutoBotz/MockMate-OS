
import React from 'react';

interface GlassCardProps {
    children: React.ReactNode;
    className?: string;
}

/**
 * GlassCard component. 
 * Note: Using React.createElement instead of JSX to fix compilation errors in a .ts file.
 */
const GlassCard: React.FC<GlassCardProps> = ({ children, className = '' }) => {
    return (
        <div className={`relative overflow-hidden bg-[#0A192F]/40 backdrop-blur-2xl backdrop-saturate-150 border border-white/10 shadow-[0_48px_100px_0_rgba(0,0,0,0.5)] rounded-[1rem] sm:rounded-[2rem] ${className}`}>
            <div className={`absolute inset-0 pointer-events-none rounded-[1rem] sm:rounded-[2rem] border-t border-l border-white/10 opacity-30`} />
            <div className="relative z-10">
                {children}
            </div>
        </div>
    );
};

export default GlassCard;
