import { Router, Request, Response, NextFunction } from 'express';
import { chatbotService } from './chatbot.service';
import { updateConfigSchema, webhookMessageSchema } from './chatbot.validators';
import { success, created } from '../../shared/utils/response';
import { authenticate, requireTenant, requireRole } from '../../shared/middleware/auth';
import { getPagination, paginationMeta } from '../../shared/utils/pagination';
import { createAuditLog } from '../../shared/middleware/audit';
import { evolutionApi } from '../messaging/evolution.client';

export const chatbotRouter = Router();

// ==========================================
// Webhook — recebe eventos do WhatsApp (Evolution API v2)
// Não requer autenticação (é chamado pela Evolution API)
// Evolution v2 sends: /webhook/messages-upsert, /webhook/connection-update, /webhook/qrcode-updated, etc.
// ==========================================

// Handle exact /webhook path (Evolution v1 format — webhookByEvents: false)
chatbotRouter.post('/webhook', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body;
    console.log(`[WEBHOOK-V1] FULL PAYLOAD:`, JSON.stringify(body));
    console.log(`[WEBHOOK-V1] Event: ${body.event}, Instance: ${body.instance}, Has data.key: ${!!body?.data?.key}`);

    // Evolution v1 (webhookByEvents: false) sends event in the body
    // It may wrap differently — handle both formats
    if (body.event === 'messages.upsert' || body.event === 'MESSAGES_UPSERT') {
      const data = webhookMessageSchema.parse(body);
      await chatbotService.handleIncomingMessage(data);
    } else if (body.data?.key) {
      // Try parsing as v1 message anyway
      const data = webhookMessageSchema.parse(body);
      await chatbotService.handleIncomingMessage(data);
    } else {
      console.log(`[WEBHOOK-V1] Non-message event: ${body.event || 'unknown'}`);
    }

    return res.status(200).json({ received: true });
  } catch (err: any) {
    console.error(`[WEBHOOK-V1] Error:`, err.message || err);
    return res.status(200).json({ received: true, error: true });
  }
});

// Handle /webhook/:event path (Evolution v2 format)
chatbotRouter.post('/webhook/:event', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const event = req.params.event as string;
    console.log(`[WEBHOOK] Event: ${event}`, JSON.stringify(req.body).slice(0, 200));

    if (event === 'messages-upsert') {
      // Transform v2 format to v1 format the service expects
      const body = req.body;
      if (body.data && body.data.key) {
        const data = webhookMessageSchema.parse({
          instance: body.instance,
          data: body.data,
          event: 'messages.upsert',
        });
        await chatbotService.handleIncomingMessage(data);
      }
    } else if (event === 'qrcode-updated') {
      // Log QR code for debugging — QR can be fetched via /instance/connect
      console.log(`[WEBHOOK] QR Code updated for instance: ${req.body?.instance}`);
    } else if (event === 'connection-update') {
      console.log(`[WEBHOOK] Connection update for ${req.body?.instance}: ${JSON.stringify(req.body?.data?.state || req.body?.data)}`);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    // Don't fail on webhook errors — always return 200 to Evolution API
    console.error(`[WEBHOOK] Error processing ${req.params.event}:`, err);
    return res.status(200).json({ received: true, error: true });
  }
});

// ==========================================
// Rotas autenticadas — configuração e histórico
// ==========================================

chatbotRouter.use(authenticate);
chatbotRouter.use(requireTenant);

// Configuração do chatbot para o tenant
chatbotRouter.get('/config', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await chatbotService.getConfig(req.auth!.tenantId!);
    return success(res, config);
  } catch (err) {
    next(err);
  }
});

chatbotRouter.put('/config', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateConfigSchema.parse(req.body);
    const config = await chatbotService.updateConfig(req.auth!.tenantId!, data);

    await createAuditLog({
      req,
      action: 'chatbot.config.update',
      entity: 'ChatbotConfig',
      entityId: config.id,
    });

    return success(res, config);
  } catch (err) {
    next(err);
  }
});

// FAQs
chatbotRouter.get('/faqs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const faqs = await chatbotService.listFaqs(req.auth!.tenantId!);
    return success(res, faqs);
  } catch (err) {
    next(err);
  }
});

chatbotRouter.post('/faqs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const faq = await chatbotService.createFaq(req.auth!.tenantId!, req.body);
    return created(res, faq);
  } catch (err) {
    next(err);
  }
});

chatbotRouter.put('/faqs/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const faq = await chatbotService.updateFaq(req.auth!.tenantId!, req.params.id as string, req.body);
    return success(res, faq);
  } catch (err) {
    next(err);
  }
});

chatbotRouter.delete('/faqs/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await chatbotService.deleteFaq(req.auth!.tenantId!, req.params.id as string);
    return res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// Histórico de conversas
chatbotRouter.get('/conversations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, skip } = getPagination(req);
    const { conversations, total } = await chatbotService.listConversations(
      req.auth!.tenantId!,
      { skip, take: limit },
    );
    return success(res, conversations, paginationMeta(total, page, limit));
  } catch (err) {
    next(err);
  }
});

chatbotRouter.get('/conversations/:phone', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const messages = await chatbotService.getConversation(req.auth!.tenantId!, req.params.phone as string);
    return success(res, messages);
  } catch (err) {
    next(err);
  }
});

// Estatísticas
chatbotRouter.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await chatbotService.getStats(req.auth!.tenantId!);
    return success(res, stats);
  } catch (err) {
    next(err);
  }
});

// ==========================================
// WhatsApp instance management
// ==========================================

// Get QR code to connect WhatsApp for this tenant
chatbotRouter.get('/whatsapp/qrcode', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await chatbotService.getConfig(req.auth!.tenantId!);
    if (!config.instanceName) {
      return res.status(400).json({ success: false, error: { message: 'Instancia WhatsApp nao configurada' } });
    }
    const qr = await evolutionApi.getQrCode(config.instanceName);
    return success(res, qr);
  } catch (err) {
    next(err);
  }
});

// Get WhatsApp connection status for this tenant
chatbotRouter.get('/whatsapp/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await chatbotService.getConfig(req.auth!.tenantId!);
    if (!config.instanceName) {
      return success(res, { state: 'not_configured', instanceName: null });
    }
    const state = await evolutionApi.getConnectionState(config.instanceName);
    return success(res, { ...state, instanceName: config.instanceName });
  } catch (err) {
    next(err);
  }
});
