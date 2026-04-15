import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../../config/database';
import { authenticate, requireRole } from '../../shared/middleware/auth';
import { success } from '../../shared/utils/response';

export const auditLogRouter = Router();

auditLogRouter.use(authenticate);
auditLogRouter.use(requireRole('SUPER_ADMIN', 'OWNER'));

function buildWhere(req: Request) {
  const { userId, action, entity, tenantId, startDate, endDate } = req.query as Record<string, string>;
  const where: any = {};
  if (userId) where.userId = userId;
  if (action) where.action = action;
  if (entity) where.entity = entity;
  if (tenantId) where.tenantId = tenantId;
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }

  // OWNERs may only read their own tenant's logs
  if (req.auth?.role === 'OWNER' && req.auth.tenantId) {
    where.tenantId = req.auth.tenantId;
  }
  return where;
}

auditLogRouter.get('/audit-log', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const where = buildWhere(req);

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return success(res, { items, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

auditLogRouter.get('/audit-log/export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const where = buildWhere(req);
    const items = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });

    const header = 'data,usuario_id,usuario_email,usuario_role,tenant_id,acao,entidade,entidade_id,ip\n';
    const esc = (v: unknown) => {
      if (v == null) return '';
      const s = String(v).replace(/"/g, '""');
      return `"${s}"`;
    };
    const rows = items
      .map((l) =>
        [
          l.createdAt.toISOString(),
          l.userId,
          l.userEmail,
          l.userRole,
          l.tenantId,
          l.action,
          l.entity,
          l.entityId,
          l.ipAddress || l.ip,
        ]
          .map(esc)
          .join(','),
      )
      .join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send('\ufeff' + header + rows);
  } catch (err) {
    next(err);
  }
});
