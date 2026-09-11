import { Router } from 'express';
import { AuthController } from './auth.controller.ts';

export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  const { email, username, password } = req.body;
  const identifier = username || email;
  if (!identifier) {
    return res.status(400).json({ error: 'Username or Email is required' });
  }
  const result = AuthController.login(identifier, password);
  if (!result.success) {
    return res.status(401).json({ error: result.error });
  }
  return res.json(result);
});

authRouter.get('/users', (req, res) => {
  return res.json(AuthController.listUsers());
});

authRouter.post('/users', (req, res) => {
  const result = AuthController.createUser(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result);
});

authRouter.put('/users/:userId', (req, res) => {
  const { userId } = req.params;
  const result = AuthController.updateUser(userId, req.body);
  if (!result.success) {
    return res.status(404).json({ error: result.error });
  }
  return res.json(result);
});

authRouter.delete('/users/:userId', (req, res) => {
  const { userId } = req.params;
  const result = AuthController.deleteUser(userId);
  if (!result.success) {
    return res.status(404).json({ error: result.error });
  }
  return res.json(result);
});

authRouter.put(['/permissions/:userId', '/users/:userId/permissions'], (req, res) => {
  const { userId } = req.params;
  const { permissions, module, operatorName, operatorHandle, ...otherFields } = req.body;

  if (Array.isArray(permissions)) {
    const result = AuthController.updatePermissions(userId, permissions, operatorName, operatorHandle);
    return res.json(result);
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
    return res.json(result);
  }

  return res.status(400).json({ error: 'Invalid permissions format' });
});
