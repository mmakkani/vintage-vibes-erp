/**
 * Master Admin PIN Security & Lockout Engine
 * Manages Master Admin PIN verification, 3-attempt cooldown lockout, and audit trail logging.
 */

import { AuditService } from '../services/auditService.ts';

const PIN_STORAGE_KEY = 'vintage_erp_master_pin';
const LOCKOUT_STORAGE_KEY = 'vintage_erp_pin_lockout';
const FAILED_ATTEMPTS_KEY = 'vintage_erp_pin_failed_attempts';
const DEFAULT_MASTER_PIN = '9988';
const LOCKOUT_DURATION_MS = 60 * 1000; // 60 seconds

export interface PinVerificationResult {
  success: boolean;
  error?: string;
  isLocked: boolean;
  lockTimeRemaining: number;
  remainingAttempts: number;
}

export class SecurityMasterPin {
  /**
   * Get the currently active Master Admin PIN (default: '9988')
   */
  public static getMasterPin(): string {
    try {
      return localStorage.getItem(PIN_STORAGE_KEY) || DEFAULT_MASTER_PIN;
    } catch {
      return DEFAULT_MASTER_PIN;
    }
  }

  /**
   * Set a new Master Admin PIN
   */
  public static setMasterPin(newPin: string): boolean {
    if (!newPin || newPin.trim().length < 4 || newPin.trim().length > 6) {
      return false;
    }
    try {
      localStorage.setItem(PIN_STORAGE_KEY, newPin.trim());
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Reset to factory default PIN ('9988')
   */
  public static resetToDefaultPin(): void {
    try {
      localStorage.setItem(PIN_STORAGE_KEY, DEFAULT_MASTER_PIN);
    } catch {}
  }

  /**
   * Check if the terminal is currently locked out due to failed attempts
   */
  public static getLockoutStatus(): { isLocked: boolean; lockTimeRemaining: number; failedAttempts: number } {
    try {
      const lockUntilStr = localStorage.getItem(LOCKOUT_STORAGE_KEY);
      const attemptsStr = localStorage.getItem(FAILED_ATTEMPTS_KEY);
      const attempts = attemptsStr ? parseInt(attemptsStr, 10) : 0;

      if (lockUntilStr) {
        const lockUntil = parseInt(lockUntilStr, 10);
        const now = Date.now();
        if (now < lockUntil) {
          const remainingSec = Math.ceil((lockUntil - now) / 1000);
          return { isLocked: true, lockTimeRemaining: remainingSec, failedAttempts: attempts };
        } else {
          // Lockout expired, clear lock
          localStorage.removeItem(LOCKOUT_STORAGE_KEY);
          localStorage.removeItem(FAILED_ATTEMPTS_KEY);
        }
      }
      return { isLocked: false, lockTimeRemaining: 0, failedAttempts: attempts };
    } catch {
      return { isLocked: false, lockTimeRemaining: 0, failedAttempts: 0 };
    }
  }

  /**
   * Verify input PIN against Master Admin PIN
   */
  public static verifyPin(inputPin: string, adminUsername: string = 'admin'): PinVerificationResult {
    const lockStatus = this.getLockoutStatus();
    if (lockStatus.isLocked) {
      return {
        success: false,
        error: `Terminal locked. Please wait ${lockStatus.lockTimeRemaining}s before retrying.`,
        isLocked: true,
        lockTimeRemaining: lockStatus.lockTimeRemaining,
        remainingAttempts: 0
      };
    }

    const correctPin = this.getMasterPin();
    const cleanInput = (inputPin || '').trim();

    if (cleanInput === correctPin) {
      // Success! Reset failed attempts
      try {
        localStorage.removeItem(FAILED_ATTEMPTS_KEY);
        localStorage.removeItem(LOCKOUT_STORAGE_KEY);
      } catch {}

      return {
        success: true,
        isLocked: false,
        lockTimeRemaining: 0,
        remainingAttempts: 3
      };
    }

    // Wrong PIN entered
    let attempts = lockStatus.failedAttempts + 1;
    try {
      localStorage.setItem(FAILED_ATTEMPTS_KEY, attempts.toString());
    } catch {}

    if (attempts >= 3) {
      // 3 consecutive failures: enforce 60-second cooldown lock!
      const lockUntil = Date.now() + LOCKOUT_DURATION_MS;
      try {
        localStorage.setItem(LOCKOUT_STORAGE_KEY, lockUntil.toString());
      } catch {}

      // Log critical security alert to Audit Trail asynchronously
      this.logSecurityAlert(adminUsername, attempts);

      return {
        success: false,
        error: 'Terminal locked for 60 seconds due to 3 consecutive failed PIN attempts.',
        isLocked: true,
        lockTimeRemaining: 60,
        remainingAttempts: 0
      };
    }

    const remaining = 3 - attempts;
    return {
      success: false,
      error: `Invalid Master PIN. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before lockout.`,
      isLocked: false,
      lockTimeRemaining: 0,
      remainingAttempts: remaining
    };
  }

  /**
   * Log critical security alert when 3 failed attempts occur
   */
  public static logSecurityAlert(adminUsername: string, attemptsCount: number): void {
    try {
      const now = new Date();
      const dateStr = now.toISOString().replace('T', ' ').slice(0, 19);
      AuditService.addAuditLog({
        module: 'AUTH',
        action: 'POST',
        documentRef: 'SECURITY-LOCKOUT-PIN',
        status: 'POSTED',
        actor: `@${adminUsername}`,
        details: `SECURITY ALERT: ${attemptsCount} consecutive failed Master Admin PIN attempts detected on [${dateStr}]. Access blocked for 60s cooldown.`
      }).catch(() => {});
    } catch {}
  }
}
