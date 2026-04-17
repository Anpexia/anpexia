import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../../config/database';
import { authenticate, requireRole } from '../../shared/middleware/auth';
import { success } from '../../shared/utils/response';
import { AppError } from '../../shared/middleware/error-handler';
import { authService } from '../auth/auth.service';

export const adminUsersRouter = Router();

adminUsersRouter.use(authenticate);
adminUsersRouter.use(requireRole('SUPER_ADMIN', 'ADMIN'));

const ADMIN_ROLES = ['ADMIN', 'GERENTE', 'VENDEDOR'] as const;
const ADMIN_INVITE_BASE =
  process.env.ADMIN_URL ||
  process.env.ADMIN_FRONTEND_URL ||
  'https://admin.anpexia.com.br';

function isAdminRole(role: string): role is (typeof ADMIN_ROLES)[number] {
  return (ADMIN_ROLES as readonly string[]).includes(role);
}

// GET /usuarios - list admin-panel users (tenantId=null)
adminUsersRouter.get('/usuarios', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { role, search } = req.query as Record<string, string>;
    const where: any = {
      tenantId: null,
    };
    if (role && isAdminRole(role)) where.role = role;
    if (search && search.trim()) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    const items = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
        passwordDefined: true,
      },
      orderBy: [{ createdAt: 'desc' }],
    });
    return success(res, { items });
  } catch (err) {
    next(err);
  }
});

// POST /usuarios - create admin user via invite
adminUsersRouter.post('/usuarios', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, role } = req.body || {};
    if (!name || !email || !role) {
      throw new AppError(400, 'MISSING_FIELDS', 'Nome, email e role são obrigatórios');
    }
    if (!isAdminRole(role)) {
      throw new AppError(400, 'INVALID_ROLE', 'Role inválida. Use ADMIN, GERENTE ou VENDEDOR');
    }
    const user = await authService.createInvite({
      tenantId: null,
      name: String(name),
      email: String(email),
      role,
      inviteLinkBase: ADMIN_INVITE_BASE,
    });
    return success(res, { user, invited: true }, 201);
  } catch (err) {
    next(err);
  }
});

// PATCH /usuarios/:id - edit name/role/status
adminUsersRouter.patch('/usuarios/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const existing = await prisma.user.findFirst({
      where: { id, tenantId: null, role: { in: [...ADMIN_ROLES] } },
    });
    if (!existing) throw new AppError(404, 'USER_NOT_FOUND', 'Usuário não encontrado');

    const { name, role, isActive } = req.body || {};
    const data: any = {};
    if (typeof name === 'string' && name.trim()) data.name = name.trim();
    if (role !== undefined) {
      if (!isAdminRole(role)) throw new AppError(400, 'INVALID_ROLE', 'Role inválida');
      data.role = role;
    }
    if (typeof isActive === 'boolean') data.isActive = isActive;

    const user = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true, name: true, email: true, role: true,
        isActive: true, createdAt: true,
      },
    });
    return success(res, { user });
  } catch (err) {
    next(err);
  }
});

// DELETE /usuarios/:id
adminUsersRouter.delete('/usuarios/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    if (req.auth?.userId === id) {
      throw new AppError(400, 'CANNOT_REMOVE_SELF', 'Você não pode remover a si mesmo');
    }
    const existing = await prisma.user.findFirst({
      where: { id, tenantId: null, role: { in: [...ADMIN_ROLES] } },
    });
    if (!existing) throw new AppError(404, 'USER_NOT_FOUND', 'Usuário não encontrado');

    await prisma.user.delete({ where: { id } });
    return success(res, { id, removed: true });
  } catch (err) {
    next(err);
  }
});
