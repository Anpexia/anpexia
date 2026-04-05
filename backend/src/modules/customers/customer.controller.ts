import { Router, Request, Response, NextFunction } from 'express';
import { customerService } from './customer.service';
import { createCustomerSchema, updateCustomerSchema } from './customer.validators';
import { success, created, noContent } from '../../shared/utils/response';
import { authenticate, requireTenant } from '../../shared/middleware/auth';
import { getPagination, paginationMeta } from '../../shared/utils/pagination';
import { createAuditLog } from '../../shared/middleware/audit';
import prisma from '../../config/database';

export const customerRouter = Router();

customerRouter.use(authenticate);
customerRouter.use(requireTenant);

customerRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, skip } = getPagination(req);
    const search = req.query.search as string | undefined;
    const tag = req.query.tag as string | undefined;

    const { customers, total } = await customerService.list(
      req.auth!.tenantId!,
      { skip, take: limit, search, tag },
    );

    return success(res, customers, paginationMeta(total, page, limit));
  } catch (err) {
    next(err);
  }
});

customerRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const customer = await customerService.getById(req.auth!.tenantId!, req.params.id as string);
    return success(res, customer);
  } catch (err) {
    next(err);
  }
});

customerRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createCustomerSchema.parse(req.body);
    const customer = await customerService.create(req.auth!.tenantId!, data);

    await createAuditLog({
      req,
      action: 'customer.create',
      entity: 'Customer',
      entityId: customer.id,
      changes: { after: customer },
    });

    // Send welcome email (non-blocking)
    if (customer.email) {
      import('../../services/email-templates').then(({ sendWelcomeEmail }) => {
        sendWelcomeEmail(req.auth!.tenantId!, { name: customer.name, email: customer.email! })
          .catch(err => console.error('[EMAIL] Welcome email failed:', err.message));
      });
    }

    return created(res, customer);
  } catch (err) {
    next(err);
  }
});

customerRouter.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateCustomerSchema.parse(req.body);
    const customer = await customerService.update(req.auth!.tenantId!, req.params.id as string, data);

    await createAuditLog({
      req,
      action: 'customer.update',
      entity: 'Customer',
      entityId: customer.id,
    });

    return success(res, customer);
  } catch (err) {
    next(err);
  }
});

customerRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await customerService.delete(req.auth!.tenantId!, req.params.id as string);

    await createAuditLog({
      req,
      action: 'customer.delete',
      entity: 'Customer',
      entityId: req.params.id as string,
    });

    return noContent(res);
  } catch (err) {
    next(err);
  }
});

// Tags
customerRouter.post('/:id/tags', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await customerService.addTag(req.auth!.tenantId!, req.params.id as string, req.body.tagId);
    return success(res, result);
  } catch (err) {
    next(err);
  }
});

customerRouter.delete('/:id/tags/:tagId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await customerService.removeTag(req.params.id as string, req.params.tagId as string);
    return noContent(res);
  } catch (err) {
    next(err);
  }
});

// Medical Record
customerRouter.get('/:id/medical-record', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const record = await customerService.getMedicalRecord(req.auth!.tenantId!, req.params.id as string);
    return success(res, record);
  } catch (err) {
    next(err);
  }
});

customerRouter.put('/:id/medical-record', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bloodType, allergies, medications, chronicDiseases, clinicalNotes } = req.body;
    const record = await customerService.upsertMedicalRecord(
      req.auth!.tenantId!,
      req.params.id as string,
      { bloodType, allergies, medications, chronicDiseases, clinicalNotes },
    );

    await createAuditLog({
      req,
      action: 'medical_record.update',
      entity: 'MedicalRecord',
      entityId: record.id,
    });

    return success(res, record);
  } catch (err) {
    next(err);
  }
});

customerRouter.post('/:id/medical-entries', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { content, type } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.auth!.userId }, select: { name: true } });
    const entry = await customerService.addMedicalEntry(
      req.auth!.tenantId!,
      req.params.id as string,
      {
        authorName: user?.name || 'Sistema',
        authorId: req.auth!.userId,
        type: type || 'note',
        content,
      },
    );

    await createAuditLog({
      req,
      action: 'medical_entry.create',
      entity: 'MedicalEntry',
      entityId: entry.id,
    });

    return created(res, entry);
  } catch (err) {
    next(err);
  }
});

customerRouter.delete('/:id/medical-entries/:entryId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await customerService.deleteMedicalEntry(req.auth!.tenantId!, req.params.entryId as string);

    await createAuditLog({
      req,
      action: 'medical_entry.delete',
      entity: 'MedicalEntry',
      entityId: req.params.entryId as string,
    });

    return noContent(res);
  } catch (err) {
    next(err);
  }
});
