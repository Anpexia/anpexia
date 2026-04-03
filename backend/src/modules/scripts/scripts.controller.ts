import { Router, Request, Response, NextFunction } from 'express';
import { scriptsService } from './scripts.service';
import { createCategorySchema, updateCategorySchema, createScriptSchema, updateScriptSchema } from './scripts.validators';
import { success, created, noContent } from '../../shared/utils/response';
import { authenticate, requireTenant } from '../../shared/middleware/auth';
import { createAuditLog } from '../../shared/middleware/audit';

export const scriptsRouter = Router();

scriptsRouter.use(authenticate);
scriptsRouter.use(requireTenant);

// Categories
scriptsRouter.get('/categories', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await scriptsService.listCategories(req.auth!.tenantId!);
    return success(res, categories);
  } catch (err) {
    next(err);
  }
});

scriptsRouter.post('/categories', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createCategorySchema.parse(req.body);
    const category = await scriptsService.createCategory(req.auth!.tenantId!, data);
    await createAuditLog({ req, action: 'script_category.create', entity: 'ScriptCategory', entityId: category.id });
    return created(res, category);
  } catch (err) {
    next(err);
  }
});

scriptsRouter.put('/categories/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateCategorySchema.parse(req.body);
    const category = await scriptsService.updateCategory(req.auth!.tenantId!, req.params.id as string, data);
    await createAuditLog({ req, action: 'script_category.update', entity: 'ScriptCategory', entityId: category.id });
    return success(res, category);
  } catch (err) {
    next(err);
  }
});

scriptsRouter.delete('/categories/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await scriptsService.deleteCategory(req.auth!.tenantId!, req.params.id as string);
    await createAuditLog({ req, action: 'script_category.delete', entity: 'ScriptCategory', entityId: req.params.id as string });
    return noContent(res);
  } catch (err) {
    next(err);
  }
});

// Scripts
scriptsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = req.query.search as string | undefined;
    const categoryId = req.query.categoryId as string | undefined;
    const scripts = await scriptsService.listScripts(req.auth!.tenantId!, { search, categoryId });
    return success(res, scripts);
  } catch (err) {
    next(err);
  }
});

scriptsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const script = await scriptsService.getScriptById(req.auth!.tenantId!, req.params.id as string);
    return success(res, script);
  } catch (err) {
    next(err);
  }
});

scriptsRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createScriptSchema.parse(req.body);
    const script = await scriptsService.createScript(req.auth!.tenantId!, data);
    await createAuditLog({ req, action: 'script.create', entity: 'Script', entityId: script.id });
    return created(res, script);
  } catch (err) {
    next(err);
  }
});

scriptsRouter.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateScriptSchema.parse(req.body);
    const script = await scriptsService.updateScript(req.auth!.tenantId!, req.params.id as string, data);
    await createAuditLog({ req, action: 'script.update', entity: 'Script', entityId: script.id });
    return success(res, script);
  } catch (err) {
    next(err);
  }
});

scriptsRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await scriptsService.deleteScript(req.auth!.tenantId!, req.params.id as string);
    await createAuditLog({ req, action: 'script.delete', entity: 'Script', entityId: req.params.id as string });
    return noContent(res);
  } catch (err) {
    next(err);
  }
});

// Seed default scripts
scriptsRouter.post('/seed', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await scriptsService.seedDefaultScripts(req.auth!.tenantId!);
    return success(res, { message: 'Scripts padrao criados com sucesso' });
  } catch (err) {
    next(err);
  }
});
