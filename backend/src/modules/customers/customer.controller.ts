import { Router, Request, Response, NextFunction } from 'express';
import { customerService, checkDuplicatePhone } from './customer.service';
import { createCustomerSchema, updateCustomerSchema } from './customer.validators';
import { resolvePhones } from '../../shared/utils/phone';
import { success, created, noContent } from '../../shared/utils/response';
import { authenticate, requireTenant } from '../../shared/middleware/auth';
import { getPagination, paginationMeta } from '../../shared/utils/pagination';
import { createAuditLog } from '../../shared/middleware/audit';
import { logAction, getClientIp } from '../../services/auditLog.service';
import prisma from '../../config/database';

export const customerRouter = Router();

customerRouter.use(authenticate);
customerRouter.use(requireTenant);

function auditCtx(req: Request) {
  return {
    userId: req.auth?.userId,
    userEmail: req.auth?.email,
    userRole: req.auth?.role,
    tenantId: req.auth?.tenantId,
    ipAddress: getClientIp(req),
  };
}

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

// Fila de revisão de telefones (deve vir ANTES de /:id para não colidir).
customerRouter.get('/phone-review', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await customerService.listPhoneReview(req.auth!.tenantId!);
    return success(res, items);
  } catch (err) {
    next(err);
  }
});

customerRouter.patch('/phone-review/:reviewId/resolve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await customerService.resolvePhoneReview(req.auth!.tenantId!, req.params.reviewId as string);
    return success(res, item);
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

    await logAction({ ...auditCtx(req), action: 'CREATE', entity: 'PATIENT', entityId: customer.id, metadata: { name: customer.name } });

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

    await logAction({ ...auditCtx(req), action: 'UPDATE', entity: 'PATIENT', entityId: customer.id });

    return success(res, customer);
  } catch (err) {
    next(err);
  }
});

customerRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await customerService.delete(req.auth!.tenantId!, req.params.id as string);

    await logAction({ ...auditCtx(req), action: 'DELETE', entity: 'PATIENT', entityId: req.params.id as string });

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
    await customerService.removeTag(req.auth!.tenantId!, req.params.id as string, req.params.tagId as string);
    return noContent(res);
  } catch (err) {
    next(err);
  }
});

// Medical Record
customerRouter.get('/:id/medical-record', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const record = await customerService.getMedicalRecord(req.auth!.tenantId!, req.params.id as string);
    await logAction({ ...auditCtx(req), action: 'VIEW', entity: 'PATIENT', entityId: req.params.id as string, metadata: { resource: 'medical-record' } });
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

// Patient Documents
customerRouter.get('/:id/documents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const docs = await prisma.patientDocument.findMany({
      where: { tenantId: req.auth!.tenantId!, customerId: req.params.id as string },
      select: { id: true, fileName: true, fileType: true, fileSize: true, category: true, description: true, uploaderName: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return success(res, docs);
  } catch (err) {
    next(err);
  }
});

customerRouter.get('/:id/documents/:docId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const doc = await prisma.patientDocument.findFirst({
      where: { id: req.params.docId as string, tenantId: req.auth!.tenantId!, customerId: req.params.id as string },
    });
    if (!doc) return res.status(404).json({ success: false, error: { message: 'Documento nao encontrado' } });
    return success(res, doc);
  } catch (err) {
    next(err);
  }
});

customerRouter.post('/:id/documents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { fileName, fileType, fileSize, fileData, category, description } = req.body;
    if (!fileName || !fileType || !fileData) {
      return res.status(400).json({ success: false, error: { message: 'fileName, fileType e fileData sao obrigatorios' } });
    }
    const user = await prisma.user.findUnique({ where: { id: req.auth!.userId }, select: { name: true } });
    const doc = await prisma.patientDocument.create({
      data: {
        tenantId: req.auth!.tenantId!,
        customerId: req.params.id as string,
        fileName,
        fileType,
        fileSize: fileSize || 0,
        fileData,
        category: category || 'OUTRO',
        description: description || null,
        uploadedBy: req.auth!.userId,
        uploaderName: user?.name || 'Sistema',
      },
      select: { id: true, fileName: true, fileType: true, fileSize: true, category: true, description: true, uploaderName: true, createdAt: true },
    });
    await logAction({ ...auditCtx(req), action: 'CREATE', entity: 'PATIENT_DOCUMENT', entityId: doc.id, metadata: { fileName, category } });
    return created(res, doc);
  } catch (err) {
    next(err);
  }
});

customerRouter.delete('/:id/documents/:docId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const doc = await prisma.patientDocument.findFirst({
      where: { id: req.params.docId as string, tenantId: req.auth!.tenantId!, customerId: req.params.id as string },
    });
    if (!doc) return res.status(404).json({ success: false, error: { message: 'Documento nao encontrado' } });
    await prisma.patientDocument.delete({ where: { id: doc.id } });
    await logAction({ ...auditCtx(req), action: 'DELETE', entity: 'PATIENT_DOCUMENT', entityId: doc.id, metadata: { fileName: doc.fileName } });
    return noContent(res);
  } catch (err) {
    next(err);
  }
});

// Batch import (receives pre-mapped JSON from frontend)
customerRouter.post('/import-batch', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, error: { message: 'Nenhum dado para importar' } });
    }

    const tenantId = req.auth!.tenantId!;
    const results = { imported: 0, skipped: 0, errors: [] as string[] };

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        if (!r.name || !r.name.trim()) {
          results.errors.push(`Linha ${i + 1}: nome obrigatório`);
          results.skipped++;
          continue;
        }

        let birthDate: Date | null = null;
        if (r.birthDate) {
          const d = new Date(r.birthDate);
          if (!isNaN(d.getTime())) birthDate = d;
        }

        const address = (r.cep || r.street || r.number || r.neighborhood || r.city || r.state)
          ? { cep: r.cep || '', street: r.street || '', number: r.number || '', neighborhood: r.neighborhood || '', city: r.city || '', state: r.state || '' }
          : undefined;

        const phones = resolvePhones({ phone: r.phone, cellPhone: r.cellPhone, landlinePhone: r.landlinePhone });
        await checkDuplicatePhone(tenantId, phones.cellPhone);

        await prisma.customer.create({
          data: {
            tenantId,
            name: r.name.trim(),
            phone: phones.phone,
            cellPhone: phones.cellPhone,
            landlinePhone: phones.landlinePhone,
            email: r.email || null,
            cpfCnpj: r.cpfCnpj || null,
            birthDate,
            insurance: r.insurance || null,
            notes: r.notes || null,
            origin: r.origin || 'importacao_csv',
            address: address || undefined,
          },
        });
        results.imported++;
      } catch (err: any) {
        results.errors.push(`Linha ${i + 1}: ${err.message?.slice(0, 80)}`);
        results.skipped++;
      }
    }

    await logAction({ ...auditCtx(req), action: 'IMPORT', entity: 'PATIENT', entityId: 'bulk', metadata: { imported: results.imported, skipped: results.skipped } });

    return success(res, results);
  } catch (err) {
    next(err);
  }
});

// Promote dependent to titular (remove responsavel link)
customerRouter.post('/:id/promote-titular', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await customerService.promoteToTitular(req.auth!.tenantId!, req.params.id as string, req.body.phone);
    await logAction({ ...auditCtx(req), action: 'UPDATE', entity: 'PATIENT', entityId: req.params.id as string, metadata: { action: 'promote_titular' } });
    return success(res, result);
  } catch (err) {
    next(err);
  }
});
