
import React from 'react';

interface GlassCardProps {
    children: React.ReactNode;
    className?: string;
}

const GlassCard: React.FC<GlassCardProps> = ({ children, className = '' }) => {
    return (
        <div className={`relative overflow-hidden bg-brand-dark/80 backdrop-blur-3xl border border-white/10 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] rounded-[24px] p-8 w-full ${className}`}>
            {/* Subtle internal gradient border effect */}
            <div className="absolute inset-0 pointer-events-none rounded-[2.5rem] border-t border-white/5 opacity-50" />
            <div className="relative z-10">
                {children}
            </div>
        </div>
    );
};

export default GlassCard;
