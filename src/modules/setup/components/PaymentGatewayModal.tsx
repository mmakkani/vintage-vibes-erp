import React, { useState, useEffect } from 'react';
import { CompanyProfile, PaymentGatewayConfig } from '../setup.types.ts';
import {
  Zap,
  X,
  CreditCard,
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Lock,
  Save,
  Sliders,
  DollarSign
} from 'lucide-react';

interface PaymentGatewayModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyProfile: CompanyProfile;
  onSaveProfile: (updated: CompanyProfile) => Promise<void>;
  showMsg: (msg: string, type?: 'success' | 'error') => void;
}

export const PaymentGatewayModal: React.FC<PaymentGatewayModalProps> = ({
  isOpen,
  onClose,
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
    return companyProfile?.paymentGateway || defaultGateway;
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
    if (companyProfile?.paymentGateway) {
      setGatewayConfig(companyProfile.paymentGateway);
    }
  }, [companyProfile?.paymentGateway]);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
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
          message: data.health?.message || data.error || 'Connection handshake failed'
        });
        showMsg(data.health?.message || 'Gateway authentication failed', 'error');
      }
    } catch (err: any) {
      setTestResult({
        tested: true,
        success: false,
        message: err.message || 'Network error connecting to payment gateway service'
      });
      showMsg('Failed to reach payment gateway service', 'error');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    try {
      const updatedProfile: CompanyProfile = {
        ...companyProfile,
        paymentGateway: gatewayConfig,
        enableAppleGooglePay: gatewayConfig.allowApplePay,
        enableCardPay: gatewayConfig.allowCreditDebitCards
      };

      await onSaveProfile(updatedProfile);
      showMsg('✓ Payment Gateway and Apple Pay credentials saved successfully!');
      onClose();
    } catch (err) {
      showMsg('Failed to save payment gateway settings', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      id="payment-gateway-modal"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
    >
      <div className="bg-white w-full max-w-2xl rounded-2xl border-2 border-amber-300 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 px-5 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-inner">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-black uppercase tracking-wider">
                Payment Gateway & Apple Pay Setup
              </h2>
              <p className="text-xs text-amber-100 font-medium">
                Stripe UAE, Apple Pay (Face ID / Touch ID), & Card Processing
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-black/10 hover:bg-black/20 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSave} className="p-5 overflow-y-auto space-y-4 text-xs text-slate-800">
          {/* Provider & Environment */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                Gateway Provider
              </label>
              <select
                value={gatewayConfig.provider}
                onChange={(e) => setGatewayConfig({ ...gatewayConfig, provider: e.target.value as any })}
                className="w-full border border-slate-300 rounded-lg p-2 font-medium bg-white text-xs focus:ring-2 focus:ring-amber-500"
              >
                <option value="STRIPE_UAE">Stripe (UAE / Global)</option>
                <option value="NETWORK_INTERNATIONAL">Network International (N-Genius UAE)</option>
                <option value="CHECKOUT_COM">Checkout.com (MENA Gateway)</option>
                <option value="TABBY">Tabby (Buy Now Pay Later)</option>
                <option value="TAMARA">Tamara (Split in 4 UAE)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                Operating Mode
              </label>
              <select
                value={gatewayConfig.environment}
                onChange={(e) => setGatewayConfig({ ...gatewayConfig, environment: e.target.value as any })}
                className="w-full border border-slate-300 rounded-lg p-2 font-medium bg-white text-xs focus:ring-2 focus:ring-amber-500"
              >
                <option value="SANDBOX">Test Mode (Sandbox / Mock Handshake)</option>
                <option value="PRODUCTION">Live Production (Real Dirham Settlements)</option>
              </select>
            </div>
          </div>

          {/* Stripe API Credentials */}
          <div className="space-y-3 bg-amber-50/50 p-3.5 rounded-xl border border-amber-200">
            <h3 className="text-xs font-black uppercase tracking-wider text-amber-950 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-amber-600" />
              <span>Stripe API Credentials</span>
            </h3>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                Publishable Key (Client-Side)
              </label>
              <input
                type="text"
                placeholder="pk_test_... or pk_live_..."
                value={gatewayConfig.publishableKey || ''}
                onChange={(e) => setGatewayConfig({ ...gatewayConfig, publishableKey: e.target.value })}
                className="w-full border border-slate-300 rounded-lg p-2 font-mono text-xs bg-white focus:ring-2 focus:ring-amber-500"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Used to render secure Stripe Apple Pay & Card Elements in customer checkout.
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700">
                  Secret Key (Restricted Vault Key)
                </label>
                <button
                  type="button"
                  onClick={() => setShowSecretKey(!showSecretKey)}
                  className="text-[10px] text-amber-700 hover:text-amber-900 font-bold"
                >
                  {showSecretKey ? 'Hide Key' : 'Reveal Key'}
                </button>
              </div>
              <input
                type={showSecretKey ? 'text' : 'password'}
                placeholder="sk_test_... or sk_live_..."
                value={gatewayConfig.secretKey || ''}
                onChange={(e) => setGatewayConfig({ ...gatewayConfig, secretKey: e.target.value })}
                autoComplete="new-password"
                data-lpignore="true"
                data-1p-ignore="true"
                className="w-full border border-slate-300 rounded-lg p-2 font-mono text-xs bg-white focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                Webhook Signing Secret (Optional)
              </label>
              <input
                type="password"
                placeholder="whsec_..."
                value={gatewayConfig.webhookSecret || ''}
                onChange={(e) => setGatewayConfig({ ...gatewayConfig, webhookSecret: e.target.value })}
                autoComplete="new-password"
                data-lpignore="true"
                data-1p-ignore="true"
                className="w-full border border-slate-300 rounded-lg p-2 font-mono text-xs bg-white focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* Apple Pay & Currency Controls */}
          <div className="space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-blue-600" />
              <span>Apple Pay & Currency Settings</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Default Settlement Currency
                </label>
                <select
                  value={gatewayConfig.currency}
                  onChange={(e) => setGatewayConfig({ ...gatewayConfig, currency: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 font-bold bg-white text-xs focus:ring-2 focus:ring-amber-500"
                >
                  <option value="AED">AED - United Arab Emirates Dirham</option>
                  <option value="USD">USD - US Dollar</option>
                  <option value="EUR">EUR - Euro</option>
                  <option value="GBP">GBP - British Pound</option>
                  <option value="SAR">SAR - Saudi Riyal</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Apple Pay Merchant Identifier
                </label>
                <input
                  type="text"
                  placeholder="merchant.com.vintagevibes.ae"
                  value={gatewayConfig.applePayMerchantId || ''}
                  onChange={(e) => setGatewayConfig({ ...gatewayConfig, applePayMerchantId: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 font-mono text-xs bg-white focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-slate-800">
                <input
                  type="checkbox"
                  checked={gatewayConfig.allowApplePay !== false}
                  onChange={(e) => setGatewayConfig({ ...gatewayConfig, allowApplePay: e.target.checked })}
                  className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500"
                />
                <span> Apple Pay (Biometric / Face ID)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-slate-800">
                <input
                  type="checkbox"
                  checked={gatewayConfig.allowGooglePay !== false}
                  onChange={(e) => setGatewayConfig({ ...gatewayConfig, allowGooglePay: e.target.checked })}
                  className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500"
                />
                <span>Google Pay 1-Tap</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-slate-800">
                <input
                  type="checkbox"
                  checked={gatewayConfig.allowCreditDebitCards !== false}
                  onChange={(e) => setGatewayConfig({ ...gatewayConfig, allowCreditDebitCards: e.target.checked })}
                  className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500"
                />
                <span>Visa / Mastercard</span>
              </label>
            </div>
          </div>

          {/* Test Connection Results */}
          {testResult.tested && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center gap-2.5 ${
                testResult.success
                  ? 'bg-emerald-50 border border-emerald-300 text-emerald-900'
                  : 'bg-rose-50 border border-rose-300 text-rose-900'
              }`}
            >
              {testResult.success ? (
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <div className="flex-1">
                <span className="font-bold">{testResult.message}</span>
                {testResult.accountTitle && (
                  <span className="block font-mono text-[10px] mt-0.5">
                    Merchant: {testResult.accountTitle}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Actions Footer */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin text-amber-600' : 'text-slate-600'}`} />
              <span>{isTesting ? 'Testing Handshake...' : 'Test Connection'}</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs uppercase tracking-wider shadow-md transition-all cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Saving...' : 'Save & Close'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
