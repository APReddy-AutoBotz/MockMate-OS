import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
    auth,
    createUserWithEmailAndPassword,
    isUsingMockAuth,
    signInWithEmailAndPassword,
    signInWithGoogle,
} from '../services/supabaseClient';
import { GoogleIcon } from './icons/SocialIcons';
import { audioService } from '../services/audioService';

interface LoginProps {
    onLoginSuccess: () => void;
    onBack: () => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess, onBack }) => {
    const [mode, setMode] = useState<'signin' | 'signup'>('signin');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<{ code: string; message: string } | null>(null);

    useEffect(() => {
        if (error) setError(null);
    }, [email, password]);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) return;

        setIsLoading(true);
        setError(null);
        audioService.playConfirm();

        try {
            await (mode === 'signup'
                ? createUserWithEmailAndPassword(auth, email, password)
                : signInWithEmailAndPassword(auth, email, password)
            );
            onLoginSuccess();
        } catch (err: any) {
            console.error('Auth error:', err.code || err.message);
            const errorCode = err.code || 'unknown';
            let message = 'Check your email and password and try again.';

            switch (errorCode) {
                case 'auth/email-already-in-use':
                    message = 'This email is already in use.';
                    break;
                case 'auth/weak-password':
                    message = 'Password should be at least 6 characters.';
                    break;
                case 'auth/invalid-credential':
                    message = 'Invalid email or password.';
                    break;
            }
            setError({ code: errorCode, message });
        } finally {
            setIsLoading(false);
        }
    };

    const handleQuickAccess = async () => {
        if (!isUsingMockAuth) return;
        setIsLoading(true);
        audioService.playStart();
        try {
            const guestEmail = 'guest@mockmate.io';
            const guestPass = 'sandbox123';
            try {
                await signInWithEmailAndPassword(auth, guestEmail, guestPass);
            } catch {
                await createUserWithEmailAndPassword(auth, guestEmail, guestPass);
            }
            onLoginSuccess();
        } catch {
            setError({ code: 'quick-access-fail', message: 'Quick access failed. Please try manual login.' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        if (isUsingMockAuth) {
            setError({ code: 'mock/google-disabled', message: 'Use email and password in practice mode.' });
            return;
        }
        setIsLoading(true);
        setError(null);
        audioService.playStart();
        try {
            await signInWithGoogle();
            onLoginSuccess();
        } catch {
            setError({ code: 'auth/google-failed', message: 'Google sign-in failed.' });
        } finally {
            setIsLoading(false);
        }
    };

    const containerVariants = {
        hidden: { opacity: 0, scale: 0.98 },
        visible: {
            opacity: 1,
            scale: 1,
            transition: {
                staggerChildren: 0.1,
                duration: 0.6,
                ease: [0.22, 1, 0.36, 1],
            },
        },
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 10 },
        visible: { opacity: 1, y: 0 },
    };

    return (
        <motion.div
            key="login"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="w-full max-w-[440px] px-4"
        >
            <div className="overflow-hidden rounded-[24px] border border-brand-tint/15 bg-brand-dark/95 shadow-2xl backdrop-blur-2xl">
                {isUsingMockAuth && (
                    <div className="flex items-center justify-center border-b border-brand-tint/10 bg-brand-primary/5 px-8 py-3">
                        <div className="flex items-center gap-3">
                            <div className="h-1.5 w-1.5 rounded-full bg-brand-primary" />
                            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-brand-primary">Practice mode is on</span>
                        </div>
                    </div>
                )}

                <div className="space-y-8 p-8 md:space-y-10 md:p-12">
                    <motion.header variants={itemVariants} className="space-y-3 text-center">
                        <h2 className="text-2xl font-medium tracking-tight text-white md:text-4xl">
                            {mode === 'signin' ? 'Welcome back' : 'Create account'}
                        </h2>
                        <p className="text-sm text-brand-tint">
                            {mode === 'signin' ? 'Sign in to keep practicing' : 'Create your practice account'}
                        </p>
                    </motion.header>

                    <AnimatePresence mode="wait">
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="rounded-xl border border-brand-primary/25 bg-brand-primary/8 p-4"
                            >
                                <p className="text-center text-[11px] font-bold uppercase tracking-[0.12em] text-brand-primary">
                                    {error.message}
                                </p>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <motion.form variants={itemVariants} onSubmit={handleAuth} className="space-y-5 md:space-y-6">
                        <div className="space-y-2">
                            <label className="ml-4 block text-[10px] font-bold uppercase tracking-[0.12em] text-brand-tint">Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full rounded-2xl border border-brand-tint/15 bg-white/[0.03] px-6 py-4 text-base text-white outline-none transition-all placeholder:text-brand-tint/45 focus:border-brand-primary/50 focus:bg-white/[0.05]"
                                placeholder="name@domain.com"
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="ml-4 block text-[10px] font-bold uppercase tracking-[0.12em] text-brand-tint">Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full rounded-2xl border border-brand-tint/15 bg-white/[0.03] px-6 py-4 text-base text-white outline-none transition-all placeholder:text-brand-tint/45 focus:border-brand-primary/50 focus:bg-white/[0.05]"
                                placeholder="Password"
                                required
                            />
                        </div>

                        <div className="flex flex-col gap-4 pt-4">
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full rounded-xl bg-brand-primary py-4 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-dark shadow-lg shadow-brand-primary/10 transition-all active:scale-[0.98] disabled:opacity-40"
                            >
                                {isLoading ? 'Please wait...' : mode === 'signin' ? 'Sign in' : 'Register'}
                            </button>

                            {isUsingMockAuth && (
                                <button
                                    type="button"
                                    onClick={handleQuickAccess}
                                    disabled={isLoading}
                                    className="w-full rounded-xl border border-brand-tint/15 bg-white/5 py-4 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-tint transition-all hover:bg-white/10 hover:text-white active:scale-[0.98]"
                                >
                                    Quick access
                                </button>
                            )}
                        </div>
                    </motion.form>

                    {!isUsingMockAuth && (
                        <motion.div variants={itemVariants} className="space-y-6">
                            <div className="relative flex items-center gap-4">
                                <div className="h-px flex-grow bg-brand-tint/15" />
                                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-brand-tint">or</span>
                                <div className="h-px flex-grow bg-brand-tint/15" />
                            </div>

                            <button
                                onClick={handleGoogleLogin}
                                disabled={isLoading}
                                className="flex w-full items-center justify-center gap-3 rounded-xl bg-white py-4 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-dark transition-all hover:bg-white/90 active:scale-[0.98]"
                            >
                                <GoogleIcon className="h-5 w-5" />
                                Google
                            </button>
                        </motion.div>
                    )}

                    <motion.div variants={itemVariants} className="flex flex-col items-center gap-6 border-t border-brand-tint/10 pt-8">
                        <button
                            onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); }}
                            className="text-[10px] font-bold uppercase tracking-[0.12em] text-brand-primary"
                        >
                            {mode === 'signin' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
                        </button>

                        <button
                            onClick={onBack}
                            className="text-[10px] font-bold uppercase tracking-[0.12em] text-brand-tint transition-colors hover:text-white"
                        >
                            Back
                        </button>
                    </motion.div>
                </div>
            </div>
        </motion.div>
    );
};

export default Login;
