import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import Papa from 'papaparse';
import { customerService } from './customer.service';
import { createCustomerSchema, updateCustomerSchema } from './customer.validators';
import { success, created, noContent } from '../../shared/utils/response';
import { authenticate, requireTenant } from '../../shared/middleware/auth';
import { getPagination, paginationMeta } from '../../shared/utils/pagination';
import { createAuditLog } from '../../shared/middleware/audit';
import { logAction, getClientIp } from '../../services/auditLog.service';
import prisma from '../../config/database';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

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

// CSV Import
const CSV_COLUMN_MAP: Record<string, string> = {
  nome: 'name', name: 'name',
  telefone: 'phone', phone: 'phone', celular: 'phone', whatsapp: 'phone',
  email: 'email', 'e-mail': 'email',
  cpf: 'cpfCnpj', cnpj: 'cpfCnpj', cpfcnpj: 'cpfCnpj', 'cpf/cnpj': 'cpfCnpj',
  nascimento: 'birthDate', 'data de nascimento': 'birthDate', 'data nascimento': 'birthDate', birthdate: 'birthDate',
  convenio: 'insurance', plano: 'insurance', insurance: 'insurance',
  observacoes: 'notes', notas: 'notes', notes: 'notes', obs: 'notes',
  origem: 'origin', origin: 'origin',
  cep: 'cep', endereco: 'street', rua: 'street', street: 'street',
  numero: 'number', number: 'number', num: 'number',
  bairro: 'neighborhood', neighborhood: 'neighborhood',
  cidade: 'city', city: 'city',
  estado: 'state', uf: 'state', state: 'state',
};

customerRouter.post('/import', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, error: { message: 'Arquivo CSV obrigatório' } });

    const csvText = file.buffer.toString('utf-8').replace(/^﻿/, '');
    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true, transformHeader: (h: string) => h.trim().toLowerCase() });

    if (!parsed.data || parsed.data.length === 0) {
      return res.status(400).json({ success: false, error: { message: 'Arquivo vazio ou formato inválido' } });
    }

    const tenantId = req.auth!.tenantId!;
    const results = { imported: 0, skipped: 0, errors: [] as string[] };

    for (let i = 0; i < (parsed.data as any[]).length; i++) {
      const row = parsed.data[i] as Record<string, string>;
      try {
        const mapped: Record<string, any> = {};
        for (const [csvCol, val] of Object.entries(row)) {
          const field = CSV_COLUMN_MAP[csvCol.trim().toLowerCase()];
          if (field && val && val.trim()) mapped[field] = val.trim();
        }

        if (!mapped.name) {
          results.errors.push(`Linha ${i + 2}: nome obrigatório`);
          results.skipped++;
          continue;
        }

        const address = (mapped.cep || mapped.street || mapped.number || mapped.neighborhood || mapped.city || mapped.state)
          ? { cep: mapped.cep || '', street: mapped.street || '', number: mapped.number || '', neighborhood: mapped.neighborhood || '', city: mapped.city || '', state: mapped.state || '' }
          : undefined;

        await prisma.customer.create({
          data: {
            tenantId,
            name: mapped.name,
            phone: mapped.phone || null,
            email: mapped.email || null,
            cpfCnpj: mapped.cpfCnpj || null,
            birthDate: mapped.birthDate ? new Date(mapped.birthDate.split('/').reverse().join('-')) : null,
            insurance: mapped.insurance || null,
            notes: mapped.notes || null,
            origin: mapped.origin || 'importacao_csv',
            address: address || undefined,
          },
        });
        results.imported++;
      } catch (err: any) {
        results.errors.push(`Linha ${i + 2}: ${err.message?.slice(0, 80)}`);
        results.skipped++;
      }
    }

    await logAction({ ...auditCtx(req), action: 'IMPORT', entity: 'PATIENT', entityId: 'bulk', metadata: { imported: results.imported, skipped: results.skipped } });

    return success(res, results);
  } catch (err) {
    next(err);
  }
});
