import { Router, Request, Response, NextFunction } from 'express';
import { LeadStage } from '@prisma/client';
import { authenticate, requireRole } from '../../shared/middleware/auth';
import { success, created } from '../../shared/utils/response';
import { getPagination, paginationMeta } from '../../shared/utils/pagination';
import { AppError } from '../../shared/middleware/error-handler';
import {
  createLeadSchema,
  updateLeadSchema,
  updateStageSchema,
  addNoteSchema,
} from './sales.validators';
import * as salesService from './sales.service';
import { automationService } from './automation.service';

const router = Router();

// ========== Public route — lead capture from landing page ==========
router.post('/capture', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createLeadSchema.parse(req.body);
    const lead = await salesService.createLead({ ...parsed, source: parsed.source || 'landing_page' });
    return created(res, { id: lead.id, message: 'Lead capturado com sucesso' });
  } catch (err) {
    next(err);
  }
});

// ========== Protected routes — SUPER_ADMIN only ==========
router.use(authenticate, requireRole('SUPER_ADMIN'));

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req);
  const stage = req.query.stage as LeadStage | undefined;
  const source = req.query.source as string | undefined;
  const search = req.query.search as string | undefined;

  const { leads, total } = await salesService.listLeads({ stage, source, search, page, limit, skip });
  return success(res, leads, paginationMeta(total, page, limit));
}));

router.get('/stats', asyncHandler(async (_req, res) => {
  const stats = await salesService.getStats();
  return success(res, stats);
}));

router.get('/pipeline', asyncHandler(async (_req, res) => {
  const pipeline = await salesService.getPipeline();
  return success(res, pipeline);
}));

// ========== Automation Templates (before /:id to avoid route conflict) ==========

router.get('/templates', asyncHandler(async (_req, res) => {
  const templates = await automationService.listTemplates();
  return success(res, templates);
}));

router.put('/templates/:id', asyncHandler(async (req, res) => {
  const { name, body, isActive, delayMinutes } = req.body;
  const template = await automationService.updateTemplate(req.params.id as string, { name, body, isActive, delayMinutes });
  return success(res, template);
}));

router.post('/templates/seed', asyncHandler(async (_req, res) => {
  await automationService.seedTemplates();
  return success(res, { message: 'Templates populados com sucesso' });
}));

// ========== Lead CRUD ==========

router.get('/:id', asyncHandler(async (req, res) => {
  const lead = await salesService.getLeadById(req.params.id as string);
  return success(res, lead);
}));

router.post('/', asyncHandler(async (req, res) => {
  const parsed = createLeadSchema.parse(req.body);
  const lead = await salesService.createLead(parsed);
  return created(res, lead);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const parsed = updateLeadSchema.parse(req.body);
  const lead = await salesService.updateLead(req.params.id as string, parsed);
  return success(res, lead);
}));

router.patch('/:id/stage', asyncHandler(async (req, res) => {
  const { stage, reason } = updateStageSchema.parse(req.body);
  const lead = await salesService.updateStage(req.params.id as string, stage, reason);
  return success(res, lead);
}));

router.post('/:id/notes', asyncHandler(async (req, res) => {
  const { note } = addNoteSchema.parse(req.body);
  const activity = await salesService.addNote(req.params.id as string, note);
  return created(res, activity);
}));

export default router;
