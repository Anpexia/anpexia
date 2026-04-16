import { Router, Request, Response, NextFunction } from 'express';
import { financialService } from './financial.service';
import { success, created, noContent } from '../../shared/utils/response';
import { authenticate, requireTenant } from '../../shared/middleware/auth';
import { getPagination, paginationMeta } from '../../shared/utils/pagination';
import { createAuditLog } from '../../shared/middleware/audit';

export const financialRouter = Router();

financialRouter.use(authenticate);
financialRouter.use(requireTenant);

// ==========================================
// TRANSACTIONS
// ==========================================

financialRouter.get('/transactions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, skip } = getPagination(req);
    const type = req.query.type as string | undefined;
    const subtype = req.query.subtype as string | undefined;
    const category = req.query.category as string | undefined;
    const status = req.query.status as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    const { transactions, total } = await financialService.listTransactions(
      req.auth!.tenantId!,
      { skip, take: limit, type, subtype, category, status, startDate, endDate },
    );

    return success(res, transactions, paginationMeta(total, page, limit));
  } catch (err) {
    next(err);
  }
});

financialRouter.post('/transactions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const transaction = await financialService.createTransaction(req.auth!.tenantId!, req.body);

    await createAuditLog({
      req,
      action: 'financial_transaction.create',
      entity: 'FinancialTransaction',
      entityId: transaction.id,
      changes: { after: transaction },
    });

    return created(res, transaction);
  } catch (err) {
    next(err);
  }
});

financialRouter.put('/transactions/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const transaction = await financialService.updateTransaction(
      req.auth!.tenantId!,
      req.params.id as string,
      req.body,
    );

    await createAuditLog({
      req,
      action: 'financial_transaction.update',
      entity: 'FinancialTransaction',
      entityId: transaction.id,
    });

    return success(res, transaction);
  } catch (err) {
    next(err);
  }
});

financialRouter.delete('/transactions/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await financialService.deleteTransaction(req.auth!.tenantId!, req.params.id as string);

    await createAuditLog({
      req,
      action: 'financial_transaction.delete',
      entity: 'FinancialTransaction',
      entityId: req.params.id as string,
    });

    return noContent(res);
  } catch (err) {
    next(err);
  }
});

// ==========================================
// SUMMARY
// ==========================================

financialRouter.get('/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const month = req.query.month ? Number(req.query.month) : undefined;
    const year = req.query.year ? Number(req.query.year) : undefined;

    const summary = await financialService.getSummary(req.auth!.tenantId!, month, year);

    return success(res, summary);
  } catch (err) {
    next(err);
  }
});

// ==========================================
// CATEGORIES
// ==========================================

financialRouter.get('/categories', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const type = req.query.type as string | undefined;
    const categories = await financialService.listCategories(req.auth!.tenantId!, type);

    return success(res, categories);
  } catch (err) {
    next(err);
  }
});

financialRouter.post('/categories', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const category = await financialService.createCategory(req.auth!.tenantId!, req.body);

    await createAuditLog({
      req,
      action: 'financial_category.create',
      entity: 'FinancialCategory',
      entityId: category.id,
      changes: { after: category },
    });

    return created(res, category);
  } catch (err) {
    next(err);
  }
});

financialRouter.put('/categories/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const category = await financialService.updateCategory(
      req.auth!.tenantId!,
      req.params.id as string,
      req.body,
    );

    await createAuditLog({
      req,
      action: 'financial_category.update',
      entity: 'FinancialCategory',
      entityId: category.id,
    });

    return success(res, category);
  } catch (err) {
    next(err);
  }
});

financialRouter.delete('/categories/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await financialService.deleteCategory(req.auth!.tenantId!, req.params.id as string);

    await createAuditLog({
      req,
      action: 'financial_category.delete',
      entity: 'FinancialCategory',
      entityId: req.params.id as string,
    });

    return noContent(res);
  } catch (err) {
    next(err);
  }
});
