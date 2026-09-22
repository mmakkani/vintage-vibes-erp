import React, { useState, useEffect } from 'react';
import { CompanyProfile, PaymentGatewayConfig } from '../setup.types.ts';
import {
  CreditCard,
  Zap,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Lock,
  ExternalLink,
  ShieldCheck,
  Check,
  Eye,
  EyeOff,
  Radio,
  Sliders,
  Landmark
} from 'lucide-react';

interface PaymentGatewaySetupCardProps {
  companyProfile: CompanyProfile;
  onSaveProfile: (updated: CompanyProfile) => Promise<void>;
  showMsg: (msg: string, type?: 'success' | 'error') => void;
}

export const PaymentGatewaySetupCard: React.FC<PaymentGatewaySetupCardProps> = ({
  companyProfile,
  onSaveProfile,
  showMsg
}) => {
  const defaultGateway: PaymentGatewayConfig = {
    provider: 'STRIPE_UAE',
    environment: 'SANDBOX',
    isEnabled: true,
    publishableKey: '',
    secretKey: '',
    webhookSecret: '',
    merchantAccountId: '',
    applePayMerchantId: 'merchant.com.vintagevibes.ae',
    applePayDomainVerified: true,
    googlePayMerchantId: '',
    allowApplePay: true,
    allowGooglePay: true,
    allowCreditDebitCards: true,
    currency: 'AED',
    settlementCoaAccountId: '1120-00',
    gatewayFeePercent: 2.9
  };

  const [gatewayConfig, setGatewayConfig] = useState<PaymentGatewayConfig>(() => {
    return companyProfile.paymentGateway || defaultGateway;
  });

  const [showSecretKey, setShowSecretKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<{
    tested: boolean;
    success: boolean;
    message: string;
    accountTitle?: string;
  }>({
    tested: false,
    success: false,
    message: ''
  });

  useEffect(() => {
    if (companyProfile.paymentGateway) {
      setGatewayConfig(companyProfile.paymentGateway);
    }
  }, [companyProfile.paymentGateway]);

  const handleTestGatewayConnection = async () => {
    setIsTesting(true);
    setTestResult({ tested: false, success: false, message: '' });

    try {
      const res = await fetch('/api/payments/test-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secretKey: gatewayConfig.secretKey })
      });
      const data = await res.json();

      if (data.success) {
        setTestResult({
          tested: true,
          success: true,
          message: data.health?.message || 'Live Payment Gateway Handshake Succeeded!',
          accountTitle: data.health?.accountTitle
        });
        showMsg('✓ Payment Gateway connection verified successfully!');
      } else {
        setTestResult({
          tested: true,
          success: false,
          message: data.health?.message || data.error || 'Authentication failed'
        });
        showMsg(data.health?.message || 'Gateway authentication failed', 'error');
      }
    } catch (err: any) {
      setTestResult({
        tested: true,
        success: false,
        message: 'Could not connect to backend payment service'
      });
      showMsg('Failed to test payment connection', 'error');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    try {
      const updated: CompanyProfile = {
        ...companyProfile,
        enableCardPay: gatewayConfig.allowCreditDebitCards,
        enableAppleGooglePay: gatewayConfig.allowApplePay || gatewayConfig.allowGooglePay,
        paymentGateway: gatewayConfig
      };

      await onSaveProfile(updated);
      showMsg('Payment Gateway settings & Apple/Google Pay credentials saved!');
    } catch (err) {
      showMsg('Error saving gateway credentials', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 p-4 rounded-lg text-white border border-slate-700 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black tracking-wide uppercase">Real UAE Payment Gateway & Apple Pay Setup</h2>
              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${gatewayConfig.environment === 'PRODUCTION' ? 'bg-emerald-500 text-white' : 'bg-amber-500/30 text-amber-300 border border-amber-400/40'}`}>
                {gatewayConfig.environment === 'PRODUCTION' ? '🔴 Live Production' : '🧪 Sandbox Test'}
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Connect real merchant accounts (Stripe UAE, Network International, Checkout.com) to deduct actual UAE Dirhams via Apple Pay, Google Pay, and Cards.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto">
          <button
            type="button"
            onClick={handleTestGatewayConnection}
            disabled={isTesting || !gatewayConfig.secretKey}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white border border-slate-600 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
            <span>{isTesting ? 'Testing Ping...' : 'Test Gateway Ping'}</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white shadow-sm transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Saving...' : 'Save Configuration'}</span>
          </button>
        </div>
      </div>

      {/* Test Feedback Box */}
      {testResult.tested && (
        <div className={`p-3 rounded border text-xs flex items-start gap-2.5 ${testResult.success ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-rose-50 border-rose-300 text-rose-900'}`}>
          {testResult.success ? <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />}
          <div>
            <p className="font-bold">{testResult.success ? 'Gateway Authentication Verified' : 'Gateway Connection Failed'}</p>
            <p className="mt-0.5">{testResult.message}</p>
            {testResult.accountTitle && (
              <p className="mt-1 font-semibold text-emerald-800">Merchant Account: {testResult.accountTitle}</p>
            )}
          </div>
        </div>
      )}

      {/* Form Settings */}
      <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card 1: Provider & Core Credentials */}
        <div className="bg-white p-4 rounded border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b pb-2 border-slate-100">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-blue-600" />
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">Merchant Gateway Credentials</h3>
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={gatewayConfig.isEnabled}
                onChange={e => setGatewayConfig({ ...gatewayConfig, isEnabled: e.target.checked })}
                className="rounded text-blue-600"
              />
              <span className="text-xs font-bold text-slate-700">Enable Live Gateway</span>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Gateway Provider</label>
              <select
                value={gatewayConfig.provider}
                onChange={e => setGatewayConfig({ ...gatewayConfig, provider: e.target.value as any })}
                className="w-full text-xs font-medium border border-slate-300 rounded p-2 focus:ring-1 focus:ring-blue-500 bg-white"
              >
                <option value="STRIPE_UAE">Stripe UAE (Official)</option>
                <option value="NETWORK_INTERNATIONAL">Network International (N-Genius)</option>
                <option value="CHECKOUT_COM">Checkout.com (UAE)</option>
                <option value="TELR">Telr UAE Payment Gateway</option>
                <option value="CUSTOM">Custom Webhook Gateway</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Environment Mode</label>
              <select
                value={gatewayConfig.environment}
                onChange={e => setGatewayConfig({ ...gatewayConfig, environment: e.target.value as any })}
                className="w-full text-xs font-medium border border-slate-300 rounded p-2 focus:ring-1 focus:ring-blue-500 bg-white"
              >
                <option value="SANDBOX">🧪 Sandbox / Test Mode</option>
                <option value="PRODUCTION">🔴 Production / Live Real Money</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Publishable Key (Client Side)
            </label>
            <input
              type="text"
              placeholder="pk_live_... or pk_test_..."
              value={gatewayConfig.publishableKey || ''}
              onChange={e => setGatewayConfig({ ...gatewayConfig, publishableKey: e.target.value })}
              className="w-full text-xs font-mono border border-slate-300 rounded p-2 focus:ring-1 focus:ring-blue-500"
            />
            <span className="text-[10px] text-slate-400">Used by customer browser to render secure Apple Pay & Card Elements.</span>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold text-slate-600 uppercase">Secret API Key (Backend Server)</label>
              <button
                type="button"
                onClick={() => setShowSecretKey(!showSecretKey)}
                className="text-[11px] text-slate-500 hover:text-slate-800 flex items-center gap-1"
              >
                {showSecretKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                <span>{showSecretKey ? 'Hide' : 'Reveal'}</span>
              </button>
            </div>
            <input
              type={showSecretKey ? 'text' : 'password'}
              placeholder="sk_live_... or sk_test_..."
              value={gatewayConfig.secretKey || ''}
              onChange={e => setGatewayConfig({ ...gatewayConfig, secretKey: e.target.value })}
              autoComplete="new-password"
              data-lpignore="true"
              data-1p-ignore="true"
              className="w-full text-xs font-mono border border-slate-300 rounded p-2 focus:ring-1 focus:ring-blue-500"
            />
            <span className="text-[10px] text-slate-400">Never exposed to clients. Strictly processed in Node backend.</span>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Webhook Signing Secret
            </label>
            <input
              type="password"
              placeholder="whsec_..."
              value={gatewayConfig.webhookSecret || ''}
              onChange={e => setGatewayConfig({ ...gatewayConfig, webhookSecret: e.target.value })}
              autoComplete="new-password"
              data-lpignore="true"
              data-1p-ignore="true"
              className="w-full text-xs font-mono border border-slate-300 rounded p-2 focus:ring-1 focus:ring-blue-500"
            />
            <span className="text-[10px] text-slate-400">Verifies webhook callbacks for automated payment reconciliation.</span>
          </div>
        </div>

        {/* Card 2: Apple Pay, Google Pay & Settlement */}
        <div className="bg-white p-4 rounded border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b pb-2 border-slate-100">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">Apple Pay & Mobile Wallets</h3>
            </div>
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              UAE Central Bank Ready
            </span>
          </div>

          <div className="space-y-2 bg-slate-50 p-3 rounded border border-slate-200">
            <label className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-2">
                <span className="text-base"></span>
                <span className="text-xs font-bold text-slate-800">Apple Pay (Face ID / Touch ID)</span>
              </div>
              <input
                type="checkbox"
                checked={gatewayConfig.allowApplePay}
                onChange={e => setGatewayConfig({ ...gatewayConfig, allowApplePay: e.target.checked })}
                className="rounded text-blue-600 h-4 w-4"
              />
            </label>
            <p className="text-[11px] text-slate-500 pl-6">Allows iPhone, iPad, and Mac users in UAE to pay in 1 touch with biometric authorization.</p>
          </div>

          <div className="space-y-2 bg-slate-50 p-3 rounded border border-slate-200">
            <label className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-blue-600">G</span>
                <span className="text-xs font-bold text-slate-800">Google Pay (Android Biometrics)</span>
              </div>
              <input
                type="checkbox"
                checked={gatewayConfig.allowGooglePay}
                onChange={e => setGatewayConfig({ ...gatewayConfig, allowGooglePay: e.target.checked })}
                className="rounded text-blue-600 h-4 w-4"
              />
            </label>
            <p className="text-[11px] text-slate-500 pl-6">Allows Samsung, Pixel, and Android smartphone buyers to pay seamlessly.</p>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Apple Merchant ID</label>
              <input
                type="text"
                placeholder="merchant.com.vintagevibes"
                value={gatewayConfig.applePayMerchantId || ''}
                onChange={e => setGatewayConfig({ ...gatewayConfig, applePayMerchantId: e.target.value })}
                className="w-full text-xs font-mono border border-slate-300 rounded p-2 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Settlement Account (COA)</label>
              <select
                value={gatewayConfig.settlementCoaAccountId || '1120-00'}
                onChange={e => setGatewayConfig({ ...gatewayConfig, settlementCoaAccountId: e.target.value })}
                className="w-full text-xs font-medium border border-slate-300 rounded p-2 focus:ring-1 focus:ring-blue-500 bg-white"
              >
                <option value="1120-00">1120-00 Bank Account (RAK BANK / NBD)</option>
                <option value="1125-00">1125-00 POS & Card Gateway Clearing</option>
                <option value="1110-00">1110-00 Cash in Hand</option>
              </select>
            </div>
          </div>

          <div className="p-2.5 rounded bg-blue-50 border border-blue-200 text-blue-950 text-[11px] space-y-1">
            <p className="font-bold flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
              <span>Apple Pay Web Domain Verification Note:</span>
            </p>
            <p className="text-[10px] text-blue-800 leading-relaxed">
              Apple requires your domain association token hosted at:
              <code className="bg-blue-100 px-1 py-0.5 rounded font-mono block mt-0.5">
                https://yourdomain.com/.well-known/apple-developer-merchantid-domain-association
              </code>
              When live credentials are saved, customer checkout automatically unlocks direct Apple Pay buttons.
            </p>
          </div>
        </div>
      </form>
    </div>
  );
};
