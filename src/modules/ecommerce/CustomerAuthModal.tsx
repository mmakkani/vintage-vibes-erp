import React, { useState } from 'react';
import { X, Mail, Lock, User, Phone, Sparkles, Loader2, AlertCircle, Building2, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../supabaseClient.ts';
import { CrmRetailCustomer } from '../../services/crmService.ts';
import { luxuryAudio } from '../../utils/luxuryAudio.ts';

interface CustomerAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (customer: CrmRetailCustomer) => void;
}

export const CustomerAuthModal: React.FC<CustomerAuthModalProps> = ({
  isOpen,
  onClose,
  onAuthSuccess
}) => {
  if (!isOpen) return null;

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [fullName, setFullName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [isB2BApplicant, setIsB2BApplicant] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Sync Supabase Auth User with public.crm_retail_customers
  const syncCustomerRecord = async (user: any, nameOverride?: string, phoneOverride?: string, requestedB2B?: boolean): Promise<CrmRetailCustomer> => {
    const userEmail = (user.email || '').trim().toLowerCase();
    const userName = nameOverride || user.user_metadata?.full_name || user.user_metadata?.name || userEmail.split('@')[0] || 'Vintage Collector';
    const userPhone = phoneOverride || user.user_metadata?.phone || '';

    // 1. Check if crm_retail_customers already has record with auth_id or email
    const { data: existing } = await supabase
      .from('crm_retail_customers')
      .select('*')
      .or(`auth_id.eq.${user.id},email.eq.${userEmail}`)
      .limit(1)
      .maybeSingle();

    if (existing) {
      // If auth_id not yet linked, link it
      if (!existing.auth_id) {
        await supabase
          .from('crm_retail_customers')
          .update({ auth_id: user.id })
          .eq('id', existing.id);
      }
      return {
        id: String(existing.id),
        code: `CRM-${String(existing.id).slice(0, 6).toUpperCase()}`,
        name: existing.name || userName,
        email: existing.email || userEmail,
        phone: existing.phone || userPhone,
        address: existing.address || '',
        auth_id: user.id,
        customer_type: (existing.customer_type || 'RETAIL') as any,
        vip_tier: existing.vip_tier || 'BRONZE',
        wallet_balance: Number(existing.wallet_balance || 0),
        walletBalance: Number(existing.wallet_balance || 0),
        total_orders: Number(existing.total_orders || 0),
        total_spent: Number(existing.total_spent || 0)
      };
    }

    // 2. Insert new retail customer record
    const targetType = requestedB2B ? 'B2B_RESELLER' : 'RETAIL';
    const { data: created, error: createErr } = await supabase
      .from('crm_retail_customers')
      .insert([{
        auth_id: user.id,
        name: userName,
        email: userEmail,
        phone: userPhone,
        customer_type: targetType,
        vip_tier: 'BRONZE',
        wallet_balance: 0.00
      }])
      .select()
      .single();

    if (createErr || !created) {
      throw new Error(createErr?.message || 'Failed to initialize customer account profile.');
    }

    return {
      id: String(created.id),
      code: `CRM-${String(created.id).slice(0, 6).toUpperCase()}`,
      name: created.name,
      email: created.email,
      phone: created.phone,
      address: created.address || '',
      auth_id: user.id,
      customer_type: (created.customer_type || targetType) as any,
      vip_tier: created.vip_tier || 'BRONZE',
      wallet_balance: 0,
      walletBalance: 0,
      total_orders: 0,
      total_spent: 0
    };
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password
      });

      if (authErr) throw authErr;
      if (!data.user) throw new Error('No user returned from authentication service.');

      const customer = await syncCustomerRecord(data.user);
      luxuryAudio.playMechanicalClick();
      onAuthSuccess(customer);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Invalid email or password.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const { data, error: authErr } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
        options: {
          data: {
            full_name: fullName.trim(),
            phone: phone.trim(),
            is_b2b: isB2BApplicant
          }
        }
      });

      if (authErr) throw authErr;
      if (!data.user) throw new Error('Failed to register user.');

      const customer = await syncCustomerRecord(data.user, fullName.trim(), phone.trim(), isB2BApplicant);
      luxuryAudio.playMechanicalClick();
      onAuthSuccess(customer);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to create customer account.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleOAuth = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const { error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
      if (oauthErr) throw oauthErr;
    } catch (err: any) {
      setError(err?.message || 'Google OAuth failed.');
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#FAF7F2] text-slate-900 rounded-3xl border-2 border-amber-300 shadow-2xl max-w-md w-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="relative p-6 bg-gradient-to-b from-[#1C160C] to-[#2B2113] text-white">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full text-amber-200/70 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">✨</span>
            <span className="text-xs font-mono font-bold tracking-widest text-amber-400 uppercase">
              Vintage Vibes Dubai
            </span>
          </div>
          <h2 className="text-xl font-black font-serif tracking-tight text-white">
            {mode === 'signin' ? 'Welcome Back, Collector' : 'Create Collector Account'}
          </h2>
          <p className="text-xs text-amber-200/80 mt-1">
            {mode === 'signin'
              ? 'Access live order tracking, Store Credit Wallet, & wholesale access.'
              : 'Join Dubai’s vintage archive network with instant Store Credit benefits.'}
          </p>

          {/* Tab Selector */}
          <div className="mt-4 grid grid-cols-2 p-1 bg-black/40 rounded-xl border border-amber-400/20 text-xs font-bold">
            <button
              type="button"
              onClick={() => { setMode('signin'); setError(null); }}
              className={`py-1.5 rounded-lg transition cursor-pointer ${
                mode === 'signin'
                  ? 'bg-amber-400 text-slate-950 shadow-sm'
                  : 'text-amber-200/70 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setMode('signup'); setError(null); }}
              className={`py-1.5 rounded-lg transition cursor-pointer ${
                mode === 'signup'
                  ? 'bg-amber-400 text-slate-950 shadow-sm'
                  : 'text-amber-200/70 hover:text-white'
              }`}
            >
              Create Account
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Google OAuth Button */}
          <button
            type="button"
            onClick={handleGoogleOAuth}
            disabled={isLoading}
            className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs border border-slate-300 shadow-xs flex items-center justify-center gap-2.5 transition active:scale-98 cursor-pointer disabled:opacity-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            <span>Continue with Google</span>
          </button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-[10px] uppercase font-bold text-slate-400">or with email</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          {/* Form */}
          <form onSubmit={mode === 'signin' ? handleSignIn : handleSignUp} className="space-y-3">
            {mode === 'signup' && (
              <>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Full Name *
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      placeholder="e.g. Tariq Al Mansoor"
                      className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:border-amber-500 text-slate-800"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Phone / WhatsApp Number *
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="+971 50 123 4567"
                      className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:border-amber-500 text-slate-800"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Email Address *
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="collector@vintagevibesgk.com"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:border-amber-500 text-slate-800"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Password *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:border-amber-500 text-slate-800"
                />
              </div>
            </div>

            {mode === 'signup' && (
              <label className="p-3 rounded-xl border border-purple-200 bg-purple-50/60 flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isB2BApplicant}
                  onChange={e => setIsB2BApplicant(e.target.checked)}
                  className="mt-0.5 rounded text-purple-600 focus:ring-purple-500"
                />
                <div>
                  <div className="text-xs font-bold text-purple-900 flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5 text-purple-700" />
                    <span>Apply for Wholesale B2B Reseller Status</span>
                  </div>
                  <p className="text-[10px] text-purple-700/80 mt-0.5">
                    Unlocks unopened wholesale bales, bulk discounts, and Control Khata (1130-01) settlement.
                  </p>
                </div>
              </label>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-extrabold text-xs uppercase tracking-wider shadow-md transition transform active:scale-98 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <span>{mode === 'signin' ? 'Sign In & Access Account' : 'Complete Registration'}</span>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
