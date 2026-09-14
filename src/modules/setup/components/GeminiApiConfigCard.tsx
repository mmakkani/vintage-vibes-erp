import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Key,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Eye,
  EyeOff,
  ExternalLink,
  ShieldCheck,
  Check,
  Server,
  Database
} from 'lucide-react';

interface GeminiApiConfigCardProps {
  onNotify?: (msg: string, type?: 'success' | 'error') => void;
}

export const GeminiApiConfigCard: React.FC<GeminiApiConfigCardProps> = ({ onNotify }) => {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gemini-3.6');
  const [showKey, setShowKey] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    tested: boolean;
    success: boolean;
    message: string;
  }>({ tested: false, success: false, message: '' });

  const loadConfig = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/setup/gemini-key');
      if (res.ok) {
        const data = await res.json();
        if (data && data.success) {
          if (data.apiKey) {
            setApiKey(data.apiKey);
            setIsConfigured(true);
          } else {
            const local = (typeof localStorage !== 'undefined' ? localStorage.getItem('vintage_gemini_api_key') : '') || '';
            if (local) setApiKey(local);
          }
          if (data.model) setModel(data.model);
          if (data.updatedAt) setUpdatedAt(data.updatedAt);
        }
      }
    } catch (e) {
      console.warn('Failed to load Gemini config:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleTestConnection = async () => {
    const keyToTest = apiKey.trim();
    if (!keyToTest || keyToTest.length < 8) {
      setTestResult({
        tested: true,
        success: false,
        message: 'Please provide a valid Gemini API key starting with AIzaSy... (at least 8 characters).'
      });
      return;
    }

    setIsTesting(true);
    setTestResult({ tested: false, success: false, message: '' });

    try {
      const res = await fetch('/api/setup/gemini-key/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: keyToTest, model })
      });
      const data = await res.json();
      if (res.ok && data.success && data.valid) {
        setTestResult({
          tested: true,
          success: true,
          message: data.message || `Connected to Google Gemini AI (${model}) successfully!`
        });
      } else {
        setTestResult({
          tested: true,
          success: false,
          message: data.error || 'Failed to authenticate with Google Gemini API.'
        });
      }
    } catch (err: any) {
      setTestResult({
        tested: true,
        success: false,
        message: err?.message || 'Network error communicating with Google AI servers.'
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveToDatabase = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanKey = apiKey.trim();
    if (!cleanKey || cleanKey.length < 8) {
      setSaveErrorMsg('API key must be at least 8 characters.');
      return;
    }

    setIsSaving(true);
    setSaveSuccessMsg(null);
    setSaveErrorMsg(null);

    try {
      const res = await fetch('/api/setup/gemini-key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: cleanKey, model })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setIsConfigured(true);
        if (data.updatedAt) setUpdatedAt(data.updatedAt);
        const msg = data.message || '✓ Gemini API Key successfully saved and persisted in PostgreSQL database (gemini_api_config)!';
        setSaveSuccessMsg(msg);
        try {
          localStorage.setItem('vintage_gemini_api_key', cleanKey);
        } catch {}
        if (onNotify) onNotify(msg, 'success');
      } else {
        const errMsg = data.error || 'Failed to persist Gemini API key to PostgreSQL database.';
        setSaveErrorMsg(errMsg);
        if (onNotify) onNotify(errMsg, 'error');
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Network error submitting API key to database.';
      setSaveErrorMsg(errMsg);
      if (onNotify) onNotify(errMsg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5 max-w-4xl space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 border border-purple-200 flex items-center justify-center text-purple-700 shadow-xs">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-sm tracking-wide flex items-center gap-2">
              Google Gemini AI & Neural Vision OCR
              <span className="px-2 py-0.5 rounded text-[10px] font-extrabold tracking-wider bg-purple-100 text-purple-800 border border-purple-200">
                SQL PERSISTENT
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Credentials persist directly into PostgreSQL table <code className="text-purple-700 font-mono font-bold bg-purple-50 px-1 py-0.5 rounded text-[11px]">gemini_api_config</code> via explicit SQL UPSERT.
            </p>
          </div>
        </div>

        {/* Database Status Badge */}
        <div className="flex items-center gap-2">
          {isLoading ? (
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Checking SQL status...</span>
            </div>
          ) : isConfigured ? (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>DATABASE PERSISTED</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-300 text-amber-800 text-xs font-bold">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>KEY NOT CONFIGURED IN DB</span>
            </div>
          )}
        </div>
      </div>

      {/* Success Notification Alert */}
      {saveSuccessMsg && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs flex items-start gap-2.5 animate-in fade-in duration-200 shadow-xs">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold">{saveSuccessMsg}</p>
            <p className="text-[11px] text-emerald-700 mt-0.5">
              Verified in database table <code className="font-mono bg-emerald-100 px-1 rounded">gemini_api_config</code> (ID: default). All OCR and AI valuation features can now use this key.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSaveSuccessMsg(null)}
            className="text-emerald-500 hover:text-emerald-800 font-bold ml-1 text-sm cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Error Alert */}
      {saveErrorMsg && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-300 text-red-900 text-xs flex items-start gap-2.5 animate-in fade-in duration-200 shadow-xs">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold">Error saving API Key:</p>
            <p className="text-[11px] text-red-700 mt-0.5">{saveErrorMsg}</p>
          </div>
          <button
            type="button"
            onClick={() => setSaveErrorMsg(null)}
            className="text-red-500 hover:text-red-800 font-bold ml-1 text-sm cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Live Test Feedback */}
      {testResult.tested && (
        <div
          className={`p-3 rounded-lg text-xs flex items-start gap-2.5 border shadow-xs animate-in fade-in duration-200 ${
            testResult.success
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-rose-50 border-rose-300 text-rose-900'
          }`}
        >
          {testResult.success ? (
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <p className="font-bold">{testResult.success ? 'Google AI Connection Verified' : 'Connection Test Failed'}</p>
            <p className={`text-[11px] mt-0.5 ${testResult.success ? 'text-emerald-700' : 'text-rose-700'}`}>
              {testResult.message}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setTestResult({ tested: false, success: false, message: '' })}
            className="text-slate-400 hover:text-slate-700 font-bold text-sm cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Form Content */}
      <form onSubmit={handleSaveToDatabase} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* API Key Input */}
          <div className="md:col-span-2">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                Gemini API Key:
              </label>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-blue-600 hover:underline flex items-center gap-1 font-semibold"
              >
                <span>Get Free Key at Google AI Studio</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="Paste AIzaSy... key from Google AI Studio"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                title={showKey ? 'Hide key' : 'Show key'}
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Never shared publicly. Required for real-time document OCR and vintage garment appraisal.
            </p>
          </div>

          {/* Model Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
              Preferred AI Model:
            </label>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
            >
              <option value="gemini-3.6">gemini-3.6 (Next-Gen High Precision Vision - Recommended)</option>
              <option value="gemini-3.6-flash">gemini-3.6-flash (Ultra-Fast 3.6 Speed)</option>
              <option value="gemini-2.5-flash">gemini-2.5-flash (Fast & Multimodal)</option>
              <option value="gemini-2.5-pro">gemini-2.5-pro (Deep Reasoning & Complex Tags)</option>
              <option value="gemini-1.5-flash">gemini-1.5-flash (Standard Production)</option>
            </select>
            <p className="text-[11px] text-slate-500 mt-1">
              Supports real-time vision, OCR, and automated valuation.
            </p>
          </div>
        </div>

        {/* Database Metadata & Features Checklist */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
          <div className="flex items-start gap-2">
            <Database className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-slate-800">Database Record:</span>
              <p className="text-[11px] text-slate-500">
                Table: <code className="font-mono text-purple-800">gemini_api_config</code> | ID: <code className="font-mono text-purple-800">default</code>
              </p>
              {updatedAt && (
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Last Synced: {new Date(updatedAt).toLocaleString()}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Server className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-slate-800">Active AI Modules:</span>
              <p className="text-[11px] text-slate-500">
                • HR Emirates ID & Passport OCR<br />
                • Purchase Vintage Garment Tag Scanner<br />
                • Real-time Live Stream OCR & Valuation
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200">
          <button
            type="button"
            disabled={isTesting || !apiKey.trim()}
            onClick={handleTestConnection}
            className="px-4 py-2 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 font-bold text-xs flex items-center gap-2 disabled:opacity-50 transition-all cursor-pointer"
          >
            {isTesting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-600" />
                <span>Testing with Google AI...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                <span>Test AI Live Connection</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadConfig}
              disabled={isLoading || isSaving}
              className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
              title="Reload from PostgreSQL database"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Reload</span>
            </button>

            <button
              type="submit"
              disabled={isSaving || !apiKey.trim()}
              className="px-5 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-2 shadow-sm disabled:opacity-50 transition-all cursor-pointer"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                  <span>Executing SQL UPSERT...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Save to Database (UPSERT)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
