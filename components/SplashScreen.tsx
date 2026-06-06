import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Logo } from './icons/Logo';

interface SplashScreenProps {
    onComplete: () => void;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
    const [exiting, setExiting] = useState(false);

    useEffect(() => {
        const exitTimer = setTimeout(() => setExiting(true), 2800);
        const completeTimer = setTimeout(onComplete, 3600);
        return () => {
            clearTimeout(exitTimer);
            clearTimeout(completeTimer);
        };
    }, [onComplete]);

    return (
        <AnimatePresence>
            {!exiting && (
                <motion.div
                    key="splash"
                    exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
                    transition={{ duration: 1.2, ease: [0.32, 0, 0.67, 0] }}
                    className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-ink overflow-hidden"
                >
                    {/* Glowing Core */}
                    <motion.div
                        animate={{
                            scale: [1, 1.05, 1],
                            opacity: [0.5, 0.8, 0.5],
                            boxShadow: [
                                '0 0 40px rgba(255,188,3,0.1)',
                                '0 0 80px rgba(255,188,3,0.3)',
                                '0 0 40px rgba(255,188,3,0.1)'
                            ]
                        }}
                        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute inset-0 bg-brand-primary/5 rounded-full blur-3xl"
                    />

                    <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                            background: 'radial-gradient(circle at 50% 50%, rgba(255,188,3,0.06) 0%, rgba(27,79,114,0.15) 40%, transparent 70%)',
                        }}
                    />

                    {/* Steel Blue structural depth corners */}
                    <div className="absolute top-0 left-0 w-96 h-96 bg-brand-accent/10 rounded-full blur-[120px] pointer-events-none" />
                    <div className="absolute bottom-0 right-0 w-96 h-96 bg-brand-accent/8 rounded-full blur-[100px] pointer-events-none" />

                    {/* Staggered reveal: Icon → Wordmark → Line */}
                    <div className="relative z-10 flex flex-col items-center">

                        {/* STEP 1 — M Monogram Icon fades in with high-end scale */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                        >
                            <Logo iconOnly className="h-16 sm:h-20 w-auto" />
                        </motion.div>

                        {/* STEP 2 — "MockMate" wordmark rises up beneath the icon */}
                        <motion.div
                            className="mt-6 select-none"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.8, duration: 1, ease: [0.16, 1, 0.3, 1] }}
                        >
                            <span
                                className="text-4xl sm:text-5xl font-semibold tracking-tight text-white"
                                style={{ fontFamily: 'Inter, system-ui, sans-serif', letterSpacing: '-0.02em' }}
                            >
                                Mock<span className="text-brand-primary">Mate</span>
                            </span>
                        </motion.div>

                        {/* STEP 3 — Glowing amber progress line sweeps in under the wordmark */}
                        <motion.div
                            className="mt-10 w-48 h-[2px] rounded-full overflow-hidden"
                            style={{ background: 'rgba(255,255,255,0.05)' }}
                            initial={{ opacity: 0, width: 0 }}
                            animate={{ opacity: 1, width: '12rem' }}
                            transition={{ delay: 1.5, duration: 0.8 }}
                        >
                            <motion.div
                                className="h-full rounded-full"
                                style={{
                                    background: 'linear-gradient(to right, transparent, #FFBC03, transparent)',
                                    boxShadow: '0 0 25px 8px rgba(255,188,3,0.6)',
                                }}
                                initial={{ x: '-110%' }}
                                animate={{ x: '110%' }}
                                transition={{ delay: 1.6, duration: 1.5, ease: [0.4, 0, 0.2, 1] }}
                            />
                        </motion.div>

                        {/* STEP 4 — Sky Tint tagline fades in last */}
                        <motion.p
                            className="mt-8 text-[11px] font-medium tracking-[0.18em] uppercase text-brand-tint/70"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 2.2, duration: 0.8 }}
                        >
                            Resume, English, Interview Practice
                        </motion.p>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default SplashScreen;
