import prisma from '../../config/database';
import { Request } from 'express';

interface AuditParams {
  req: Request;
  action: string;
  entity: string;
  entityId?: string;
  changes?: { before?: unknown; after?: unknown };
}

export async function createAuditLog({ req, action, entity, entityId, changes }: AuditParams) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  await prisma.auditLog.create({
    data: {
      tenantId: req.auth?.tenantId || null,
      userId: req.auth?.userId || null,
      action,
      entity,
      entityId,
      changes: changes ? JSON.parse(JSON.stringify(changes)) : undefined,
      ip,
    },
  });
}
