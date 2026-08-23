import { UserProfile } from "./types/ui";

import React, { useCallback, useState, useEffect, useRef, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, FileText, Home, Mic, Users } from 'lucide-react';

import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './contexts/ToastContext';
import MockSession from './components/MockSession';
import SessionPrep from './components/SessionPrep';
import RoleCapture from './components/RoleCapture';
import Hub from './components/Hub';
import AppContainer from './components/AppContainer';
import SplashScreen from './components/SplashScreen';
import SimplifiedReport from './components/SimplifiedReport';
import InterviewOrbit from './components/InterviewOrbit';
import { FinalReport, InterviewSessionContext as SessionContext, InterviewSessionResume, SessionControls, InterviewSetupDraft, ResumeData, createBlankInterviewSetupDraft, createResumeGroundedInterviewDraft, createClearSpeakGroundedInterviewDraft } from "mockmate-shared";
import { createUngroundedResumeInterviewDraft } from './services/interviewSetupService';
import { Logo } from './components/icons/Logo';
import LandingPage from './components/LandingPage';
import Login from './components/Login';
import OnboardingQuestions from './components/OnboardingQuestions';
import GrowthDashboard from './components/GrowthDashboard';
import ClearSpeakDashboard from './components/clearspeak/ClearSpeakDashboard';
import ResumeBuilderFlow from './components/resume/ResumeBuilderFlow';
import CareerContextPanel from './components/CareerContextPanel';
import LegalPage from './components/LegalPage';
import GroundingPreviewModal from './components/GroundingPreviewModal';
import { fetchCareerContext, createGroundingSnapshot, createModuleBridge } from './services/careerContextService';
import { CareerContextItem, GroundingPurpose, CareerContextModule, CareerContextSnapshot, ModuleBridgeSession, GroundingConflict } from 'mockmate-shared';
import SystemStatus from './components/SystemStatus';
import type { ClearSpeakBridgePayload } from './components/clearspeak/types';
import { checkBetaAccess, getCapabilities } from './services/clearSpeakService';
import { saveSessionToHistory } from './services/storageService';
import { audioService } from './services/audioService';
import { auth, signOut } from './services/supabaseClient';
import { clearLocalPracticeData, deleteMyData } from './services/accountService';
import { bindLocalPracticeDataOwner, deleteAppDataThenAttemptSignOut, readLocalUserProfile, signOutPreservingLocalPracticeData } from './services/sessionIsolation';
import { clearActiveInterviewReference, readActiveInterviewReference, saveActiveInterviewReference } from './services/activeInterviewRecovery';
import { getInterviewSession } from './services/mockGeminiService';

// Lazy load heavy components
const LazyGrowthDashboard = React.lazy(() => import('./components/GrowthDashboard'));
const LazyInterviewReport = React.lazy(() => import('./components/InterviewReport'));
const LazyMockSession = React.lazy(() => import('./components/MockSession'));

type AppState = 'SPLASH' | 'LOADING' | 'LANDING' | 'LOGIN' | 'ONBOARDING' | 'HUB' | 'ROLE_SELECTION' | 'CONTEXT_UPLOAD' | 'SESSION_ACTIVE' | 'REPORT_VIEW' | 'HISTORY_VIEW' | 'CLEARSPEAK' | 'RESUME_BUILDER' | 'CAREER_CONTEXT' | 'PRIVACY' | 'TERMS';

type MobileTabId = 'home' | 'resume' | 'speak' | 'interview' | 'journal';

const MOBILE_TABS: Array<{ id: MobileTabId; label: string; icon: React.ElementType }> = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'resume', label: 'Resume', icon: FileText },
    { id: 'speak', label: 'Speak', icon: Mic },
    { id: 'interview', label: 'Interview', icon: Users },
    { id: 'journal', label: 'Journal', icon: BookOpen },
];

