import { AsyncLocalStorage } from 'async_hooks';
import { Request, Response, NextFunction } from 'express';

interface TenantStore {
  tenantId: string | null;
  role: string | null;
}

export const tenantStore = new AsyncLocalStorage<TenantStore>();

export function tenantContext(req: Request, _res: Response, next: NextFunction) {
  const store: TenantStore = {
    tenantId: req.auth?.tenantId || null,
    role: req.auth?.role || null,
  };
  tenantStore.run(store, next);
}
