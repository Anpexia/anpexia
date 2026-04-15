import { Request, Response, NextFunction } from 'express';
import { logAction, getClientIp } from '../../services/auditLog.service';

/**
 * Route-level auto-audit middleware. Mount after `authenticate` on a route group.
 * Logs on 2xx response completion (fires AFTER the response is sent).
 */
export function autoAudit(entity: string) {
  return function (req: Request, res: Response, next: NextFunction) {
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const methodToAction: Record<string, string> = {
          POST: 'CREATE',
          PUT: 'UPDATE',
          PATCH: 'UPDATE',
          DELETE: 'DELETE',
          GET: 'VIEW',
        };
        const action = methodToAction[req.method];
        if (!action) return;
        // Skip GET-list endpoints (no :id) unless entity is flagged sensitive below
        if (action === 'VIEW' && !SENSITIVE_VIEW.includes(entity)) return;
        const entityId = (req.params?.id as string) || undefined;
        void logAction({
          userId: req.auth?.userId,
          userEmail: req.auth?.email,
          userRole: req.auth?.role,
          tenantId: req.auth?.tenantId,
          action: `${action}_${entity.toUpperCase()}`,
          entity,
          entityId,
          ipAddress: getClientIp(req),
          metadata: { method: req.method, path: req.originalUrl },
        });
      }
    });
    next();
  };
}

const SENSITIVE_VIEW = ['MedicalRecord', 'Prescription', 'Anamnesis', 'PatientEvolution'];
