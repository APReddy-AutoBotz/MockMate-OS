import { useState, useEffect } from 'react';

/**
 * Hook to detect if the current viewport is mobile-sized
 * Mobile is defined as width <= 768px
 */
export const useIsMobile = (): boolean => {
    const [isMobile, setIsMobile] = useState<boolean>(() => {
        // SSR-safe initial state
        if (typeof window === 'undefined') return false;
        return window.innerWidth <= 768;
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const handleResize = () => {
            setIsMobile(window.innerWidth <= 768);
        };

        // Add event listener
        window.addEventListener('resize', handleResize);

        // Call handler right away so state gets updated with initial window size
        handleResize();

        // Cleanup
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return isMobile;
};

/**
 * Hook to detect if app is running as installed PWA
 */
export const useIsPWA = (): boolean => {
    const [isPWA, setIsPWA] = useState<boolean>(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const checkPWA = () => {
            const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                (window.navigator as any).standalone === true;
            setIsPWA(isStandalone);
        };

        checkPWA();
    }, []);

    return isPWA;
};

/**
 * Hook to get current screen size category
 */
export const useScreenSize = () => {
    const [screenSize, setScreenSize] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const handleResize = () => {
            const width = window.innerWidth;
            if (width <= 640) {
                setScreenSize('mobile');
            } else if (width <= 1024) {
                setScreenSize('tablet');
            } else {
                setScreenSize('desktop');
            }
        };

        window.addEventListener('resize', handleResize);
        handleResize();

        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return screenSize;
};
