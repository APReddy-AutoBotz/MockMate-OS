import React from 'react';

interface AppContainerProps {
    children: React.ReactNode;
    className?: string;
    mode?: 'dark' | 'light';
    removeGlass?: boolean;
    noPadding?: boolean;
}

/**
 * Design system compliant container that supports surface modes
 * and applies the standard card design rules.
 */
const AppContainer: React.FC<AppContainerProps> = ({
    children,
    className = '',
    mode = 'dark',
    noPadding = false
}) => {
    const baseClasses = mode === 'dark'
        ? 'border-[0.5px] border-white/10 bg-brand-dark/95 rounded-[22px] sm:rounded-[28px] lg:rounded-[32px] shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-3xl'
        : 'border-[0.5px] border-white/20 bg-white/95 rounded-[22px] sm:rounded-[28px] lg:rounded-[32px] shadow-xl backdrop-blur-2xl';

    const paddingClasses = noPadding ? '' : 'p-3 sm:p-5 lg:p-[1.25rem]';

    return (
        <div
            className={`
                ${mode === 'light' ? 'mode-light' : 'mode-dark'}
                ${baseClasses}
                ${paddingClasses}
                transition-all duration-300
                ${className}
            `.trim()}
        >
            {children}
        </div>
    );
};

export default AppContainer;
