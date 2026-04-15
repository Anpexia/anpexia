import prisma from '../config/database';

export interface AuditLogInput {
  userId?: string | null;
  userEmail?: string | null;
  userRole?: string | null;
  tenantId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

/**
 * Central audit log writer. Never throws — logging failures must not break the request.
 */
export async function logAction(input: AuditLogInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        userEmail: input.userEmail ?? null,
        userRole: input.userRole ?? null,
        tenantId: input.tenantId ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        metadata: input.metadata ? JSON.parse(JSON.stringify(input.metadata)) : undefined,
        ip: input.ipAddress ?? null,
        ipAddress: input.ipAddress ?? null,
      },
    });
  } catch (err) {
    console.error('[AUDIT] Falha ao gravar log:', err);
  }
}

export function getClientIp(req: { ip?: string; socket?: { remoteAddress?: string }; headers?: Record<string, string | string[] | undefined> }): string {
  const xff = req.headers?.['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) return xff.split(',')[0]?.trim() || 'unknown';
  return req.ip || req.socket?.remoteAddress || 'unknown';
}
