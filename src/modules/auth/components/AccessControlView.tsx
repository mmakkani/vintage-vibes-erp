import React, { useState, useEffect } from 'react';
import { User } from '../auth.types.ts';
import { RoleType } from '../../../types/common.types.ts';
import {
  Shield,
  KeyRound,
  Users,
  UserPlus,
  Trash2,
  Edit2,
  Building,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  ShieldCheck,
  Lock,
  Radio,
  Smartphone
} from 'lucide-react';
import { MasterAdminPinModal } from '../../../components/MasterAdminPinModal.tsx';
import { openAuthorityMatrixPopup } from '../utils/authorityPopup.ts';
import { SecurityMasterPin } from '../../../utils/securityMasterPin.ts';
import { AuthService } from '../../../services/authService.ts';
import { DeviceManagementView } from './DeviceManagementView.tsx';

interface AccessControlViewProps {
  onRefreshAll: () => void;
  currentUserRole: string;
}

export const AccessControlView: React.FC<AccessControlViewProps> = ({ onRefreshAll, currentUserRole }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [accessSubTab, setAccessSubTab] = useState<'operators' | 'devices'>('operators');

  // Active Admin Operator
  const [currentAdminUser] = useState<User>(() => {
    try {
      const saved = localStorage.getItem('vintage_erp_logged_user');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      id: 'usr-admin',
      username: 'admin',
      name: 'Muhammad',
      role: 'ADMIN',
      email: 'admin@vintagevibe.ae',
      isActive: true,
      permissions: [],
      createdAt: '2026-01-01'
    };
  });

  // Master Admin PIN Modal State
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [targetUserForAuthority, setTargetUserForAuthority] = useState<User | null>(null);

  // New / Edit User Form Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState<RoleType>('ACCOUNTANT');
  const [formShop, setFormShop] = useState('Central Warehouse (Al Quoz)');
  const [formIsActive, setFormIsActive] = useState(true);
  const [showPwd, setShowPwd] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadAuth = async () => {
    try {
      const data = await AuthService.getOperators();
      setUsers(data);
    } catch (err: any) {
      console.error('Failed to load operators from Supabase:', err);
      showMsg(err.message || 'Failed to load operators from database', 'error');
    }
  };

  useEffect(() => {
    loadAuth();
  }, []);

  // Listen for popup messages when permissions are committed
  useEffect(() => {
    const handlePopupMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'PERMISSIONS_SAVED') {
        showMsg(`Authorities successfully saved and applied for @${event.data.userHandle || 'operator'}!`, 'success');
        loadAuth();
        onRefreshAll();
      }
    };

    window.addEventListener('message', handlePopupMessage);
    return () => window.removeEventListener('message', handlePopupMessage);
  }, [onRefreshAll]);

  const showMsg = (text: string, type: 'success' | 'error' = 'success') => {
    setActionMessage({ type, text });
    setTimeout(() => setActionMessage(null), 5000);
  };

  const openCreateModal = () => {
    setEditingUserId(null);
    setFormUsername('');
    setFormPassword('');
    setFormName('');
    setFormEmail('');
    setFormRole('ACCOUNTANT');
    setFormShop('Central Warehouse (Al Quoz)');
    setFormIsActive(true);
    setShowAddModal(true);
  };

  const openEditModal = (u: User) => {
    setEditingUserId(u.id);
    setFormUsername(u.username || '');
    setFormPassword(u.password || '');
    setFormName(u.name);
    setFormEmail(u.email);
    setFormRole(u.role);
    setFormShop(u.assignedShopId || 'Central Warehouse (Al Quoz)');
    setFormIsActive(u.isActive);
    setShowAddModal(true);
  };

  const handleToggleActiveStatus = async (u: User) => {
    if ((u.id === 'usr-admin' || u.username === 'admin') && u.isActive) {
      showMsg('Primary Principal Admin cannot be deactivated', 'error');
      return;
    }

    try {
      const newStatus = !u.isActive;
      await AuthService.updateOperator(u.id, { isActive: newStatus });
      setUsers(prev => prev.map(item => item.id === u.id ? { ...item, isActive: newStatus } : item));
      showMsg(`Account @${u.username} is now ${newStatus ? 'ACTIVE' : 'SUSPENDED'}`);
      onRefreshAll();
    } catch (err: any) {
      showMsg(err.message || 'Failed to toggle account active status', 'error');
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formUsername.trim() || !formName.trim()) {
      showMsg('Username and Full Name are required', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingUserId) {
        const updated = await AuthService.updateOperator(editingUserId, {
          username: formUsername.trim(),
          password: formPassword.trim() || undefined,
          name: formName.trim(),
          email: formEmail.trim(),
          role: formRole,
          assignedShopId: formShop,
          isActive: formIsActive
        });

        setUsers(prev => prev.map(u => u.id === editingUserId ? updated : u));
        showMsg(`Operator @${formUsername} updated successfully!`);
      } else {
        const created = await AuthService.addOperator({
          username: formUsername.trim(),
          password: formPassword.trim() || 'vintage123',
          name: formName.trim(),
          email: formEmail.trim() || `${formUsername.trim()}@vintagevibe.ae`,
          role: formRole,
          assignedShopId: formShop,
          isActive: formIsActive
        });

        // Update local component state immediately on success so the new user appears without manual refresh
        setUsers(prev => [created, ...prev]);
        showMsg(`Operator @${formUsername} created successfully with login credentials!`);
      }

      setShowAddModal(false);
      setIsSubmitting(false);
      onRefreshAll();
    } catch (err: any) {
      showMsg(err.message || 'Error saving operator', 'error');
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async (userId: string, uName: string) => {
    if (userId === 'usr-admin' || uName === 'admin') {
      showMsg('Cannot delete primary system administrator', 'error');
      return;
    }
    if (!confirm(`Are you sure you want to permanently delete user account @${uName}?`)) return;

    try {
      await AuthService.deleteOperator(userId);
      setUsers(prev => prev.filter(u => u.id !== userId));
      showMsg(`Operator @${uName} removed from system.`);
      onRefreshAll();
    } catch (err: any) {
      showMsg(err.message || 'Failed to delete user', 'error');
    }
  };

  // Trigger Authority Matrix Popup via Master Admin PIN Verification Gate
  const handleInitiateAuthorityManagement = (targetUser: User) => {
    setTargetUserForAuthority(targetUser);
    setIsPinModalOpen(true);
  };

  const handlePinVerificationSuccess = () => {
    setIsPinModalOpen(false);
    if (!targetUserForAuthority) return;

    // Launch Dedicated Isolated Popup Window
    openAuthorityMatrixPopup({
      user: targetUserForAuthority,
      adminUser: currentAdminUser
    });
  };

  const getRoleBadgeClasses = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return 'bg-purple-100 text-purple-900 border-purple-300';
      case 'ACCOUNTANT':
        return 'bg-blue-100 text-blue-900 border-blue-300';
      case 'INVENTORY_SUPERVISOR':
        return 'bg-amber-100 text-amber-900 border-amber-300';
      case 'SALES_EXECUTIVE':
        return 'bg-emerald-100 text-emerald-900 border-emerald-300';
      case 'MANAGER':
        return 'bg-indigo-100 text-indigo-900 border-indigo-300';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-300';
    }
  };

  const getAvatarGradient = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return 'from-purple-500 to-indigo-600 text-white';
      case 'ACCOUNTANT':
        return 'from-blue-500 to-sky-600 text-white';
      case 'INVENTORY_SUPERVISOR':
        return 'from-amber-500 to-yellow-600 text-slate-950';
      case 'SALES_EXECUTIVE':
        return 'from-emerald-500 to-teal-600 text-white';
      case 'MANAGER':
        return 'from-indigo-500 to-purple-600 text-white';
      default:
        return 'from-slate-500 to-slate-700 text-white';
    }
  };

  return (
    <div id="access-control-management-view" className="space-y-5">
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-2xl border border-amber-200/90 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-amber-500/10 text-amber-700 border border-amber-500/20">
              <KeyRound className="w-5 h-5 text-amber-600" />
            </span>
            <h3 className="font-serif font-black text-slate-900 text-base uppercase tracking-wider">
              Operator Accounts & Authority Matrix (RBAC)
            </h3>
          </div>
          <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
            Manage authorized terminal staff, credentials, and fine-grained module privileges. Authority matrix editing is isolated in a secure, popup interface protected by Master Admin PIN.
          </p>
        </div>

        {/* Action Button: ➕ New Operator & Role Assignment */}
        <button
          id="btn-create-operator"
          type="button"
          onClick={openCreateModal}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 hover:from-amber-600 hover:to-amber-800 text-white font-bold text-xs uppercase tracking-wider shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer shrink-0 active:scale-95"
        >
          <UserPlus className="w-4 h-4" />
          <span>➕ New Operator & Role Assignment</span>
        </button>
      </div>

      {actionMessage && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between shadow-xs animate-in fade-in duration-200 ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border border-emerald-300'
              : 'bg-rose-50 text-rose-900 border border-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <XCircle className="w-4 h-4 text-rose-600" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button onClick={() => setActionMessage(null)} className="text-slate-600 hover:text-slate-900 font-bold p-1">✕</button>
        </div>
      )}

      {/* Sub-Tab Navigation Bar */}
      <div className="flex items-center gap-2 border-b border-amber-200/80 pb-2">
        <button
          type="button"
          onClick={() => setAccessSubTab('operators')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            accessSubTab === 'operators'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Operator Accounts & Roles ({users.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setAccessSubTab('devices')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
            accessSubTab === 'devices'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Smartphone className="w-4 h-4" />
          <span>📱 Registered Phones & SQL Telemetry</span>
        </button>
      </div>

      {accessSubTab === 'devices' ? (
        <DeviceManagementView />
      ) : (
        <>
          {/* SECTION 1: SYSTEM OPERATORS MODERN CARDS GRID */}
          <div className="bg-white rounded-2xl border border-amber-200/90 shadow-sm p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-amber-600" />
            <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
              System Operators ({users.length} registered accounts)
            </h4>
          </div>
          <span className="text-[11px] text-slate-500 flex items-center gap-1">
            <Lock className="w-3 h-3 text-amber-600" />
            <span>Click <strong>'Manage Access & Authorities'</strong> to launch isolated security matrix</span>
          </span>
        </div>

        {/* Compact Operator Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {users.map(u => {
            const avatarInitial = (u.name || u.username || 'U').charAt(0).toUpperCase();
            return (
              <div
                key={u.id}
                id={`operator-card-${u.id}`}
                className="bg-gradient-to-b from-white to-slate-50/50 rounded-2xl border border-slate-200 hover:border-amber-400 p-4 transition-all shadow-xs hover:shadow-md flex flex-col justify-between"
              >
                <div>
                  {/* Top Bar: Avatar, Names, Role Badge */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-11 h-11 rounded-xl bg-gradient-to-tr ${getAvatarGradient(
                          u.role
                        )} font-black text-sm flex items-center justify-center shadow-sm shrink-0`}
                      >
                        {avatarInitial}
                      </div>

                      <div className="min-w-0">
                        <h4 className="font-bold text-slate-900 text-xs truncate leading-snug" title={u.name}>
                          {u.name}
                        </h4>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs font-mono font-black text-amber-900">
                            @{u.username || u.email.split('@')[0]}
                          </span>
                        </div>
                      </div>
                    </div>

                    <span
                      className={`text-[9px] font-mono font-extrabold px-2 py-0.5 rounded-md border uppercase shrink-0 ${getRoleBadgeClasses(
                        u.role
                      )}`}
                    >
                      {u.role.replace('_', ' ')}
                    </span>
                  </div>

                  {/* Branch / Location and Active Toggle Line */}
                  <div className="space-y-1.5 py-2.5 px-3 rounded-xl bg-slate-100/70 border border-slate-200/70 text-[11px] text-slate-600 mb-3">
                    <div className="flex items-center gap-1.5 truncate">
                      <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{u.assignedShopId || 'Central Warehouse (Al Quoz)'}</span>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/50">
                      <span className="text-[10px] text-slate-500 uppercase font-bold">Portal Access:</span>
                      <button
                        type="button"
                        onClick={() => handleToggleActiveStatus(u)}
                        className={`text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 transition-colors cursor-pointer ${
                          u.isActive
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                            : 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                        }`}
                        title="Click to toggle operator active / suspended status"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${u.isActive ? 'bg-emerald-600' : 'bg-rose-600'}`} />
                        <span>{u.isActive ? 'Active Operator' : 'Suspended'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Footer Controls: Manage Authorities Button & Edit/Delete icons */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEditModal(u)}
                      title="Edit credentials / password"
                      className="p-1.5 rounded-lg text-slate-500 hover:text-amber-800 hover:bg-amber-100 transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {u.id !== 'usr-admin' && (
                      <button
                        type="button"
                        onClick={() => handleDeleteUser(u.id, u.username || u.name)}
                        title="Delete operator account"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-800 hover:bg-rose-100 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* PROMINENT HIGH-CONTRAST ACTION BUTTON */}
                  <button
                    type="button"
                    id={`btn-manage-auth-${u.id}`}
                    onClick={() => handleInitiateAuthorityManagement(u)}
                    className="px-3.5 py-2 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-950 hover:from-slate-800 hover:to-slate-900 text-amber-300 hover:text-amber-200 border border-amber-500/40 rounded-xl text-xs font-black tracking-wide shadow-sm hover:shadow transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shrink-0"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                    <span>🛡️ Manage Access & Authorities</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* MASTER ADMIN PIN VERIFICATION MODAL GATE */}
      <MasterAdminPinModal
        isOpen={isPinModalOpen}
        onSuccess={handlePinVerificationSuccess}
        onClose={() => {
          setIsPinModalOpen(false);
          setTargetUserForAuthority(null);
        }}
        title="Master Admin PIN Verification"
        subtitle="Enter Master Admin PIN to modify role permissions"
        targetAction={targetUserForAuthority ? `Operator: @${targetUserForAuthority.username || targetUserForAuthority.name}` : undefined}
        adminUsername={currentAdminUser.username || 'admin'}
      />
      </>
      )}

      {/* Add / Edit Operator Credentials Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl border border-amber-300 max-w-md w-full shadow-2xl p-6 relative animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-amber-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-serif font-black text-slate-900 text-sm">
                    {editingUserId ? 'Edit Operator Credentials' : '➕ New Operator & Role Assignment'}
                  </h4>
                  <p className="text-[11px] text-slate-500">Configure login credentials and shop assignment</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-3.5" autoComplete="off">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1">
                    Username *
                  </label>
                  <input
                    type="text"
                    value={formUsername}
                    onChange={e => setFormUsername(e.target.value)}
                    placeholder="e.g. farhan_acct"
                    autoComplete="off"
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-slate-50 font-mono font-bold focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1">
                    Password *
                  </label>
                  <div className="relative">
                    <input
                      type={showPwd ? 'text' : 'password'}
                      value={formPassword}
                      onChange={e => setFormPassword(e.target.value)}
                      placeholder={editingUserId ? 'Leave blank to keep' : 'e.g. pass123'}
                      autoComplete="new-password"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      className="w-full px-3 pr-8 py-2 rounded-xl border border-slate-300 text-xs bg-slate-50 font-mono font-bold focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd(!showPwd)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      {showPwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="e.g. Farhan Zaidi"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-slate-50 focus:ring-2 focus:ring-amber-500 focus:outline-none font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1">
                    System Role *
                  </label>
                  <select
                    value={formRole}
                    onChange={e => setFormRole(e.target.value as RoleType)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-slate-50 focus:ring-2 focus:ring-amber-500 focus:outline-none font-bold cursor-pointer"
                  >
                    <option value="ADMIN">ADMIN (Full Authority)</option>
                    <option value="MANAGER">MANAGER</option>
                    <option value="ACCOUNTANT">ACCOUNTANT</option>
                    <option value="INVENTORY_SUPERVISOR">INVENTORY SUPERVISOR</option>
                    <option value="SALES_EXECUTIVE">SALES EXECUTIVE</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1">
                    Assigned Shop / Hub
                  </label>
                  <select
                    value={formShop}
                    onChange={e => setFormShop(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-slate-50 focus:ring-2 focus:ring-amber-500 focus:outline-none font-medium cursor-pointer"
                  >
                    <option value="Central Warehouse (Al Quoz)">Central Warehouse (Al Quoz)</option>
                    <option value="Deira Vintage Wholesale Hub">Deira Vintage Wholesale Hub</option>
                    <option value="Jumeirah Vintage Archive Studio">Jumeirah Vintage Archive Studio</option>
                    <option value="Headquarters Office">Headquarters Office</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={e => setFormEmail(e.target.value)}
                  placeholder="e.g. farhan@vintagevibe.ae"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-slate-50 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="user-active-checkbox"
                  checked={formIsActive}
                  onChange={e => setFormIsActive(e.target.checked)}
                  className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                />
                <label htmlFor="user-active-checkbox" className="text-xs text-slate-700 font-bold cursor-pointer">
                  Active Operator Account (Can log into ERP portal)
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md hover:shadow-lg transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'Saving...' : editingUserId ? 'Update User' : 'Save & Create Operator'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
