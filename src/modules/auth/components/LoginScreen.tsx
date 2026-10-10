import React, { useState, useEffect } from 'react';
import { User } from '../auth.types.ts';
import { Vintage3DLogo } from '../../../components/Vintage3DLogo.tsx';
import { CompanyName3D } from '../../../components/CompanyName3D.tsx';
import {
  Lock,
  User as UserIcon,
  ShieldCheck,
  Eye,
  EyeOff,
  LogIn,
  AlertCircle,
  Building,
  KeyRound,
  ArrowRight
} from 'lucide-react';

import { supabase } from '../../../lib/supabase.ts';
import { AuthEngine } from '../auth.engine.ts';

interface LoginScreenProps {
  onLoginSuccess: (user: User) => void;
  allUsers?: User[];
  initialMessage?: string | null;
  onBackToStorefront?: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLoginSuccess,
  allUsers = [],
  initialMessage = null,
  onBackToStorefront
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(() => {
    return typeof initialMessage === 'string' ? initialMessage : null;
  });

  useEffect(() => {
    if (typeof initialMessage === 'string') {
      setErrorMsg(initialMessage);
    }
  }, [initialMessage]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = username.trim();
    const cleanPassword = password.trim();

    if (!cleanUsername) {
      setErrorMsg('Please enter your operator username or email address');
      return;
    }

    if (!cleanPassword) {
      setErrorMsg('Please enter your operator password');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      let authenticatedUser: User | null = null;

      // 1. Try serverless API endpoint (/api/auth/login)
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: cleanUsername,
            password: cleanPassword
          })
        });

        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await res.json();
          if (res.ok && data.success && data.user) {
            const token = data.token || data.user.token;
            authenticatedUser = { ...data.user, token };
            if (token) {
              localStorage.setItem('vv_auth_token', token);
            }
          } else if (data && data.error) {
            if (res.status === 403 || data.error.includes('deactivated')) {
              setErrorMsg('User account has been deactivated');
              setLoading(false);
              return;
            }
            if (data.error.includes('Invalid password')) {
              setErrorMsg('Invalid password. Please check your credentials');
              setLoading(false);
              return;
            }
          }
        }
      } catch (netErr) {
        console.warn('[Auth] Serverless login route unavailable, attempting client fallback...', netErr);
      }

      // If serverless authentication succeeded, complete session
      if (authenticatedUser) {
        localStorage.setItem('vintage_erp_logged_user', JSON.stringify(authenticatedUser));
        localStorage.setItem('vintage_vibes_auth_user', JSON.stringify(authenticatedUser));
        if ((authenticatedUser as any).token) {
          localStorage.setItem('vv_auth_token', (authenticatedUser as any).token);
        }
        onLoginSuccess(authenticatedUser);
        return;
      }

      // 2. Direct Supabase Query (when running purely as client SPA on Vercel)
      if (supabase) {
        try {
          const term = cleanUsername.toLowerCase();
          let matchedRow: any = null;

          // Check operators table first
          const { data: supaOps } = await supabase
            .from('operators')
            .select('*')
            .ilike('username', term)
            .limit(1);

          if (supaOps && supaOps.length > 0) {
            matchedRow = supaOps[0];
          } else {
            // Check users table
            const { data: supaUsers } = await supabase
              .from('users')
              .select('*')
              .or(`username.ilike.${term},email.ilike.${term}`)
              .limit(1);

            if (supaUsers && supaUsers.length > 0) {
              matchedRow = supaUsers[0];
            }
          }

          if (matchedRow) {
            if (!matchedRow.is_active) {
              setErrorMsg('User account has been deactivated');
              setLoading(false);
              return;
            }
            if (!cleanPassword || (matchedRow.password_hash && matchedRow.password_hash.trim() !== cleanPassword)) {
              setErrorMsg('Invalid password. Check username & password');
              setLoading(false);
              return;
            }
            const supaUser: User = {
              id: String(matchedRow.id),
              username: matchedRow.username,
              name: matchedRow.display_name || matchedRow.name || matchedRow.username || 'Operator',
              email: matchedRow.email || `${matchedRow.username}@vintagevibe.ae`,
              role: (matchedRow.role || 'ADMIN').toUpperCase() as any,
              isActive: matchedRow.is_active !== false,
              permissions: (Array.isArray(matchedRow.permissions) && matchedRow.permissions.length > 0)
                ? matchedRow.permissions
                : AuthEngine.generateDefaultPermissions(String(matchedRow.id), (matchedRow.role || 'ADMIN').toUpperCase() as any),
              createdAt: matchedRow.created_at || new Date().toISOString()
            };
            const safeSupaUser = { ...supaUser, password: undefined };
            localStorage.setItem('vintage_erp_logged_user', JSON.stringify(safeSupaUser));
            localStorage.setItem('vintage_vibes_auth_user', JSON.stringify(safeSupaUser));
            onLoginSuccess(safeSupaUser);
            return;
          }
        } catch (dbEx) {
          console.warn('[Auth] Supabase direct query skipped/errored:', dbEx);
        }
      }

      // 3. Built-in Local Operator Store Fallback (Offline / Zero-latency fallback)
      const term = cleanUsername.toLowerCase();
      const localMatch = allUsers.find(
        u => (u.username?.toLowerCase() === term || u.email?.toLowerCase() === term)
      );

      if (localMatch) {
        if (!localMatch.isActive) {
          setErrorMsg('User account has been deactivated');
          setLoading(false);
          return;
        }
        if (!cleanPassword || (localMatch.password && localMatch.password !== cleanPassword)) {
          setErrorMsg('Invalid password. Check username & password');
          setLoading(false);
          return;
        }
        const safeLocalMatch = { ...localMatch, password: undefined };
        localStorage.setItem('vintage_erp_logged_user', JSON.stringify(safeLocalMatch));
        localStorage.setItem('vintage_vibes_auth_user', JSON.stringify(safeLocalMatch));
        onLoginSuccess(safeLocalMatch);
        return;
      }

      // Core system accounts (Admin & Senior Accountant)
      if ((term === 'admin' || term === 'mohd') && cleanPassword === 'admin123') {
        const adminUser: User = {
          id: 'usr-admin',
          username: term,
          name: 'Muhammad',
          email: `${term}@vintagevibe.ae`,
          role: 'ADMIN',
          isActive: true,
          permissions: AuthEngine.generateDefaultPermissions('usr-admin', 'ADMIN'),
          createdAt: new Date().toISOString()
        };
        localStorage.setItem('vintage_erp_logged_user', JSON.stringify(adminUser));
        localStorage.setItem('vintage_vibes_auth_user', JSON.stringify(adminUser));
        onLoginSuccess(adminUser);
        return;
      }

      if (term === 'accountant' && cleanPassword === 'acct123') {
        const acctUser: User = {
          id: 'usr-acct',
          username: 'accountant',
          name: 'Farhan Zaidi (Senior Accountant)',
          email: 'accountant@vintagevibe.ae',
          role: 'ACCOUNTANT',
          isActive: true,
          permissions: AuthEngine.generateDefaultPermissions('usr-acct', 'ACCOUNTANT'),
          createdAt: new Date().toISOString()
        };
        localStorage.setItem('vintage_erp_logged_user', JSON.stringify(acctUser));
        localStorage.setItem('vintage_vibes_auth_user', JSON.stringify(acctUser));
        onLoginSuccess(acctUser);
        return;
      }

      setErrorMsg('Invalid credentials. Please verify your username and password.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error connecting to authentication system');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-center items-center p-3 sm:p-6 font-sans overflow-x-hidden selection:bg-amber-400 selection:text-black">
      {/* 1. Full-Screen Edge-to-Edge Background Image */}
      <div 
        className="fixed inset-0 w-full h-full bg-cover bg-center bg-no-repeat pointer-events-none"
        style={{ backgroundImage: `url('/login_bale_to_piece_banner.png')` }}
      />

      {/* 2. Subtle Cinematic Contrast Tint (Sharp, vibrant, no heavy blur) */}
      <div className="fixed inset-0 w-full h-full bg-black/25 pointer-events-none" />
      <div className="fixed inset-0 w-full h-full bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.15)_0%,rgba(0,0,0,0.65)_100%)] pointer-events-none" />

      {/* Ambient luxury light glows */}
      <div className="fixed top-1/4 -left-20 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-1/4 -right-20 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Centered Floating Credentials Vault on Top of Background */}
      <div className="relative z-10 w-full max-w-sm sm:max-w-md my-auto py-6">
        {/* Back to Public Boutique Storefront */}
        {onBackToStorefront && (
          <div className="mb-3 flex justify-center sm:justify-start">
            <button
              type="button"
              onClick={onBackToStorefront}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/60 hover:bg-black/80 text-amber-200 hover:text-white border border-amber-400/40 text-xs font-bold shadow-lg backdrop-blur-md transition-all cursor-pointer"
            >
              <span>← Back to Luxury Boutique Storefront</span>
            </button>
          </div>
        )}

        {/* Master Frosted-Glass Luxury Credentials Vault Card */}
        <div className="relative bg-slate-950/80 rounded-3xl border border-amber-400/50 shadow-[0_0_50px_rgba(0,0,0,0.9),0_0_30px_rgba(217,119,6,0.25)] backdrop-blur-xl overflow-hidden p-6 sm:p-7">
          {/* Top Gold Trim Accent */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-amber-400 to-transparent" />

          {/* Top 3D Branding Box */}
          <div className="text-center mb-5 space-y-1.5 flex flex-col items-center">
            <div className="mb-1 flex justify-center drop-shadow-[0_4px_12px_rgba(245,158,11,0.3)]">
              <Vintage3DLogo size="lg" interactive={true} />
            </div>

            <CompanyName3D name="VINTAGE VIBES" size="lg" />

            <p className="text-[11px] text-amber-200/90 font-serif font-bold uppercase tracking-widest">
              GENERAL TRADING L.L.C - S.P.C
            </p>

            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-400/40 text-[10px] font-mono text-amber-300 font-bold shadow-inner">
              <span>Commercial Lic: 1049281</span>
              <span>&bull;</span>
              <span>Dubai, UAE</span>
            </div>
          </div>

          {/* Login Card Header */}
          <div className="flex items-center justify-between pb-2.5 mb-4 border-b border-amber-400/20">
            <div>
              <h3 className="font-serif font-black text-amber-100 text-sm uppercase tracking-wider">
                Operator Sign-In
              </h3>
              <p className="text-[11px] text-slate-400">Enterprise Relational ERP & Vault Access</p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-400/40 flex items-center justify-center shadow-inner">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>

          {typeof errorMsg === 'string' && errorMsg.trim() !== '' && (
            <div className="mb-4 p-3 rounded-xl bg-rose-950/80 border border-rose-500/60 text-xs text-rose-200 flex items-start gap-2 animate-in fade-in duration-200 backdrop-blur-md">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" />
              <div>{errorMsg}</div>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-3.5">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-amber-200/90 mb-1">
                Username / Email *
              </label>
              <div className="relative flex items-center">
                <UserIcon className="w-4 h-4 text-amber-400/70 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  id="login-input-username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Enter username or email"
                  required
                  className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-amber-400/30 text-xs font-medium text-white bg-black/50 placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all font-mono backdrop-blur-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-amber-200/90 mb-1">
                Operator Password *
              </label>
              <div className="relative flex items-center">
                <Lock className="w-4 h-4 text-amber-400/70 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="login-input-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-10 pr-11 py-2.5 rounded-xl border border-amber-400/30 text-xs font-medium text-white bg-black/50 placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all font-mono backdrop-blur-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-amber-400/70 hover:text-amber-300 cursor-pointer flex items-center justify-center focus:outline-hidden"
                  title={showPassword ? 'Hide password' : 'Show password'}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              id="btn-login-submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 hover:from-amber-400 hover:via-amber-500 hover:to-amber-600 text-slate-950 font-black text-xs uppercase tracking-widest shadow-[0_0_25px_rgba(245,158,11,0.35)] hover:shadow-[0_0_30px_rgba(245,158,11,0.5)] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <span>Authenticating System...</span>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Enter Vintage Vibes ERP</span>
                </>
              )}
            </button>
          </form>

          {/* Footer info */}
          <div className="text-center mt-5 pt-3 border-t border-amber-400/20 text-[10px] text-amber-200/70 font-mono space-y-1">
            <div>TRN: 100492819200003 &bull; Federal Tax Authority UAE Compliant</div>
            <div className="text-[10px] text-amber-400/80 font-bold tracking-wide">Architecture & Engineering by Makkani</div>
          </div>
        </div>
      </div>
    </div>
  );
};