const App: React.FC = () => {
    const [appState, setAppState] = useState<AppState>('SPLASH');
    const [showSplash, setShowSplash] = useState(true);
    const [sessionContext, setSessionContext] = useState<SessionContext | null>(null);
    const [restoredInterview, setRestoredInterview] = useState<InterviewSessionResume | null>(null);
    const [finalReport, setFinalReport] = useState<FinalReport | null>(null);
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [setupDraft, setSetupDraft] = useState<InterviewSetupDraft | null>(null);
    const [betaEnabled, setBetaEnabled] = useState(false);
    const [clearSpeakStandardSessionAvailable, setClearSpeakStandardSessionAvailable] = useState(false);
    const [clearSpeakCommitInFlight, setClearSpeakCommitInFlight] = useState(false);
    const [authActionError, setAuthActionError] = useState('');
    const [pendingGroundingLaunch, setPendingGroundingLaunch] = useState<{
        purpose: GroundingPurpose;
        sourceModules: CareerContextModule[];
        targetModule: CareerContextModule;
        items: CareerContextItem[];
        conflicts: GroundingConflict[];
        snapshotClientRequestId: string;
        bridgeClientRequestId: string;
        ownerId: string;
        authEpoch: number;
        launchToken: number;
        isSubmitting: boolean;
        onSuccess: (snapshot: CareerContextSnapshot, bridge?: ModuleBridgeSession) => void;
        onSkip: () => void;
    } | null>(null);
    const [clearSpeakGrounding, setClearSpeakGrounding] = useState<{ snapshot: CareerContextSnapshot; bridge: ModuleBridgeSession } | null>(null);
    const authenticatedOwnerRef = useRef<string | null>(null);
    const authEpochRef = useRef(0);
    const groundingLaunchTokenRef = useRef(0);
    const groundingSubmissionRef = useRef<number | null>(null);

    const clearSensitiveReactState = useCallback(() => {
        groundingLaunchTokenRef.current += 1;
        groundingSubmissionRef.current = null;
        setUserProfile(null);
        setSessionContext(null);
        setRestoredInterview(null);
        setFinalReport(null);
        setSetupDraft(null);
        setPendingGroundingLaunch(null);
        setClearSpeakGrounding(null);
        setClearSpeakCommitInFlight(false);
        setBetaEnabled(false);
        setClearSpeakStandardSessionAvailable(false);
    }, []);

    const authContextIsCurrent = useCallback((ownerId: string, epoch: number) => (
        authenticatedOwnerRef.current === ownerId && authEpochRef.current === epoch
    ), []);

    useEffect(() => {
        // Use the auth listener to determine starting state
        let active = true;
        const unsubscribe = auth.onAuthStateChanged(async (user: any) => {
            const epoch = ++authEpochRef.current;
            if (user) {
                const userId = String(user.id || user.uid || '');
                // Legacy web storage was not user-scoped. Fail closed on the
                // first upgraded login and whenever the authenticated owner
                // changes, then bind all new local data to this identity.
                if (!userId) {
                    authenticatedOwnerRef.current = null;
                    clearSensitiveReactState();
                    const localDataCleared = clearLocalPracticeData();
                    setAuthActionError('Your signed-in identity could not be verified. Please sign in again.');
                    if (!localDataCleared) {
                        setAuthActionError('Your signed-in identity could not be verified, and browser storage is unavailable. Please sign in again.');
                    }
                    setAppState('LANDING');
                    return;
                }
                const previousOwner = authenticatedOwnerRef.current;
                const ownerBinding = bindLocalPracticeDataOwner(userId);
                if (previousOwner !== userId || ownerBinding !== 'preserved') clearSensitiveReactState();
                authenticatedOwnerRef.current = userId;
                if (ownerBinding === 'storage_unavailable') {
                    setAuthActionError('Browser storage is unavailable. You can continue, but local profile, recovery, and journal updates will not be saved.');
                } else {
                    setAuthActionError('');
                }

                const enabled = await checkBetaAccess();
                let standardSessionAvailable = false;
                if (enabled) {
                    try {
                        standardSessionAvailable = (await getCapabilities()).standardSessionScoringAvailable;
                    } catch {
                        // A grounded Resume -> ClearSpeak handoff must fail closed
                        // unless the server explicitly advertises scored delivery.
                    }
                }
                if (!active || !authContextIsCurrent(userId, epoch)) return;
                setBetaEnabled(enabled);
                setClearSpeakStandardSessionAvailable(standardSessionAvailable);
                const requestedAction = new URLSearchParams(window.location.search).get('action');
                const storedProfile = ownerBinding === 'storage_unavailable' ? null : readLocalUserProfile();
                if (storedProfile) {
                    setUserProfile(storedProfile);
                    if (!requestedAction) {
                        const activeReference = readActiveInterviewReference();
                        if (activeReference) {
                            try {
                                const recovered = await getInterviewSession(activeReference.sessionId);
                                if (!active || !authContextIsCurrent(userId, epoch)) return;
                                setSessionContext(recovered.context);
                                if (recovered.status === 'completed' && recovered.report) {
                                    clearActiveInterviewReference();
                                    setRestoredInterview(null);
                                    if (!saveSessionToHistory(
                                        recovered.report,
                                        recovered.context.candidateRole,
                                        recovered.context.sessionType,
                                        recovered.id,
                                    )) {
                                        setAuthActionError('Your completed interview was restored, but browser storage could not update the local journal.');
                                    }
                                    setFinalReport(recovered.report);
                                    setAppState('REPORT_VIEW');
                                    return;
                                }
                                if (recovered.status === 'active' && !recovered.pendingQuestion) {
                                    clearActiveInterviewReference();
                                    setAuthActionError('The saved interview no longer has a question to resume. Start a new interview when you are ready.');
                                } else if (recovered.status === 'active' || recovered.status === 'awaiting_report') {
                                    setRestoredInterview(recovered);
                                    setAppState('SESSION_ACTIVE');
                                    return;
                                } else if (recovered.status === 'completed') {
                                    clearActiveInterviewReference();
                                    setAuthActionError('The saved interview is complete, but its report could not be restored. Start a new interview or check your practice journal.');
                                }
                                clearActiveInterviewReference();
                            } catch (error: any) {
                                if (error?.status === 404 || error?.status === 422) clearActiveInterviewReference();
                                else setAuthActionError('Your active interview could not be restored yet. Check your connection and reload to retry.');
                            }
                        }
                    }
                    if (requestedAction === 'interview') setAppState('ROLE_SELECTION');
                    else if (requestedAction === 'speaking' && enabled) setAppState('CLEARSPEAK');
                    else if (requestedAction === 'resume') setAppState('RESUME_BUILDER');
                    else setAppState('HUB');
                } else {
                    // Logged in but no profile -> Go to onboarding
                    setUserProfile({
                      name: user.displayName || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Candidate',
                      experienceLevel: 'mid',
                      primaryGoal: 'skill_building',
                    });
                    setAppState('ONBOARDING');
                }
            } else {
                if (!active || epoch !== authEpochRef.current) return;
                authenticatedOwnerRef.current = null;
                clearSensitiveReactState();
                setAppState('LANDING');
            }
        });
        return () => { active = false; unsubscribe(); };
    }, [authContextIsCurrent, clearSensitiveReactState]);

    useEffect(() => {
        if (!clearSpeakCommitInFlight) return;
        const protectScoreCommit = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', protectScoreCommit);
        return () => window.removeEventListener('beforeunload', protectScoreCommit);
    }, [clearSpeakCommitInFlight]);

    const canLeaveClearSpeak = useCallback(() => {
        if (appState !== 'CLEARSPEAK' || !clearSpeakCommitInFlight) return true;
        setAuthActionError('Your recording is still being scored. Wait for the result before leaving speaking practice.');
        return false;
    }, [appState, clearSpeakCommitInFlight]);

    const handleSplashComplete = () => {
        setShowSplash(false);
        // If appState was SPLASH, the useEffect with auth listener should have already
        // determined if we move to LANDING, ROLE_SELECTION etc.
        // If it's still SPLASH, it means auth check isn't done, so we wait or default to LOADING/LANDING.
        if (appState === 'SPLASH') setAppState('LOADING');
    };

    const handleGetStarted = () => {
        audioService.playConfirm();
        setAppState('LOGIN');
    };
    const handleLogin = () => {
        audioService.playStart();
        // The useEffect will handle the state shift based on onAuthStateChanged
    };
    const handleBackToLanding = () => setAppState('LANDING');
    const handleOpenPrivacy = () => setAppState('PRIVACY');
    const handleOpenTerms = () => setAppState('TERMS');

    const handleOnboardingComplete = (profile: UserProfile, targetRole: string) => {
        audioService.playConfirm();
        const enrichedProfile: UserProfile = {
            ...profile,
            targetRole: targetRole || undefined
        };
        try {
            localStorage.setItem('mockmate_user_profile', JSON.stringify(enrichedProfile));
        } catch (error) {
            console.error("Failed to save user profile", error);
            setAuthActionError('Your profile is available for this session, but browser storage could not save it locally.');
        }
        setUserProfile(enrichedProfile);
        setAppState('HUB');
    };

    const handleLogout = async () => {
        if (!canLeaveClearSpeak()) return;
        setAuthActionError('');
        try {
            await signOutPreservingLocalPracticeData(() => signOut(auth));
        } catch (error) {
            console.error("Failed to logout", error);
            setAuthActionError('Sign out did not finish. You are still signed in; check your connection and retry.');
            return;
        }
        authEpochRef.current += 1;
        authenticatedOwnerRef.current = null;
        clearSensitiveReactState();
        setAppState('LANDING');
    };

    const handleDeleteData = async (): Promise<{ cleanupWarning?: string }> => {
        const outcome = await deleteAppDataThenAttemptSignOut(
            () => deleteMyData(),
            () => signOut(auth),
        );
        authEpochRef.current += 1;
        clearSensitiveReactState();
        if (outcome.signedOut) {
            authenticatedOwnerRef.current = null;
            setAppState('LANDING');
            if (!outcome.localDataCleared) {
                const cleanupWarning = 'Your app data was deleted and you are signed out, but browser storage could not be cleared. Clear this site’s storage before another person signs in.';
                setAuthActionError(cleanupWarning);
                return { cleanupWarning };
            }
            return {};
        }
        const cleanupWarning = outcome.localDataCleared
            ? 'Your MockMate app data was deleted, but sign out did not finish. You are still signed in; retry Sign out.'
            : 'Your MockMate app data was deleted, but sign out and browser cleanup did not finish. You are still signed in; retry Sign out, then clear this site’s storage.';
        setAuthActionError(cleanupWarning);
        setAppState('HUB');
        return { cleanupWarning };
    };

    const handleRoleSubmit = (intent: string, sessionType: 'structured' | 'conversational') => {
        audioService.playConfirm();
        clearActiveInterviewReference();
        setRestoredInterview(null);
        const draft = createBlankInterviewSetupDraft(intent, intent, sessionType);
        setSetupDraft(draft);
        setAppState('CONTEXT_UPLOAD');
    };

    const handleContextReady = (context: SessionContext) => {
        audioService.playStart();
        setRestoredInterview(null);
        setSessionContext(context);
        setAppState('SESSION_ACTIVE');
    }

    const handleReportGenerated = (report: FinalReport, serverSessionId?: string) => {
        audioService.playNotify();
        clearActiveInterviewReference();
        setRestoredInterview(null);
        if (sessionContext) {
            if (!saveSessionToHistory(report, sessionContext.candidateRole, sessionContext.sessionType, serverSessionId)) {
                setAuthActionError('Your report is ready, but browser storage could not update the local journal.');
            }
        }
        setFinalReport(report);
        setAppState('REPORT_VIEW');
    };

    const handleRestart = () => {
        if (!canLeaveClearSpeak()) return;
        audioService.playConfirm();
        setAppState('HUB');
        setSetupDraft(null);
        setSessionContext(null);
        setFinalReport(null);
    }

    const handleGoBack = () => {
        if (appState === 'CONTEXT_UPLOAD') {
            setAppState('HUB');
            setSetupDraft(null);
            setSessionContext(null);
        }
    };

    const handleCancelSession = () => {
        audioService.playEnd();
        if (appState === 'SESSION_ACTIVE') {
            if (sessionContext?.sessionType === 'structured') {
                setAppState('CONTEXT_UPLOAD');
            } else {
                setAppState('HUB');
                setSetupDraft(null);
                setSessionContext(null);
            }
        }
    };

    const toggleHistory = () => {
        if (!canLeaveClearSpeak()) return;
        audioService.playConfirm();
        if (appState === 'HISTORY_VIEW') {
            setAppState('HUB');
        } else {
            setAppState('HISTORY_VIEW');
        }
    }

    const toggleClearSpeak = () => {
        if (!betaEnabled) return;
        if (!canLeaveClearSpeak()) return;
        audioService.playConfirm();
        if (appState === 'CLEARSPEAK') {
            setAppState('HUB');
        } else {
            setAppState('CLEARSPEAK');
        }
    };

    const toggleResumeBuilder = () => {
        if (!canLeaveClearSpeak()) return;
        audioService.playConfirm();
        if (appState === 'RESUME_BUILDER') {
            setAppState('HUB');
        } else {
            setAppState('RESUME_BUILDER');
        }
    };

    const handleHubNavigate = (module: 'RESUME' | 'SPEAK' | 'INTERVIEW') => {
        audioService.playConfirm();
        if (module === 'RESUME') setAppState('RESUME_BUILDER');
        if (module === 'SPEAK' && betaEnabled) setAppState('CLEARSPEAK');
        if (module === 'INTERVIEW') setAppState('ROLE_SELECTION');
    };

    const triggerGroundedLaunch = async (
        purpose: GroundingPurpose,
        sourceModules: CareerContextModule[],
        targetModule: CareerContextModule,
        onSuccess: (snapshot: CareerContextSnapshot, bridge?: ModuleBridgeSession) => void,
        onSkip: () => void
    ) => {
        const ownerId = authenticatedOwnerRef.current;
        const authEpoch = authEpochRef.current;
        if (!ownerId) return;
        const launchToken = ++groundingLaunchTokenRef.current;
        try {
            const contextData = await fetchCareerContext();
            if (!authContextIsCurrent(ownerId, authEpoch) || groundingLaunchTokenRef.current !== launchToken) return;
            const activeItems = (contextData.activeItems || []).filter(i => i.status === 'active' && i.sensitivity !== 'personal_contact' && sourceModules.includes(i.source.module));
            if (activeItems.length === 0) {
                onSkip();
                return;
            }
            setPendingGroundingLaunch({
                purpose,
                sourceModules,
                targetModule,
                items: activeItems,
                conflicts: (contextData.conflicts || []).filter(c => c.competingItemIds.some(id => activeItems.some(i => i.id === id))),
                // These identify the logical launch, not server-owned artifacts. Keep
                // them stable until that launch succeeds or the user cancels it so a
                // lost HTTP response recovers the canonical snapshot/bridge.
                snapshotClientRequestId: `req_snap_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                bridgeClientRequestId: `req_br_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                ownerId,
                authEpoch,
                launchToken,
                isSubmitting: false,
                onSuccess,
                onSkip,
            });
        } catch (err) {
            console.error('[Grounding Launch] Authoritative context could not be loaded; grounded launch aborted:', err);
        }
    };

    const handleModalConfirm = async (selectedItemIds: string[], scope: 'one_time', conflictSelections: Record<string, string>) => {
        const launch = pendingGroundingLaunch;
        if (
            !launch
            || launch.isSubmitting
            || groundingSubmissionRef.current !== null
            || !authContextIsCurrent(launch.ownerId, launch.authEpoch)
            || groundingLaunchTokenRef.current !== launch.launchToken
        ) return;
        groundingSubmissionRef.current = launch.launchToken;
        setPendingGroundingLaunch(current => current?.launchToken === launch.launchToken
            ? { ...current, isSubmitting: true }
            : current);
        const { purpose, sourceModules, targetModule, items, snapshotClientRequestId, bridgeClientRequestId, onSuccess } = launch;
        const excludedItemIds = items.filter(i => !selectedItemIds.includes(i.id)).map(i => i.id);

        try {
            const snapshotRes = await createGroundingSnapshot({
                purpose,
                includedItemIds: selectedItemIds,
                excludedItemIds,
                conflictSelections,
                consent: {
                    scope,
                    purpose,
                    includedItemIds: selectedItemIds,
                    excludedItemIds,
                    sourceModules,
                    acknowledgedAt: new Date().toISOString(),
                },
                clientRequestId: snapshotClientRequestId,
            });
            if (
                !authContextIsCurrent(launch.ownerId, launch.authEpoch)
                || groundingLaunchTokenRef.current !== launch.launchToken
                || groundingSubmissionRef.current !== launch.launchToken
            ) return;

            const bridgeRes = await createModuleBridge({
                sourceModule: sourceModules[0],
                targetModule,
                purpose,
                snapshotId: snapshotRes.snapshot.id,
                clientRequestId: bridgeClientRequestId,
            });
            if (
                !authContextIsCurrent(launch.ownerId, launch.authEpoch)
                || groundingLaunchTokenRef.current !== launch.launchToken
                || groundingSubmissionRef.current !== launch.launchToken
            ) return;

            groundingLaunchTokenRef.current += 1;
            groundingSubmissionRef.current = null;
            setPendingGroundingLaunch(null);
            onSuccess(snapshotRes.snapshot, bridgeRes.bridge);
        } catch (err: any) {
            console.error('[Grounding Launch] Failed to create grounding snapshot/bridge:', err);
            // An explicit grounded launch is fail-closed. Keep the consent modal
            // open so retry/cancel remains the user's decision; never downgrade it.
            if (
                authContextIsCurrent(launch.ownerId, launch.authEpoch)
                && groundingLaunchTokenRef.current === launch.launchToken
            ) {
                setAuthActionError('Grounded practice could not be prepared. Retry or close the context selection.');
            }
        } finally {
            if (groundingSubmissionRef.current === launch.launchToken) groundingSubmissionRef.current = null;
            setPendingGroundingLaunch(current => current?.launchToken === launch.launchToken
                ? { ...current, isSubmitting: false }
                : current);
        }
    };

    const closeGroundingLaunch = () => {
        const launch = pendingGroundingLaunch;
        if (!launch || launch.isSubmitting || groundingSubmissionRef.current === launch.launchToken) return;
        groundingLaunchTokenRef.current += 1;
        setPendingGroundingLaunch(null);
    };

    const skipGroundingLaunch = () => {
        const launch = pendingGroundingLaunch;
        if (
            !launch
            || launch.isSubmitting
            || groundingSubmissionRef.current === launch.launchToken
            || !authContextIsCurrent(launch.ownerId, launch.authEpoch)
        ) return;
        groundingLaunchTokenRef.current += 1;
        setPendingGroundingLaunch(null);
        launch.onSkip();
    };

    const handleInterviewBridge = (payload: ClearSpeakBridgePayload) => {
        const ROLE_MAP: Record<ClearSpeakBridgePayload['role'], string> = {
            business_analyst:  'Business Analyst',
            project_manager:   'Project Manager',
            general_corporate: 'Corporate Professional',
        };
        const role = ROLE_MAP[payload.role] ?? 'Business Professional';

        triggerGroundedLaunch(
            'clearspeak_to_interview',
            ['clearspeak'],
            'interview',
            (snapshot, bridge) => {
                audioService.playStart();
                const draft = createClearSpeakGroundedInterviewDraft(snapshot.id, bridge?.id || snapshot.id, role, payload.bridgeQuestion);
                setSetupDraft(draft);
                setAppState('CONTEXT_UPLOAD');
            },
            () => {
                audioService.playStart();
                const draft = createBlankInterviewSetupDraft(role, 'General corporate speaking practice.');
                setSetupDraft(draft);
                setAppState('CONTEXT_UPLOAD');
            }
        );
    };

    const handleResumeSpeakBridge = (_summary: string) => {
        if (!betaEnabled || !clearSpeakStandardSessionAvailable) {
            setAuthActionError('Grounded speaking practice is not available in this preview. Your resume was not shared and no practice bridge was created.');
            return;
        }
        triggerGroundedLaunch(
            'resume_to_clearspeak',
            ['resume'],
            'clearspeak',
            (snapshot, bridge) => {
                if (!bridge) throw new Error('Authoritative ClearSpeak bridge was not created');
                audioService.playStart();
                setClearSpeakGrounding({ snapshot, bridge });
                setAppState('CLEARSPEAK');
            },
            () => {
                audioService.playStart();
                setAppState('CLEARSPEAK');
            }
        );
    };

    const handleResumeInterviewBridge = (jdText: string, resumeData: ResumeData) => {
        const targetRole = userProfile?.targetRole || 'Software Professional';
        const intentText = jdText || 'General interview based on my resume.';

        triggerGroundedLaunch(
            'resume_to_interview',
            ['resume'],
            'interview',
            (snapshot, bridge) => {
                audioService.playStart();
                const draft = createResumeGroundedInterviewDraft(snapshot.id, bridge?.id || snapshot.id, targetRole, intentText);
                if (jdText) draft.jdText = jdText;
                setSetupDraft(draft);
                setAppState('CONTEXT_UPLOAD');
            },
            () => {
                audioService.playStart();
                const draft = createUngroundedResumeInterviewDraft(targetRole, intentText, jdText);
                setSetupDraft(draft);
                setAppState('CONTEXT_UPLOAD');
            }
        );
    };

    const pageAnimation = {
        initial: false,
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -4 },
        transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] as any }
    };

    const headerAnimation = {
        initial: false,
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] as any }
    }

    const getActiveMobileTab = (): MobileTabId => {
        if (appState === 'RESUME_BUILDER') return 'resume';
        if (appState === 'CLEARSPEAK') return 'speak';
        if (appState === 'ROLE_SELECTION' || appState === 'CONTEXT_UPLOAD') return 'interview';
        if (appState === 'HISTORY_VIEW' || appState === 'REPORT_VIEW') return 'journal';
        return 'home';
    };

    const handleMobileTabClick = (tabId: MobileTabId) => {
        if (!canLeaveClearSpeak()) return;
        audioService.playConfirm();
        if (tabId === 'home') {
            handleRestart();
            return;
        }
        if (tabId === 'resume') {
            setAppState('RESUME_BUILDER');
            return;
        }
        if (tabId === 'speak') {
            if (betaEnabled) setAppState('CLEARSPEAK');
            return;
        }
        if (tabId === 'interview') {
            setSessionContext(null);
            setFinalReport(null);
            setAppState('ROLE_SELECTION');
            return;
        }
        setAppState('HISTORY_VIEW');
    };


    const renderPageContent = () => {
        switch (appState) {
            case 'LOADING':
                return null;
            case 'LANDING':
                return (
                    <ErrorBoundary>
                        <LandingPage
                            onGetStarted={handleGetStarted}
                            onOpenPrivacy={handleOpenPrivacy}
                            onOpenTerms={handleOpenTerms}
                        />
                    </ErrorBoundary>
                );
            case 'PRIVACY':
                return (
                    <ErrorBoundary>
                        <LegalPage type="privacy" onBack={handleBackToLanding} />
                    </ErrorBoundary>
                );
            case 'TERMS':
                return (
                    <ErrorBoundary>
                        <LegalPage type="terms" onBack={handleBackToLanding} />
                    </ErrorBoundary>
                );
            case 'LOGIN':
                return (
                    <ErrorBoundary>
                        <Login onLoginSuccess={handleLogin} onBack={handleBackToLanding} />
                    </ErrorBoundary>
                );
            case 'ONBOARDING':
                return (
                    <ErrorBoundary>
                        <OnboardingQuestions onComplete={handleOnboardingComplete} />
                    </ErrorBoundary>
                );
            case 'HUB':
                return (
                    <motion.div key="hub" {...pageAnimation} className="w-full">
                        <ErrorBoundary>
                            <Hub
                                userProfile={userProfile}
                                 betaEnabled={betaEnabled}
                                onNavigate={handleHubNavigate}
                                onViewHistory={toggleHistory}
                                onOpenCareerContext={() => setAppState('CAREER_CONTEXT')}
                                onDeleteData={handleDeleteData}
                            />
                        </ErrorBoundary>
                    </motion.div>
                );
            case 'ROLE_SELECTION':
                return (
                    <motion.div key="role" {...pageAnimation} className="w-full max-w-7xl px-0 sm:px-4">
                        <AppContainer>
                            <ErrorBoundary>
                                <RoleCapture
                                    userProfile={userProfile}
                                    onRoleSubmit={handleRoleSubmit}
                                    onBack={handleLogout}
                                    onViewHistory={toggleHistory}
                                />
                            </ErrorBoundary>
                        </AppContainer>
                    </motion.div>
                );
            case 'HISTORY_VIEW':
                return (
                    <motion.div key="history" {...pageAnimation} className="w-full max-w-5xl px-0 sm:px-4">
                        <Suspense fallback={
                            <div className="flex items-center justify-center p-8">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
                            </div>
                        }>
                            <ErrorBoundary>
                                <LazyGrowthDashboard
                                    onBack={toggleHistory}
                                    onViewReport={(report) => {
                                        setFinalReport(report);
                                        setAppState('REPORT_VIEW');
                                    }}
                                />
                            </ErrorBoundary>
                        </Suspense>
                    </motion.div>
                );
            case 'CONTEXT_UPLOAD':
                return (
                    <motion.div key="context" {...pageAnimation} className="w-full max-w-5xl px-0 sm:px-4">
                        <AppContainer>
                            <ErrorBoundary>
                                <SessionPrep
                                    onContextReady={handleContextReady}
                                    draft={setupDraft!}
                                    onGoBack={handleGoBack}
                                />
                            </ErrorBoundary>
                        </AppContainer>
                    </motion.div>
                );
            case 'SESSION_ACTIVE':
                return (
                    <div className="fixed inset-0 z-50 h-dvh w-full bg-ink">
                        <Suspense fallback={
                            <div className="flex items-center justify-center h-full">
                                <div className="text-white text-lg">Loading interview session...</div>
                            </div>
                        }>
                            <ErrorBoundary>
                                <LazyMockSession
                                    sessionContext={sessionContext!}
                                    restoredSession={restoredInterview}
                                    onSessionStarted={(sessionId) => {
                                        if (!saveActiveInterviewReference(sessionId)) {
                                            setAuthActionError('This interview is active, but browser storage could not save a recovery reference. Keep this tab open.');
                                        }
                                        setRestoredInterview(null);
                                    }}
                                    onReportGenerated={handleReportGenerated}
                                    onCancel={handleCancelSession}
                                />
                            </ErrorBoundary>
                        </Suspense>
                    </div>
                );
            case 'REPORT_VIEW':
                return (
                    <motion.div key="report" {...pageAnimation} className="w-full max-w-5xl px-0 sm:px-4">
                        <Suspense fallback={
                            <div className="flex items-center justify-center p-8">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
                                <div className="ml-4 text-white text-lg">Generating report...</div>
                            </div>
                        }>
                            <ErrorBoundary>
                                {finalReport && (
                                    <LazyInterviewReport
                                        report={finalReport}
                                        onRestart={handleRestart}
                                        userProfile={userProfile}
                                        sessionId={(sessionContext as any)?.sessionId || undefined}
                                    />
                                )}
                            </ErrorBoundary>
                        </Suspense>
                    </motion.div>
                );
            case 'CLEARSPEAK':
                if (!betaEnabled) {
                    return (
                        <div className="mx-auto flex min-h-[45dvh] max-w-lg flex-col items-center justify-center gap-5 text-center">
                            <h1 className="text-3xl font-semibold text-white">Speaking coach is not enabled</h1>
                            <p className="text-brand-tint">This controlled beta is available only to approved tester accounts.</p>
                            <button type="button" onClick={() => setAppState('HUB')} className="rounded-xl bg-brand-primary px-6 py-3 font-bold text-brand-dark">Back to practice home</button>
                        </div>
                    );
                }
                return (
                    <motion.div key="clearspeak" {...pageAnimation} className="w-full max-w-2xl px-0 sm:px-4">
                        <ErrorBoundary>
                            <ClearSpeakDashboard
                                onInterviewBridge={handleInterviewBridge}
                                onScoreCommitStateChange={setClearSpeakCommitInFlight}
                                grounding={clearSpeakGrounding || undefined}
                                onGroundingConsumed={(bridgeId) => {
                                    // A Resume -> ClearSpeak authorization is single use. Clear it
                                    // only after the child has received the canonical completed
                                    // score (including a response-loss replay), and never merely
                                    // because the user navigated or generation started.
                                    setClearSpeakGrounding(current => current?.bridge.id === bridgeId ? null : current);
                                }}
                            />
                        </ErrorBoundary>
                    </motion.div>
                );
            case 'RESUME_BUILDER':
                return (
                    <motion.div key="resume" {...pageAnimation} className="w-full max-w-7xl px-0 sm:px-4">
                        <ErrorBoundary>
                            <ResumeBuilderFlow
                                onSpeakBridge={handleResumeSpeakBridge}
                                onInterviewBridge={handleResumeInterviewBridge}
                                speakingPracticeAvailable={betaEnabled && clearSpeakStandardSessionAvailable}
                            />
                        </ErrorBoundary>
                    </motion.div>
                );
            case 'CAREER_CONTEXT':
                return (
                    <motion.div key="career_context" {...pageAnimation} className="w-full max-w-5xl px-0 sm:px-4">
                        <ErrorBoundary>
                            <CareerContextPanel onBack={handleRestart} />
                        </ErrorBoundary>
                    </motion.div>
                );
            default:
                return null;
        }
    }

    const showAppHeader = appState !== 'LANDING' && appState !== 'LOGIN' && appState !== 'ONBOARDING' && appState !== 'LOADING' && appState !== 'SESSION_ACTIVE' && appState !== 'PRIVACY' && appState !== 'TERMS';
    const showMobileTabs = showAppHeader;
    const activeMobileTab = getActiveMobileTab();


    return (
        <ErrorBoundary>
            <ToastProvider>
                <div className="flex min-h-dvh w-full flex-col overflow-x-hidden bg-brand-navy">
                    <AnimatePresence>
                        {showSplash && <SplashScreen onComplete={handleSplashComplete} />}
                    </AnimatePresence>

                    {showSplash ? null : (
                        <>
                            {showAppHeader && (
                                <motion.header {...headerAnimation} className="fixed left-0 top-0 z-40 flex w-full items-center justify-between px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:px-8 lg:px-12 lg:pb-0 lg:pt-10 pointer-events-none">
                                    <button type="button" onClick={handleRestart} aria-label="Go to practice home" className="cursor-pointer transition-transform hover:scale-[1.02] pointer-events-auto">
                                        <Logo className="h-10 w-auto sm:h-12 lg:h-16" />
                                    </button>
                                    <div className="hidden items-center gap-8 pointer-events-auto lg:flex">
                                        {/* Nav links hidden on HUB — the cards themselves are the navigation */}
                                        {appState !== 'HUB' && (
                                            <>
                                                {betaEnabled && (
                                                    <button
                                                        id="nav-speak"
                                                        onClick={toggleClearSpeak}
                                                        className={`text-[9px] sm:text-[11px] font-bold uppercase tracking-widest transition-colors ${
                                                            appState === 'CLEARSPEAK'
                                                                ? 'text-brand-primary'
                                                                : 'text-white/70 hover:text-white'
                                                        }`}
                                                    >
                                                        Speak
                                                    </button>
                                                )}
                                                <button
                                                    onClick={toggleResumeBuilder}
                                                    className={`text-[9px] sm:text-[11px] font-bold uppercase tracking-widest transition-colors ${
                                                        appState === 'RESUME_BUILDER'
                                                            ? 'text-brand-primary'
                                                            : 'text-white/50 hover:text-white'
                                                    }`}
                                                >
                                                    Resume
                                                </button>
                                                <button
                                                    onClick={toggleHistory}
                                                    className="text-[9px] sm:text-[11px] font-bold text-white/50 hover:text-white uppercase tracking-widest transition-colors"
                                                >
                                                    Journal
                                                </button>
                                            </>
                                        )}
                                        <button
                                            onClick={handleLogout}
                                            className="text-[8px] sm:text-[10px] font-bold bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-lg sm:rounded-xl px-3 sm:px-6 py-2 sm:py-3 transition-all backdrop-blur-md uppercase tracking-widest"
                                        >
                                            {appState === 'HUB' ? 'Sign Out' : 'End Session'}
                                        </button>
                                    </div>
                                    <button
                                        onClick={handleLogout}
                                        className="pointer-events-auto rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-white backdrop-blur-md transition-all hover:bg-white/10 lg:hidden"
                                    >
                                        {appState === 'HUB' ? 'Sign out' : 'Exit'}
                                    </button>
                                </motion.header>
                            )}
                            <main
                                className={`relative z-10 flex w-full flex-1 flex-col items-center overflow-x-hidden px-3 sm:px-4 ${
                                    showAppHeader
                                        ? 'pb-[calc(env(safe-area-inset-bottom)+6.5rem)] pt-[calc(env(safe-area-inset-top)+5.5rem)] sm:pt-24 lg:pb-6 lg:pt-36'
                                        : 'p-0'
                                }`}
                            >
                                <AnimatePresence mode="wait">
                                    {renderPageContent()}
                                </AnimatePresence>
                            </main>
                            {authActionError && (
                                <div role="alert" className="fixed left-1/2 top-24 z-[80] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 rounded-xl border border-amber-300/30 bg-brand-dark px-5 py-4 text-sm text-amber-100 shadow-2xl">
                                    {authActionError}
                                </div>
                            )}
                            {showMobileTabs && (
                                <nav className="fixed bottom-0 left-0 z-40 w-full border-t border-white/10 bg-brand-dark/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 shadow-[0_-20px_50px_rgba(0,0,0,0.4)] backdrop-blur-2xl lg:hidden" aria-label="Primary">
                                    <div className={`mx-auto grid max-w-md gap-1 ${betaEnabled ? 'grid-cols-5' : 'grid-cols-4'}`}>
                                        {MOBILE_TABS.filter(tab => betaEnabled || tab.id !== 'speak').map((tab) => {
                                            const Icon = tab.icon;
                                            const isActive = activeMobileTab === tab.id;
                                            return (
                                                <button
                                                    key={tab.id}
                                                    type="button"
                                                    data-testid={`mobile-tab-${tab.id}`}
                                                    onClick={() => handleMobileTabClick(tab.id)}
                                                    className={`flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[10px] font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark ${
                                                        isActive
                                                            ? 'bg-brand-primary text-brand-dark shadow-[0_12px_28px_-18px_rgba(255,188,3,0.9)]'
                                                            : 'text-brand-tint hover:bg-white/5 hover:text-white'
                                                    }`}
                                                    aria-current={isActive ? 'page' : undefined}
                                                >
                                                    <Icon className="h-5 w-5" aria-hidden="true" />
                                                    <span className="leading-none">{tab.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </nav>
                            )}
                            {pendingGroundingLaunch
                                && pendingGroundingLaunch.ownerId === authenticatedOwnerRef.current
                                && pendingGroundingLaunch.authEpoch === authEpochRef.current
                                && (
                                <GroundingPreviewModal
                                    purpose={pendingGroundingLaunch.purpose}
                                    items={pendingGroundingLaunch.items}
                                    conflicts={pendingGroundingLaunch.conflicts}
                                    onConfirm={handleModalConfirm}
                                    onSkip={skipGroundingLaunch}
                                    onClose={closeGroundingLaunch}
                                />
                            )}
                            <SystemStatus avoidMobileTabs={showMobileTabs} />
                        </>
                    )}
                </div>
            </ToastProvider>
        </ErrorBoundary>
    );
};

export default App;
