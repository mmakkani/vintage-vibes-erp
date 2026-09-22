import { User, UserPermission } from '../auth.types.ts';
import { ModuleType, RoleType } from '../../../types/common.types.ts';
import { SecurityMasterPin } from '../../../utils/securityMasterPin.ts';

export interface AuthorityPopupOptions {
  user: User;
  adminUser: User;
  onSuccess?: () => void;
}

const MODULE_DEFINITIONS: { id: ModuleType; name: string; icon: string; category: string }[] = [
  { id: 'DASHBOARD', name: 'Main Dashboard & Company Secrets', icon: '🏠', category: 'Confidential Turnover, Landed Cost & Valuation KPIs' },
  { id: 'PURCHASE', name: 'Purchase & Gate Pass', icon: '📦', category: 'Inward Freight & Bale Ingest' },
  { id: 'INVENTORY', name: 'Inventory & Finished Goods', icon: '🏷️', category: 'Barcode Tagging & Racks' },
  { id: 'SALES', name: 'Live Drops & Sales Workflow', icon: '🛍️', category: 'Live Studios & Invoicing' },
  { id: 'FINANCE', name: 'Finance & COA', icon: '🏛️', category: 'Double-Entry Accounting & Ledger' },
  { id: 'HR', name: 'HR & Payroll', icon: '👥', category: 'Staff, Attendance & Vault' },
  { id: 'PARTIES', name: 'Parties Khata', icon: '🤝', category: 'Suppliers & Buyers Ledger' },
  { id: 'SETUP', name: 'Global Setup', icon: '⚙️', category: 'Company, Currencies & Rules' },
  { id: 'AUDIT', name: 'Audit Trail', icon: '📜', category: 'Immutable Compliance Logs' },
  { id: 'AUTH', name: 'Access Control (RBAC)', icon: '🔑', category: 'User Management & Security' }
];

