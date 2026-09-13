import React, { useState, useEffect } from 'react';
import { DeviceService, DeviceInstallation } from '../../../services/deviceService.ts';
import {
  Smartphone,
  Laptop,
  Monitor,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Trash2,
  Lock,
  Unlock,
  Copy,
  Sliders,
  Sparkles,
  MapPin,
  Globe
} from 'lucide-react';

export const DeviceManagementView: React.FC = () => {
  const [devices, setDevices] = useState<DeviceInstallation[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedIp, setCopiedIp] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingLimitId, setEditingLimitId] = useState<string | null>(null);
  const [newLimitVal, setNewLimitVal] = useState<number>(2);

  const showNotice = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4500);
  };

  const fetchDevices = async () => {
    setLoading(true);
    try {
      const data = await DeviceService.getDevices();
      setDevices(data);
    } catch (err: any) {
      showNotice(err?.message || 'Failed to fetch registered devices from SQL', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  const handleToggleStatus = async (device: DeviceInstallation) => {
    const nextStatus = device.install_status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE';
    try {
      const ok = await DeviceService.toggleDeviceStatus(device.device_id, nextStatus);
      if (ok) {
        setDevices(prev =>
          prev.map(d => (d.device_id === device.device_id ? { ...d, install_status: nextStatus } : d))
        );
        showNotice(`Device ${device.device_model || device.device_id} is now ${nextStatus === 'ACTIVE' ? 'AUTHORIZED' : 'BLOCKED'}`);
      } else {
        showNotice('Failed to update status on server', 'error');
      }
    } catch (err: any) {
      showNotice(err?.message || 'Error toggling device status', 'error');
    }
  };

  const handleDelete = async (deviceId: string) => {
    if (!window.confirm('Are you sure you want to remove this device registration? The user will have to re-register upon next login.')) {
      return;
    }
    try {
      const ok = await DeviceService.deleteDevice(deviceId);
      if (ok) {
        setDevices(prev => prev.filter(d => d.device_id !== deviceId));
        showNotice('Device registration removed successfully from SQL');
      } else {
        showNotice('Failed to delete device from SQL', 'error');
      }
    } catch (err: any) {
      showNotice(err?.message || 'Error deleting device', 'error');
    }
  };

  const handleSaveLimit = async (deviceId: string) => {
    try {
      const ok = await DeviceService.updateDeviceLimit(deviceId, newLimitVal);
      if (ok) {
        setDevices(prev =>
          prev.map(d => (d.device_id === deviceId ? { ...d, max_devices_limit: newLimitVal } : d))
        );
        setEditingLimitId(null);
        showNotice(`Device limit updated to ${newLimitVal} for this device.`);
      } else {
        showNotice('Failed to update limit', 'error');
      }
    } catch (err: any) {
      showNotice(err?.message || 'Error updating device limit', 'error');
    }
  };

  const copyToClipboard = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedIp(text);
    setTimeout(() => setCopiedIp(null), 2000);
  };

  const getDeviceIcon = (deviceType: string) => {
    const t = (deviceType || '').toLowerCase();
    if (t.includes('iphone') || t.includes('ipad') || t.includes('android') || t.includes('phone')) {
      return <Smartphone className="w-5 h-5 text-amber-500" />;
    }
    if (t.includes('mac') || t.includes('laptop')) {
      return <Laptop className="w-5 h-5 text-sky-500" />;
    }
    return <Monitor className="w-5 h-5 text-slate-400" />;
  };

  const getCountryFlag = (code?: string) => {
    if (!code) return '🌐';
    const c = code.trim().toUpperCase();
    if (c === 'AE') return '🇦🇪';
    if (c === 'PK') return '🇵🇰';
    if (c === 'SA') return '🇸🇦';
    if (c === 'US') return '🇺🇸';
    if (c === 'GB' || c === 'UK') return '🇬🇧';
    if (c === 'IN') return '🇮🇳';
    if (c === 'OM') return '🇴🇲';
    if (c === 'QA') return '🇶🇦';
    if (c === 'BH') return '🇧🇭';
    if (c === 'KW') return '🇰🇼';
    if (c.length === 2) {
      const codePoints = c
        .split('')
        .map(char => 127397 + char.charCodeAt(0));
      return String.fromCodePoint(...codePoints);
    }
    return '🌐';
  };

  const totalCount = devices.length;
  const iphonesCount = devices.filter(d => (d.device_type || '').toLowerCase().includes('iphone')).length;
  const androidCount = devices.filter(d => (d.device_type || '').toLowerCase().includes('android')).length;
  const standaloneCount = devices.filter(d => d.is_standalone).length;
  const blockedCount = devices.filter(d => d.install_status === 'BLOCKED').length;

  return (
    <div className="space-y-5">
      <div className="bg-gradient-to-r from-slate-900 via-slate-950 to-amber-950/40 p-5 rounded-2xl border border-amber-500/40 shadow-lg text-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <ShieldCheck className="w-5 h-5" />
            </span>
            <h3 className="font-serif font-black text-amber-300 text-base uppercase tracking-wider">
              SQL Device Telemetry & Multi-Phone Security Control
            </h3>
          </div>
          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            Live database tracking for all iPhones, Android smartphones, and desktop terminals accessing Vintage Vibes ERP. Every device IP address is recorded directly in PostgreSQL to prevent unauthorized logins and enforce single/dual phone policies.
          </p>
          <p className="text-xs text-amber-300/90 font-medium mt-1" dir="rtl">
            ہر فون کا آئی پی ایڈریس اور ڈیوائس آئی ڈی براہِ راست SQL میں محفوظ ہے۔ یہاں سے آپ کسی بھی فون کو بلاک یا اجازت دے سکتے ہیں۔
          </p>
        </div>

        <button
          type="button"
          onClick={fetchDevices}
          disabled={loading}
          className="px-4 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 cursor-pointer shrink-0 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh SQL Records</span>
        </button>
      </div>

      {msg && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between shadow-xs ${
            msg.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border border-emerald-300'
              : 'bg-rose-50 text-rose-900 border border-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {msg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <XCircle className="w-4 h-4 text-rose-600" />
            )}
            <span>{msg.text}</span>
          </div>
          <button onClick={() => setMsg(null)} className="text-slate-600 hover:text-slate-900 font-bold p-1">✕</button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-amber-200/80 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Devices</div>
          <div className="text-2xl font-black text-slate-900 font-mono mt-1">{totalCount}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Logged in SQL</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-amber-200/80 shadow-xs">
          <div className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">iPhones / iOS</div>
          <div className="text-2xl font-black text-amber-700 font-mono mt-1">{iphonesCount}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Apple devices</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-amber-200/80 shadow-xs">
          <div className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Android Phones</div>
          <div className="text-2xl font-black text-emerald-700 font-mono mt-1">{androidCount}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Google Android</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-amber-200/80 shadow-xs">
          <div className="text-[11px] font-bold text-sky-600 uppercase tracking-wider">Home Screen PWA</div>
          <div className="text-2xl font-black text-sky-700 font-mono mt-1">{standaloneCount}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Installed Standalone</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-amber-200/80 shadow-xs">
          <div className="text-[11px] font-bold text-rose-600 uppercase tracking-wider">Blocked Phones</div>
          <div className="text-2xl font-black text-rose-700 font-mono mt-1">{blockedCount}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Restricted by admin</div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-amber-200/90 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-amber-600" />
            <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
              Registered Phone & Device Hardware List ({devices.length})
            </h4>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">
            Table: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-800 font-mono">public.device_installations</code>
          </span>
        </div>

        {devices.length === 0 ? (
          <div className="text-center py-16 px-4">
            <Smartphone className="w-12 h-12 text-slate-300 mx-auto mb-3 animate-pulse" />
            <h5 className="text-sm font-bold text-slate-700">No Devices Registered Yet</h5>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
              Devices are automatically registered the moment an operator or visitor opens the ERP on iPhone, Android, or desktop.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-4">Device & Model</th>
                  <th className="py-3 px-4">Operator</th>
                  <th className="py-3 px-4">Location (City & Country)</th>
                  <th className="py-3 px-4">IP Address (SQL)</th>
                  <th className="py-3 px-4">PWA Install State</th>
                  <th className="py-3 px-4">Last Active</th>
                  <th className="py-3 px-4">Limit / Phone</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {devices.map((device) => {
                  const isBlocked = device.install_status === 'BLOCKED';
                  return (
                    <tr key={device.device_id || device.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-xl bg-slate-100 shrink-0">
                            {getDeviceIcon(device.device_type)}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              <span>{device.device_model || device.device_type || 'Unknown Phone'}</span>
                              {device.device_type === 'iPhone' && (
                                <span className="bg-amber-100 text-amber-800 text-[9px] font-black px-1.5 py-0.2 rounded border border-amber-300">
                                  iOS
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              ID: {device.device_id.length > 20 ? device.device_id.slice(0, 18) + '...' : device.device_id}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200 font-mono text-[11px]">
                          @{device.username || 'Guest / Visitor'}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="text-base leading-none shrink-0" title={device.country || 'Location'}>
                            {getCountryFlag(device.country)}
                          </span>
                          <div>
                            <div className="font-bold text-slate-900 text-[11px] flex items-center gap-1">
                              <span>{device.city || 'Dubai'}</span>
                              {device.country && (
                                <span className="text-[9.5px] font-mono px-1 py-0.2 bg-amber-100/70 border border-amber-300/80 text-amber-900 rounded font-semibold">
                                  {device.country}
                                </span>
                              )}
                            </div>
                            <div className="text-[9.5px] text-slate-400 flex items-center gap-0.5">
                              <MapPin className="w-2.5 h-2.5 text-slate-400" />
                              <span>{device.country === 'AE' ? 'United Arab Emirates' : (device.country === 'PK' ? 'Pakistan' : (device.country || 'Global'))}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 font-mono text-[11px]">
                          <span className="text-slate-900 font-semibold">{device.ip_address || '127.0.0.1'}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(device.ip_address || '')}
                            title="Copy IP"
                            className="text-slate-400 hover:text-amber-600 p-0.5 rounded cursor-pointer"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                          {copiedIp === device.ip_address && (
                            <span className="text-[9px] text-emerald-600 font-bold">Copied!</span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        {device.is_standalone ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-300 font-semibold text-[10px]">
                            <Sparkles className="w-3 h-3 text-emerald-600" />
                            <span>Home Screen PWA</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-semibold text-[10px]">
                            <span>Safari / Browser</span>
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-[11px] text-slate-500">
                        {device.last_active_at ? new Date(device.last_active_at).toLocaleString() : 'Recent'}
                      </td>

                      <td className="py-3 px-4">
                        {editingLimitId === device.device_id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="1"
                              max="10"
                              value={newLimitVal}
                              onChange={e => setNewLimitVal(Number(e.target.value))}
                              className="w-12 px-1.5 py-0.5 text-xs border border-amber-400 rounded bg-white text-center font-bold"
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveLimit(device.device_id)}
                              className="px-2 py-0.5 bg-amber-600 text-white rounded text-[10px] font-bold"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingLimitId(null)}
                              className="px-1.5 py-0.5 text-slate-400 text-[10px]"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className="font-bold text-slate-800">
                              Max {device.max_devices_limit || 2}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingLimitId(device.device_id);
                                setNewLimitVal(device.max_devices_limit || 2);
                              }}
                              className="text-slate-400 hover:text-amber-600 p-0.5"
                              title="Edit device limit"
                            >
                              <Sliders className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        {isBlocked ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-300 font-bold text-[10px]">
                            <ShieldAlert className="w-3 h-3 text-rose-600" />
                            <span>BLOCKED</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-300 font-bold text-[10px]">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>ACTIVE</span>
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(device)}
                            title={isBlocked ? 'Allow Device' : 'Block Device'}
                            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition flex items-center gap-1 cursor-pointer ${
                              isBlocked
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                                : 'bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-300'
                            }`}
                          >
                            {isBlocked ? (
                              <>
                                <Unlock className="w-3 h-3" />
                                <span>Allow</span>
                              </>
                            ) : (
                              <>
                                <Lock className="w-3 h-3" />
                                <span>Block</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDelete(device.device_id)}
                            title="Delete Device Registration"
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeviceManagementView;