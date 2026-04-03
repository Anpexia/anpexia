import { Router, Request, Response, NextFunction } from 'express';
import { supplierService } from './supplier.service';
import { purchaseOrderService } from './purchase-order.service';
import { success, created, noContent } from '../../shared/utils/response';
import { authenticate, requireTenant } from '../../shared/middleware/auth';
import { getPagination, paginationMeta } from '../../shared/utils/pagination';
import { createAuditLog } from '../../shared/middleware/audit';
import prisma from '../../config/database';
import { AppError } from '../../shared/middleware/error-handler';

export const supplierRouter = Router();

supplierRouter.use(authenticate);
supplierRouter.use(requireTenant);

// ==========================================
// SUPPLIERS
// ==========================================

// List suppliers
supplierRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, skip } = getPagination(req);
    const search = req.query.search as string | undefined;
    const active = req.query.active !== 'false';

    const { suppliers, total } = await supplierService.list(
      req.auth!.tenantId!,
      { skip, take: limit, search, active },
    );

    return success(res, suppliers, paginationMeta(total, page, limit));
  } catch (err) {
    next(err);
  }
});

// Create supplier
supplierRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const supplier = await supplierService.create(req.auth!.tenantId!, req.body);

    await createAuditLog({
      req,
      action: 'supplier.create',
      entity: 'Supplier',
      entityId: supplier.id,
    });

    return created(res, supplier);
  } catch (err) {
    next(err);
  }
});

// Update supplier
supplierRouter.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const supplier = await supplierService.update(req.auth!.tenantId!, req.params.id as string, req.body);

    await createAuditLog({
      req,
      action: 'supplier.update',
      entity: 'Supplier',
      entityId: supplier.id,
    });

    return success(res, supplier);
  } catch (err) {
    next(err);
  }
});

// Deactivate supplier (soft delete)
supplierRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await supplierService.deactivate(req.auth!.tenantId!, req.params.id as string);

    await createAuditLog({
      req,
      action: 'supplier.deactivate',
      entity: 'Supplier',
      entityId: req.params.id as string,
    });

    return noContent(res);
  } catch (err) {
    next(err);
  }
});

// List supplier products
supplierRouter.get('/:id/products', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const products = await supplierService.listProducts(req.auth!.tenantId!, req.params.id as string);
    return success(res, products);
  } catch (err) {
    next(err);
  }
});

// Link product to supplier
supplierRouter.post('/:id/products', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId, isPrimary } = req.body;
    if (!productId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'productId e obrigatorio');
    }

    const link = await supplierService.linkProduct(
      req.auth!.tenantId!,
      req.params.id as string,
      productId,
      isPrimary || false,
    );

    await createAuditLog({
      req,
      action: 'supplier.link_product',
      entity: 'SupplierProduct',
      entityId: link.id,
    });

    return created(res, link);
  } catch (err) {
    next(err);
  }
});

// Unlink product from supplier
supplierRouter.delete('/:id/products/:productId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await supplierService.unlinkProduct(req.params.id as string, req.params.productId as string);

    await createAuditLog({
      req,
      action: 'supplier.unlink_product',
      entity: 'SupplierProduct',
    });

    return noContent(res);
  } catch (err) {
    next(err);
  }
});

// ==========================================
// PURCHASE ORDERS
// ==========================================

// List purchase orders
supplierRouter.get('/purchase-orders', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, skip } = getPagination(req);
    const status = req.query.status as string | undefined;
    const supplierId = req.query.supplierId as string | undefined;

    const { orders, total } = await purchaseOrderService.list(
      req.auth!.tenantId!,
      { skip, take: limit, status, supplierId },
    );

    return success(res, orders, paginationMeta(total, page, limit));
  } catch (err) {
    next(err);
  }
});

// Create purchase order
supplierRouter.post('/purchase-orders', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await purchaseOrderService.create(req.auth!.tenantId!, req.body);

    await createAuditLog({
      req,
      action: 'purchase_order.create',
      entity: 'PurchaseOrder',
      entityId: order.id,
    });

    return created(res, order);
  } catch (err) {
    next(err);
  }
});

// Approve purchase order
supplierRouter.put('/purchase-orders/:id/approve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await purchaseOrderService.approve(req.auth!.tenantId!, req.params.id as string);

    await createAuditLog({
      req,
      action: 'purchase_order.approve',
      entity: 'PurchaseOrder',
      entityId: order.id,
    });

    return success(res, order);
  } catch (err) {
    next(err);
  }
});

// Cancel purchase order
supplierRouter.put('/purchase-orders/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await purchaseOrderService.cancel(req.auth!.tenantId!, req.params.id as string);

    await createAuditLog({
      req,
      action: 'purchase_order.cancel',
      entity: 'PurchaseOrder',
      entityId: order.id,
    });

    return success(res, order);
  } catch (err) {
    next(err);
  }
});

// ==========================================
// SMTP CONFIG
// ==========================================

// Update tenant SMTP settings
supplierRouter.put('/smtp-config', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom } = req.body;

    const tenant = await prisma.tenant.update({
      where: { id: req.auth!.tenantId! },
      data: {
        smtpHost: smtpHost || null,
        smtpPort: smtpPort ? Number(smtpPort) : null,
        smtpUser: smtpUser || null,
        smtpPass: smtpPass || null,
        smtpFrom: smtpFrom || null,
      },
      select: {
        id: true,
        smtpHost: true,
        smtpPort: true,
        smtpUser: true,
        smtpFrom: true,
        // Do not return smtpPass
      },
    });

    await createAuditLog({
      req,
      action: 'tenant.update_smtp',
      entity: 'Tenant',
      entityId: tenant.id,
    });

    return success(res, tenant);
  } catch (err) {
    next(err);
  }
});

// Test email configuration (via Resend)
supplierRouter.post('/smtp-config/test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { to } = req.body;
    if (!to) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Email destinatario (to) e obrigatorio');
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: req.auth!.tenantId! },
      select: { name: true },
    });

    const { sendEmail } = await import('../../services/email.service');
    await sendEmail({
      to,
      subject: `Teste Email - ${tenant?.name || 'Anpexia'}`,
      html: `<p>Este e um email de teste do sistema <strong>${tenant?.name || 'Anpexia'}</strong>.</p><p>Se voce recebeu este email, a configuracao esta funcionando corretamente!</p>`,
    });

    return success(res, { message: 'Email de teste enviado com sucesso' });
  } catch (err) {
    if (err instanceof AppError) {
      return next(err);
    }
    next(new AppError(500, 'EMAIL_ERROR', `Falha ao enviar email de teste: ${(err as Error).message}`));
  }
});