export function openAuthorityMatrixPopup(options: AuthorityPopupOptions): Window | null {
  const { user, adminUser } = options;

  const win = window.open('', '_blank', 'width=900,height=800,resizable=yes,scrollbars=yes');
  if (!win) {
    alert('Popup blocked by browser. Please allow popups for Vintage Vibe ERP to manage authorities.');
    return null;
  }

  // Pre-fill initial permissions
  const existingPermsMap: Record<string, UserPermission> = {};
  if (Array.isArray(user.permissions)) {
    user.permissions.forEach(p => {
      existingPermsMap[p.module] = p;
    });
  }

  const initialRowsJson = JSON.stringify(
    MODULE_DEFINITIONS.map(m => {
      const existing = existingPermsMap[m.id];
      const isUserAdmin = user.role === 'ADMIN';
      let defaultCanView = true;
      if (['SETUP', 'AUDIT', 'AUTH'].includes(m.id)) {
        defaultCanView = isUserAdmin;
      }
      return {
        module: m.id,
        name: m.name,
        icon: m.icon,
        category: m.category,
        canView: existing?.canView !== undefined ? existing.canView : defaultCanView,
        canCreate: existing?.canCreate !== undefined ? existing.canCreate : isUserAdmin,
        canEdit: existing?.canEdit !== undefined ? existing.canEdit : isUserAdmin,
        canDelete: existing?.canDelete !== undefined ? existing.canDelete : isUserAdmin,
        canPost: existing?.canPost !== undefined ? existing.canPost : isUserAdmin,
        canUnpost: existing?.canUnpost !== undefined ? existing.canUnpost : isUserAdmin
      };
    })
  );

  const currentMasterPin = SecurityMasterPin.getMasterPin();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Authority Matrix & RBAC - @${user.username || user.email}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #0f172a;
      color: #f8fafc;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      font-size: 13px;
    }
    .top-header {
      background: #1e293b;
      border-bottom: 1px solid #334155;
      padding: 18px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 20;
    }
    .user-info {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .avatar {
      width: 48px;
      height: 48px;
      border-radius: 14px;
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: #000;
      font-weight: 900;
      font-size: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
      border: 2px solid #fbbf24;
    }
    .user-titles h1 {
      font-size: 17px;
      font-weight: 800;
      color: #ffffff;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .badge-role {
      font-size: 10px;
      font-family: monospace;
      font-weight: 800;
      padding: 2px 8px;
      border-radius: 6px;
      background: rgba(245, 158, 11, 0.15);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, 0.4);
      text-transform: uppercase;
    }
    .user-meta {
      font-size: 11px;
      color: #94a3b8;
      margin-top: 2px;
      display: flex;
      gap: 12px;
    }
    .user-handle {
      color: #fbbf24;
      font-family: monospace;
      font-weight: 700;
    }
    .content-body {
      flex: 1;
      padding: 24px;
      max-width: 1100px;
      margin: 0 auto;
      width: 100%;
      padding-bottom: 90px;
    }
    .presets-bar {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 16px;
      padding: 12px 18px;
      margin-bottom: 20px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .preset-title {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #cbd5e1;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .preset-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .btn-preset {
      background: #334155;
      color: #f1f5f9;
      border: 1px solid #475569;
      border-radius: 8px;
      padding: 6px 12px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .btn-preset:hover {
      background: #475569;
      border-color: #64748b;
      color: #ffffff;
      transform: translateY(-1px);
    }
    .btn-preset.admin {
      background: rgba(245, 158, 11, 0.2);
      border-color: rgba(245, 158, 11, 0.5);
      color: #fbbf24;
    }
    .btn-preset.admin:hover {
      background: rgba(245, 158, 11, 0.35);
    }
    .btn-preset.pin {
      background: rgba(99, 102, 241, 0.2);
      border-color: rgba(99, 102, 241, 0.5);
      color: #a5b4fc;
    }
    .matrix-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 18px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: center;
      font-size: 12px;
    }
    thead th {
      background: #0f172a;
      color: #94a3b8;
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 12px 10px;
      border-bottom: 1px solid #334155;
    }
    thead th.module-col { text-align: left; padding-left: 20px; }
    thead th.danger-col { color: #f43f5e; background: rgba(244, 63, 94, 0.08); }
    thead th.success-col { color: #10b981; background: rgba(16, 185, 129, 0.08); }
    thead th.warn-col { color: #f59e0b; background: rgba(245, 158, 11, 0.08); }
    tbody tr {
      border-bottom: 1px solid #334155;
      transition: background 0.1s ease;
    }
    tbody tr:hover {
      background: rgba(255, 255, 255, 0.02);
    }
    tbody td {
      padding: 11px 10px;
      vertical-align: middle;
    }
    td.module-cell {
      text-align: left;
      padding-left: 20px;
    }
    .mod-icon-name {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .mod-icon {
      font-size: 16px;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: #0f172a;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid #334155;
    }
    .mod-name {
      font-weight: 800;
      color: #ffffff;
      font-size: 13px;
    }
    .mod-cat {
      font-size: 10px;
      color: #64748b;
      margin-top: 1px;
    }
    .custom-switch {
      display: inline-flex;
      align-items: center;
      cursor: pointer;
    }
    .custom-switch input { display: none; }
    .slider {
      position: relative;
      width: 42px;
      height: 24px;
      background-color: #334155;
      border-radius: 24px;
      transition: 0.2s;
      border: 1px solid #475569;
    }
    .slider:before {
      position: absolute;
      content: "";
      height: 18px;
      width: 18px;
      left: 2px;
      bottom: 2px;
      background-color: #94a3b8;
      border-radius: 50%;
      transition: 0.2s;
    }
    input:checked + .slider {
      background-color: #2563eb;
      border-color: #3b82f6;
    }
    input:checked + .slider.danger {
      background-color: #e11d48;
      border-color: #f43f5e;
    }
    input:checked + .slider.success {
      background-color: #059669;
      border-color: #10b981;
    }
    input:checked + .slider.warn {
      background-color: #d97706;
      border-color: #f59e0b;
    }
    input:checked + .slider:before {
      transform: translateX(18px);
      background-color: #ffffff;
      box-shadow: 0 0 8px rgba(255,255,255,0.8);
    }
    .sticky-bar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: rgba(15, 23, 42, 0.95);
      backdrop-filter: blur(8px);
      border-top: 1px solid #334155;
      padding: 14px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      z-index: 30;
    }
    .status-text {
      font-size: 11px;
      color: #94a3b8;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .action-group {
      display: flex;
      gap: 10px;
    }
    .btn-save {
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: #000;
      border: none;
      border-radius: 10px;
      padding: 10px 22px;
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 4px 15px rgba(245, 158, 11, 0.4);
      transition: all 0.15s ease;
    }
    .btn-save:hover {
      background: linear-gradient(135deg, #fbbf24, #f59e0b);
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(245, 158, 11, 0.6);
    }
    .btn-close {
      background: #334155;
      color: #cbd5e1;
      border: 1px solid #475569;
      border-radius: 10px;
      padding: 10px 18px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
    }
    .btn-close:hover { background: #475569; color: #fff; }
    /* Modal for changing PIN */
    #pinModal {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.7);
      backdrop-filter: blur(4px);
      z-index: 100;
      align-items: center;
      justify-content: center;
    }
    .pin-modal-card {
      background: #1e293b;
      border: 2px solid #6366f1;
      border-radius: 20px;
      padding: 24px;
      max-width: 360px;
      width: 90%;
      box-shadow: 0 20px 50px rgba(0,0,0,0.5);
    }
    .pin-modal-card h3 { font-size: 16px; margin-bottom: 8px; color: #fff; }
    .pin-input-group { margin-bottom: 12px; }
    .pin-input-group label { display: block; font-size: 10px; font-weight: bold; text-transform: uppercase; color: #94a3b8; margin-bottom: 4px; }
    .pin-input-group input { width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid #475569; background: #0f172a; color: #fff; font-family: monospace; font-size: 14px; font-weight: bold; }
    .toast {
      position: fixed;
      top: 20px;
      right: 20px;
      background: #10b981;
      color: #fff;
      padding: 10px 18px;
      border-radius: 10px;
      font-weight: bold;
      box-shadow: 0 10px 25px rgba(0,0,0,0.4);
      display: none;
      z-index: 1000;
      animation: fadeIn 0.2s ease;
    }
  </style>
</head>
<body>
  <div class="top-header">
    <div class="user-info">
      <div class="avatar">${(user.name || user.username || 'U').charAt(0).toUpperCase()}</div>
      <div class="user-titles">
        <h1>
          <span>${user.name}</span>
          <span class="badge-role">${user.role}</span>
        </h1>
        <div class="user-meta">
          <span class="user-handle">@${user.username || user.email}</span>
          <span>&bull;</span>
          <span>${user.assignedShopId || 'Central Warehouse (Al Quoz)'}</span>
          <span>&bull;</span>
          <span style="color:${user.isActive ? '#34d399' : '#f87171'}">${user.isActive ? '● Active Operator' : '○ Suspended'}</span>
        </div>
      </div>
    </div>
    <div>
      <span style="font-size:11px;font-family:monospace;color:#94a3b8;">Auth Protocol: <strong>RBAC-V3</strong></span>
    </div>
  </div>

  <div class="content-body">
    <div class="presets-bar">
      <div class="preset-title">
        <span>⚡ Quick Authority Presets:</span>
      </div>
      <div class="preset-buttons">
        <button class="btn-preset admin" onclick="applyPreset('ALL_ADMIN')">🛡️ Grant All (Full Admin)</button>
        <button class="btn-preset" onclick="applyPreset('READ_ONLY')">👁️ Read Only</button>
        <button class="btn-preset" onclick="applyPreset('LIVE_CASHIER')">💵 Live Cashier Mode</button>
        <button class="btn-preset" onclick="applyPreset('FLOOR_SORTER')">📦 Floor Sorter Mode</button>
        <button class="btn-preset" onclick="applyPreset('ROLE_DEFAULT')">↺ Reset to Role Default</button>
        <button class="btn-preset pin" onclick="openPinModal()">🔑 Change Master PIN</button>
      </div>
    </div>

    <div class="matrix-card">
      <table>
        <thead>
          <tr>
            <th class="module-col">ERP Module & Scope</th>
            <th>Can View</th>
            <th>Can Create</th>
            <th>Can Edit</th>
            <th class="danger-col">⚠️ Can Delete</th>
            <th class="success-col">🛡️ Can Post (Approve)</th>
            <th class="warn-col">↺ Can Unpost (Reverse)</th>
          </tr>
        </thead>
        <tbody id="matrixTableBody">
          <!-- Populated by JS -->
        </tbody>
      </table>
    </div>
  </div>

  <div class="sticky-bar">
    <div class="status-text">
      <span>🔒 Security Gate: Authenticated via Master Admin PIN (${adminUser.name})</span>
    </div>
    <div class="action-group">
      <button class="btn-close" onclick="window.close()">✕ Close Window</button>
      <button class="btn-save" id="btnSave" onclick="savePermissions()">💾 Save & Apply Authorities</button>
    </div>
  </div>

  <!-- Change Master PIN Modal -->
  <div id="pinModal">
    <div class="pin-modal-card">
      <h3>🔑 Change Master Security PIN</h3>
      <p style="font-size:11px;color:#94a3b8;margin-bottom:14px;">Update the system-wide Master Admin PIN used for privileged overrides.</p>
      
      <div class="pin-input-group">
        <label>Current Master PIN</label>
        <input type="password" id="currPin" placeholder="Default: 9988" maxlength="6" autocomplete="new-password" data-lpignore="true" data-1p-ignore="true">
      </div>
      <div class="pin-input-group">
        <label>New Master PIN (4-6 digits)</label>
        <input type="password" id="newPin" placeholder="e.g. 8899" maxlength="6" autocomplete="new-password" data-lpignore="true" data-1p-ignore="true">
      </div>
      <div class="pin-input-group">
        <label>Confirm New Master PIN</label>
        <input type="password" id="confirmPin" placeholder="e.g. 8899" maxlength="6" autocomplete="new-password" data-lpignore="true" data-1p-ignore="true">
      </div>

      <div id="pinError" style="font-size:11px;color:#f43f5e;margin-bottom:10px;display:none;"></div>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;">
        <button class="btn-preset" onclick="closePinModal()">Cancel</button>
        <button class="btn-save" onclick="submitChangePin()" style="padding:8px 16px;">Update PIN</button>
      </div>
    </div>
  </div>

  <div id="toast" class="toast"></div>

  <script>
    const userId = ${JSON.stringify(user.id)};
    const userRole = ${JSON.stringify(user.role)};
    const userHandle = ${JSON.stringify(user.username || user.email)};
    const adminName = ${JSON.stringify(adminUser.name || 'Muhammad')};
    const adminHandle = ${JSON.stringify(adminUser.username || 'admin')};
    let activeMasterPin = ${JSON.stringify(currentMasterPin)};

    let rows = ${initialRowsJson};

    function renderTable() {
      const tbody = document.getElementById('matrixTableBody');
      tbody.innerHTML = '';

      rows.forEach((r, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = \`
          <td class="module-cell">
            <div class="mod-icon-name">
              <div class="mod-icon">\${r.icon}</div>
              <div>
                <div class="mod-name">\${r.name}</div>
                <div class="mod-cat">\${r.category}</div>
              </div>
            </div>
          </td>
          <td>\${renderSwitch(idx, 'canView', r.canView, 'default')}</td>
          <td>\${renderSwitch(idx, 'canCreate', r.canCreate, 'default')}</td>
          <td>\${renderSwitch(idx, 'canEdit', r.canEdit, 'default')}</td>
          <td style="background:rgba(244,63,94,0.03);">\${renderSwitch(idx, 'canDelete', r.canDelete, 'danger')}</td>
          <td style="background:rgba(16,185,129,0.03);">\${renderSwitch(idx, 'canPost', r.canPost, 'success')}</td>
          <td style="background:rgba(245,158,11,0.03);">\${renderSwitch(idx, 'canUnpost', r.canUnpost, 'warn')}</td>
        \`;
        tbody.appendChild(tr);
      });
    }

    function renderSwitch(rowIdx, field, isChecked, colorClass) {
      return \`
        <label class="custom-switch">
          <input type="checkbox" \${isChecked ? 'checked' : ''} onchange="toggleField(\${rowIdx}, '\${field}', this.checked)">
          <span class="slider \${colorClass}"></span>
        </label>
      \`;
    }

    function toggleField(rowIdx, field, checked) {
      rows[rowIdx][field] = checked;
    }

    function applyPreset(presetType) {
      if (presetType === 'ALL_ADMIN') {
        rows.forEach(r => {
          r.canView = true;
          r.canCreate = true;
          r.canEdit = true;
          r.canDelete = true;
          r.canPost = true;
          r.canUnpost = true;
        });
        showToast('Applied Preset: Full Administrator Access');
      } else if (presetType === 'READ_ONLY') {
        rows.forEach(r => {
          if (['SETUP', 'AUDIT', 'AUTH'].includes(r.module)) {
            r.canView = false;
          } else {
            r.canView = true;
          }
          r.canCreate = false;
          r.canEdit = false;
          r.canDelete = false;
          r.canPost = false;
          r.canUnpost = false;
        });
        showToast('Applied Preset: Read-Only Access');
      } else if (presetType === 'LIVE_CASHIER') {
        rows.forEach(r => {
          if (r.module === 'SALES') {
            r.canView = true; r.canCreate = true; r.canEdit = true; r.canDelete = false; r.canPost = true; r.canUnpost = false;
          } else if (r.module === 'INVENTORY') {
            r.canView = true; r.canCreate = false; r.canEdit = true; r.canDelete = false; r.canPost = false; r.canUnpost = false;
          } else if (r.module === 'FINANCE' || r.module === 'PARTIES') {
            r.canView = true; r.canCreate = false; r.canEdit = false; r.canDelete = false; r.canPost = false; r.canUnpost = false;
          } else {
            r.canView = false; r.canCreate = false; r.canEdit = false; r.canDelete = false; r.canPost = false; r.canUnpost = false;
          }
        });
        showToast('Applied Preset: Live Studio Cashier');
      } else if (presetType === 'FLOOR_SORTER') {
        rows.forEach(r => {
          if (r.module === 'PURCHASE' || r.module === 'INVENTORY') {
            r.canView = true; r.canCreate = true; r.canEdit = true; r.canDelete = false; r.canPost = true; r.canUnpost = false;
          } else {
            r.canView = false; r.canCreate = false; r.canEdit = false; r.canDelete = false; r.canPost = false; r.canUnpost = false;
          }
        });
        showToast('Applied Preset: Warehouse Floor Sorter');
      } else if (presetType === 'ROLE_DEFAULT') {
        const isAdmin = userRole === 'ADMIN';
        const isAccountant = userRole === 'ACCOUNTANT';
        const isManager = userRole === 'MANAGER';
        const isSupervisor = userRole === 'INVENTORY_SUPERVISOR';
        const isSales = userRole === 'SALES_EXECUTIVE';

        rows.forEach(r => {
          if (['SETUP', 'AUDIT', 'AUTH'].includes(r.module)) {
            r.canView = isAdmin;
          } else {
            r.canView = true;
          }

          if (isAdmin) {
            r.canCreate = true; r.canEdit = true; r.canDelete = true; r.canPost = true; r.canUnpost = true;
          } else if (isManager) {
            r.canCreate = true; r.canEdit = true; r.canDelete = false; r.canPost = true; r.canUnpost = true;
          } else if (isAccountant) {
            const isFin = ['FINANCE', 'PARTIES', 'SALES', 'PURCHASE', 'HR'].includes(r.module);
            r.canCreate = isFin; r.canEdit = isFin; r.canDelete = false; r.canPost = isFin; r.canUnpost = r.module === 'FINANCE';
          } else if (isSupervisor) {
            const isInv = ['PURCHASE', 'INVENTORY'].includes(r.module);
            r.canCreate = isInv; r.canEdit = isInv; r.canDelete = false; r.canPost = isInv; r.canUnpost = false;
          } else if (isSales) {
            const isSl = ['SALES', 'PARTIES'].includes(r.module);
            r.canCreate = isSl; r.canEdit = isSl; r.canDelete = false; r.canPost = isSl; r.canUnpost = false;
          } else {
            r.canCreate = false; r.canEdit = false; r.canDelete = false; r.canPost = false; r.canUnpost = false;
          }
        });
        showToast('Reset to Standard Role Defaults: ' + userRole);
      }
      renderTable();
    }

    async function savePermissions() {
      const btn = document.getElementById('btnSave');
      btn.disabled = true;
      btn.innerText = '💾 Saving & Committing...';

      const permissionsPayload = rows.map((r, i) => ({
        id: 'perm-' + userId + '-' + r.module,
        userId: userId,
        module: r.module,
        canView: !!r.canView,
        canCreate: !!r.canCreate,
        canEdit: !!r.canEdit,
        canDelete: !!r.canDelete,
        canPost: !!r.canPost,
        canUnpost: !!r.canUnpost
      }));

      try {
        const res = await fetch('/api/auth/users/' + userId + '/permissions', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            permissions: permissionsPayload,
            operatorName: adminName,
            operatorHandle: adminHandle
          })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          showToast('✅ Authorities committed successfully!');
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage({
              type: 'PERMISSIONS_SAVED',
              userId: userId,
              userHandle: userHandle,
              adminHandle: adminHandle
            }, '*');
          }
          setTimeout(() => {
            window.close();
          }, 600);
        } else {
          alert(data.error || 'Failed to update permissions');
          btn.disabled = false;
          btn.innerText = '💾 Save & Apply Authorities';
        }
      } catch (err) {
        alert('Network error while saving permissions: ' + err.message);
        btn.disabled = false;
        btn.innerText = '💾 Save & Apply Authorities';
      }
    }

    function showToast(msg) {
      const t = document.getElementById('toast');
      t.innerText = msg;
      t.style.display = 'block';
      setTimeout(() => { t.style.display = 'none'; }, 2500);
    }

    function openPinModal() {
      document.getElementById('pinModal').style.display = 'flex';
      document.getElementById('pinError').style.display = 'none';
      document.getElementById('currPin').value = '';
      document.getElementById('newPin').value = '';
      document.getElementById('confirmPin').value = '';
    }

    function closePinModal() {
      document.getElementById('pinModal').style.display = 'none';
    }

    function submitChangePin() {
      const curr = document.getElementById('currPin').value.trim();
      const next = document.getElementById('newPin').value.trim();
      const conf = document.getElementById('confirmPin').value.trim();
      const errBox = document.getElementById('pinError');

      // Check current master PIN
      let savedPin = activeMasterPin;
      try {
        savedPin = localStorage.getItem('vintage_erp_master_pin') || activeMasterPin;
      } catch {}

      if (curr !== savedPin) {
        errBox.innerText = 'Current Master PIN is incorrect.';
        errBox.style.display = 'block';
        return;
      }

      if (next.length < 4 || next.length > 6) {
        errBox.innerText = 'New Master PIN must be 4 to 6 digits.';
        errBox.style.display = 'block';
        return;
      }

      if (next !== conf) {
        errBox.innerText = 'New PIN and Confirmation do not match.';
        errBox.style.display = 'block';
        return;
      }

      try {
        localStorage.setItem('vintage_erp_master_pin', next);
        activeMasterPin = next;
        // Log to Audit Trail
        let auditAuthToken = '';
        try {
          const userRaw = localStorage.getItem('vintage_erp_logged_user');
          const parsed = userRaw ? JSON.parse(userRaw) : null;
          if (parsed && parsed.token) {
            auditAuthToken = parsed.token;
          } else if (parsed && parsed.id) {
            auditAuthToken = 'sess-' + String(parsed.id) + '-' + String(parsed.username || adminHandle);
          } else {
            auditAuthToken = 'sess-admin-' + String(adminHandle);
          }
        } catch {}

        fetch('/api/audit/log', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(auditAuthToken ? { 'Authorization': 'Bearer ' + auditAuthToken } : {})
          },
          body: JSON.stringify({
            module: 'AUTH',
            action: 'EDIT',
            documentRef: 'MASTER-PIN-UPDATE',
            status: 'POSTED',
            userName: '@' + adminHandle,
            details: 'Master Admin PIN changed by @' + adminHandle + ' on [' + new Date().toISOString().replace('T', ' ').slice(0, 19) + ']'
          })
        }).catch(() => {});
      } catch {}

      closePinModal();
      showToast('🔑 Master Admin PIN updated successfully!');
    }

    renderTable();
  </script>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
  return win;
}
