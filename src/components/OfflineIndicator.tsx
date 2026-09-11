import React from 'react';
import { WifiOff, AlertTriangle } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus.ts';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      id="offline-banner"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-red-600 px-4 py-2.5 text-xs font-semibold text-white shadow-2xl border border-amber-300/40 animate-pulse"
    >
      <WifiOff className="w-4 h-4 text-white shrink-0" />
      <div>
        <p className="font-bold">Offline Warehouse Mode Active</p>
        <p className="text-[11px] text-amber-100 font-normal">
          Local cached records enabled. Changes will sync once network is restored.
        </p>
      </div>
    </div>
  );
};
