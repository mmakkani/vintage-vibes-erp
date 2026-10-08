import { Router } from 'express';
import { AuthController } from './auth.controller.ts';
import { AuthService } from '../../services/authService.ts';
import {
  requireAuthMiddleware,
  requireModuleAuth,
  extractAuthToken,
  revokeSessionToken,
  verifyAuthToken
} from '../../server/authValidator.ts';

export const authRouter = Router();

// Login is public (with rate-limiting / brute force protection inside handler)
authRouter.post('/login', (req, res) => {
  const { email, username, password } = req.body;
  const identifier = username || email;
  if (!identifier) {
    return res.status(400).json({ error: 'Username or Email is required' });
  }
  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }
  const result = AuthController.login(identifier, password);
  if (!result.success) {
    return res.status(401).json({ error: result.error });
  }
  // Strip password hash from returned object
  const safeUser = result.user ? { ...result.user, password: undefined } : undefined;
  return res.json({ ...result, user: safeUser });
});

// Verify current session token
authRouter.get('/verify', async (req, res) => {
  const token = extractAuthToken(req);
  const result = await verifyAuthToken(token);
  if (!result.valid || !result.user) {
    return res.status(401).json({ success: false, error: result.error || 'Unauthorized' });
  }
  return res.json({ success: true, user: result.user });
});

// Logout and revoke session token
authRouter.post('/logout', async (req, res) => {
  const token = extractAuthToken(req);
  if (token) {
    await revokeSessionToken(token);
  }
  res.setHeader('Set-Cookie', 'vv_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  return res.json({ success: true, message: 'Logged out successfully and session revoked' });
});

// Read operators / users list (requires authenticated session)
authRouter.get('/users', requireAuthMiddleware, async (req, res) => {
  try {
    const list = await AuthService.getUsers();
    const safeList = list.map(u => ({ ...u, password: undefined }));
    return res.json(safeList);
  } catch (_) {
    const list = AuthController.listUsers().map(u => ({ ...u, password: undefined }));
    return res.json(list);
  }
});

// Create new operator (requires AUTH CREATE permission or ADMIN)
authRouter.post('/users', requireModuleAuth('AUTH', 'CREATE'), (req, res) => {
  const result = AuthController.createUser(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  const safeUser = result.user ? { ...result.user, password: undefined } : undefined;
  return res.json({ ...result, user: safeUser });
});

// Update operator details / role (requires AUTH EDIT permission or ADMIN)
authRouter.put('/users/:userId', requireModuleAuth('AUTH', 'EDIT'), (req, res) => {
  const { userId } = req.params;
  const result = AuthController.updateUser(userId, req.body);
  if (!result.success) {
    return res.status(404).json({ error: result.error });
  }
  const safeUser = result.user ? { ...result.user, password: undefined } : undefined;
  return res.json({ ...result, user: safeUser });
});

// Delete operator account (requires AUTH DELETE permission or ADMIN)
authRouter.delete('/users/:userId', requireModuleAuth('AUTH', 'DELETE'), (req, res) => {
  const { userId } = req.params;
  const result = AuthController.deleteUser(userId);
  if (!result.success) {
    return res.status(404).json({ error: result.error });
  }
  return res.json(result);
});

// Update permissions matrix (requires AUTH EDIT permission or ADMIN)
authRouter.put(['/permissions/:userId', '/users/:userId/permissions'], requireModuleAuth('AUTH', 'EDIT'), (req, res) => {
  const { userId } = req.params;
  const { permissions, module, operatorName, operatorHandle, ...otherFields } = req.body;

  if (Array.isArray(permissions)) {
    const result = AuthController.updatePermissions(userId, permissions, operatorName, operatorHandle);
    const safeUser = result.user ? { ...result.user, password: undefined } : undefined;
    return res.json({ ...result, user: safeUser });
  }

  // Handle granular toggle from UI: { module: 'PURCHASE', canCreate: true }
  if (module) {
    const user = AuthController.listUsers().find(u => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const currentPerms = [...(user.permissions || [])];
    const permIdx = currentPerms.findIndex(p => p.module === module);
    if (permIdx >= 0) {
      currentPerms[permIdx] = { ...currentPerms[permIdx], ...otherFields };
    } else {
      currentPerms.push({
        id: `perm-${Date.now()}`,
        userId,
        module,
        canCreate: false,
        canEdit: false,
        canDelete: false,
        canPost: false,
        canUnpost: false,
        ...otherFields
      });
    }
    const result = AuthController.updatePermissions(userId, currentPerms);
    const safeUser = result.user ? { ...result.user, password: undefined } : undefined;
    return res.json({ ...result, user: safeUser });
  }

  return res.status(400).json({ error: 'Invalid permissions format' });
});
