import React, { useState, useEffect, useCallback } from 'react';
import { ShieldAlert, Lock, Unlock, X, AlertTriangle, KeyRound } from 'lucide-react';
import { SecurityMasterPin, PinVerificationResult } from '../utils/securityMasterPin.ts';

interface MasterAdminPinModalProps {
  isOpen: boolean;
  onSuccess: () => void;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  targetAction?: string;
  adminUsername?: string;
}

export const MasterAdminPinModal: React.FC<MasterAdminPinModalProps> = ({
  isOpen,
  onSuccess,
  onClose,
  title = 'Master Admin PIN Verification',
  subtitle = 'Enter Master Admin PIN to modify role permissions',
  targetAction,
  adminUsername = 'admin'
}) => {
  const [pinDigits, setPinDigits] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isShake, setIsShake] = useState<boolean>(false);
  const [lockoutStatus, setLockoutStatus] = useState(() => SecurityMasterPin.getLockoutStatus());

  // Cooldown timer interval
  useEffect(() => {
    if (!isOpen) return;

    const checkLock = () => {
      const status = SecurityMasterPin.getLockoutStatus();
      setLockoutStatus(status);
    };

    checkLock();
    const interval = setInterval(checkLock, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Reset digits on modal open
  useEffect(() => {
    if (isOpen) {
      setPinDigits('');
      setErrorMessage(null);
      setLockoutStatus(SecurityMasterPin.getLockoutStatus());
    }
  }, [isOpen]);

  // Submit verification
  const handleVerify = useCallback((pinToVerify: string) => {
    if (lockoutStatus.isLocked) return;

    const result: PinVerificationResult = SecurityMasterPin.verifyPin(pinToVerify, adminUsername);
    if (result.success) {
      setErrorMessage(null);
      setPinDigits('');
      onSuccess();
    } else {
      setErrorMessage(result.error || 'Invalid Master Admin PIN');
      setIsShake(true);
      setTimeout(() => setIsShake(false), 500);
      setPinDigits('');
      setLockoutStatus(SecurityMasterPin.getLockoutStatus());
    }
  }, [lockoutStatus.isLocked, adminUsername, onSuccess]);

  // Handle digit input
  const handleAddDigit = useCallback((digit: string) => {
    if (lockoutStatus.isLocked) return;
    if (pinDigits.length >= 6) return;

    const newPin = pinDigits + digit;
    setPinDigits(newPin);
    setErrorMessage(null);

    // Auto-verify when 4 digits are entered
    if (newPin.length === 4) {
      setTimeout(() => {
        handleVerify(newPin);
      }, 100);
    }
  }, [pinDigits, lockoutStatus.isLocked, handleVerify]);

  const handleBackspace = useCallback(() => {
    if (lockoutStatus.isLocked) return;
    setPinDigits(prev => prev.slice(0, -1));
    setErrorMessage(null);
  }, [lockoutStatus.isLocked]);

  const handleClear = useCallback(() => {
    if (lockoutStatus.isLocked) return;
    setPinDigits('');
    setErrorMessage(null);
  }, [lockoutStatus.isLocked]);

  // Keyboard navigation listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleAddDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (pinDigits.length >= 4) {
          handleVerify(pinDigits);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, pinDigits, handleAddDigit, handleBackspace, handleVerify, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/75 backdrop-blur-md p-4 animate-in fade-in duration-150">
      <div
        className={`bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-white rounded-3xl border-2 ${
          lockoutStatus.isLocked ? 'border-rose-500/80 shadow-[0_0_50px_rgba(244,63,94,0.3)]' : 'border-amber-500/60 shadow-[0_0_50px_rgba(245,158,11,0.25)]'
        } w-full max-w-sm overflow-hidden p-6 relative transition-transform ${isShake ? 'translate-x-[-8px] duration-75' : ''}`}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={lockoutStatus.isLocked}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer disabled:opacity-30"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Security Icon Header */}
        <div className="flex flex-col items-center text-center mb-5">
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 border ${
              lockoutStatus.isLocked
                ? 'bg-rose-500/20 text-rose-400 border-rose-500/40 animate-pulse'
                : 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-inner'
            }`}
          >
            {lockoutStatus.isLocked ? (
              <AlertTriangle className="w-7 h-7 text-rose-400" />
            ) : (
              <Lock className="w-7 h-7 text-amber-300" />
            )}
          </div>

          <h3 className="text-base font-black tracking-tight text-white uppercase">
            {title}
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
            {subtitle}
          </p>

          {targetAction && (
            <div className="mt-2 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-[11px] font-mono text-amber-300">
              {targetAction}
            </div>
          )}
        </div>

        {/* Lockout Banner or Masked Dots */}
        {lockoutStatus.isLocked ? (
          <div className="bg-rose-950/60 border border-rose-500/50 rounded-2xl p-4 text-center mb-4 animate-in zoom-in-95">
            <div className="text-xs font-black uppercase tracking-wider text-rose-300 mb-1">
              Terminal Locked (Security Gate)
            </div>
            <div className="font-mono text-2xl font-black text-rose-400">
              {lockoutStatus.lockTimeRemaining}s
            </div>
            <p className="text-[11px] text-rose-200/80 mt-1">
              3 consecutive failed attempts logged to Security Audit Trail. Cooldown active.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center mb-5">
            {/* 4 Digit Dots Indicator */}
            <div className="flex items-center gap-3.5 my-2">
              {[0, 1, 2, 3].map(idx => {
                const isFilled = pinDigits.length > idx;
                return (
                  <div
                    key={idx}
                    className={`w-4 h-4 rounded-full transition-all duration-200 border-2 ${
                      isFilled
                        ? 'bg-amber-400 border-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.8)] scale-110'
                        : 'bg-slate-800 border-slate-700'
                    }`}
                  />
                );
              })}
            </div>

            {/* Error Message or Remaining Attempts */}
            {errorMessage ? (
              <div className="text-[11px] font-bold text-rose-400 text-center mt-1">
                {errorMessage}
              </div>
            ) : (
              <div className="text-[10px] text-slate-500 text-center mt-1">
                Default Factory PIN: <span className="font-mono text-amber-300/80">9988</span> (Use keypad or keyboard)
              </div>
            )}
          </div>
        )}

        {/* Tactile On-Screen Numeric Keypad */}
        <div className="grid grid-cols-3 gap-2.5 max-w-[260px] mx-auto">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
            <button
              key={num}
              type="button"
              disabled={lockoutStatus.isLocked}
              onClick={() => handleAddDigit(num)}
              className="h-12 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700/80 text-white font-mono text-lg font-bold transition-all active:scale-95 cursor-pointer disabled:opacity-20 flex items-center justify-center shadow-xs"
            >
              {num}
            </button>
          ))}

          {/* Clear Button */}
          <button
            type="button"
            disabled={lockoutStatus.isLocked}
            onClick={handleClear}
            className="h-12 rounded-xl bg-slate-800/50 hover:bg-slate-700/60 border border-slate-700/60 text-slate-400 text-xs font-bold uppercase tracking-wider transition-all active:scale-95 cursor-pointer disabled:opacity-20 flex items-center justify-center"
          >
            Clear
          </button>

          {/* Zero Button */}
          <button
            type="button"
            disabled={lockoutStatus.isLocked}
            onClick={() => handleAddDigit('0')}
            className="h-12 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700/80 text-white font-mono text-lg font-bold transition-all active:scale-95 cursor-pointer disabled:opacity-20 flex items-center justify-center shadow-xs"
          >
            0
          </button>

          {/* Backspace Button */}
          <button
            type="button"
            disabled={lockoutStatus.isLocked}
            onClick={handleBackspace}
            className="h-12 rounded-xl bg-slate-800/50 hover:bg-slate-700/60 border border-slate-700/60 text-slate-400 hover:text-white transition-all active:scale-95 cursor-pointer disabled:opacity-20 flex items-center justify-center"
            title="Backspace"
          >
            ⌫
          </button>
        </div>

        {/* Security Footer Notice */}
        <div className="mt-5 pt-3 border-t border-slate-800 text-[10px] text-slate-500 text-center flex items-center justify-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-500/70" />
          <span>Protected by Master Authority Access Matrix</span>
        </div>
      </div>
    </div>
  );
};
