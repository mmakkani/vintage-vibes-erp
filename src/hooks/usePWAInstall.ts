import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() => {
    if (typeof window !== 'undefined' && (window as any).__deferredPWAInstallPrompt) {
      return (window as any).__deferredPWAInstallPrompt;
    }
    return null;
  });
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Detect standalone mode (already installed)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    // Detect iOS devices
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice);

    // Pick up pre-captured prompt if available
    if ((window as any).__deferredPWAInstallPrompt) {
      setDeferredPrompt((window as any).__deferredPWAInstallPrompt);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      (window as any).__deferredPWAInstallPrompt = e;
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handlePromptReady = (e: any) => {
      const promptEvent = e.detail || (window as any).__deferredPWAInstallPrompt;
      if (promptEvent) {
        setDeferredPrompt(promptEvent as BeforeInstallPromptEvent);
      }
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      if (typeof window !== 'undefined') (window as any).__deferredPWAInstallPrompt = null;
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('pwa_prompt_ready', handlePromptReady);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('pwa_prompt_ready', handlePromptReady);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    const prompt = deferredPrompt || (typeof window !== 'undefined' ? (window as any).__deferredPWAInstallPrompt : null);
    if (!prompt) return false;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      if (typeof window !== 'undefined') (window as any).__deferredPWAInstallPrompt = null;
      return true;
    }
    return false;
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    install,
  };
}
