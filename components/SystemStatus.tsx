import React, { useEffect, useState } from 'react';
import { Download, WifiOff, X } from 'lucide-react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const DISMISS_KEY = 'mockmate_install_prompt_dismissed';

const SystemStatus: React.FC = () => {
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installDismissed, setInstallDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === 'true');

  useEffect(() => {
    const updateOnline = () => setIsOnline(navigator.onLine);
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      if (!installDismissed) setInstallEvent(event as BeforeInstallPromptEvent);
    };

    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);

    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
    };
  }, [installDismissed]);

  const dismissInstall = () => {
    localStorage.setItem(DISMISS_KEY, 'true');
    setInstallDismissed(true);
    setInstallEvent(null);
  };

  const installApp = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice.catch(() => null);
    dismissInstall();
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[70] flex flex-col items-center gap-3 pointer-events-none sm:left-auto sm:right-6 sm:max-w-sm">
      {!isOnline && (
        <div className="pointer-events-auto flex w-full items-start gap-3 rounded-2xl border border-brand-primary/30 bg-brand-dark/95 p-4 text-brand-tint shadow-2xl backdrop-blur-xl">
          <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-brand-primary" />
          <div>
            <p className="text-sm font-semibold text-white">You are offline</p>
            <p className="mt-1 text-xs leading-relaxed text-brand-tint">
              Saved pages may still open. Resume, speaking, and interview practice need internet.
            </p>
          </div>
        </div>
      )}

      {isOnline && installEvent && !installDismissed && (
        <div className="pointer-events-auto flex w-full items-center gap-3 rounded-2xl border border-brand-tint/15 bg-brand-dark/95 p-3 text-brand-tint shadow-2xl backdrop-blur-xl">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
            <Download className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">Install MockMate</p>
            <p className="text-xs text-brand-tint">Open it from your home screen.</p>
          </div>
          <button
            type="button"
            onClick={installApp}
            className="rounded-xl bg-brand-primary px-4 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-brand-dark"
          >
            Install
          </button>
          <button
            type="button"
            aria-label="Dismiss install prompt"
            onClick={dismissInstall}
            className="rounded-xl border border-brand-tint/15 bg-white/5 p-2 text-brand-tint hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default SystemStatus;
