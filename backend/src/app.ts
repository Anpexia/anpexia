// ====== DIAGNÓSTICO DE STARTUP ======
console.log('>>> [BOOT] app.ts carregando... v2.1');
console.log('>>> [BOOT] cwd:', process.cwd());
console.log('>>> [BOOT] NODE_ENV:', process.env.NODE_ENV);
console.log('>>> [BOOT] PORT:', process.env.PORT);
console.log('>>> [BOOT] DATABASE_URL definida?', !!process.env.DATABASE_URL);
console.log('>>> [BOOT] JWT_SECRET definida?', !!process.env.JWT_SECRET);
console.log('>>> [BOOT] JWT_REFRESH_SECRET definida?', !!process.env.JWT_REFRESH_SECRET);
console.log('>>> [BOOT] ENCRYPTION_KEY definida?', !!process.env.ENCRYPTION_KEY);
console.log('>>> [BOOT] CORS_ORIGIN:', process.env.CORS_ORIGIN);

// Capturar crashes silenciosos
process.on('uncaughtException', (err) => {
  console.error('💀 [CRASH] uncaughtException:', err.message, err.stack);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('💀 [CRASH] unhandledRejection:', reason);
});
process.on('SIGTERM', () => console.log('>>> [SIGNAL] SIGTERM recebido'));
process.on('SIGINT', () => console.log('>>> [SIGNAL] SIGINT recebido'));
// ====================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Em produção (Railway/Render), o app roda atrás de um reverse proxy.
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// --- 1) CORS — DEVE ser o primeiro middleware ---
const PRODUCTION_ORIGINS = [
  'https://anpexia-admin.vercel.app',
  'https://anpexia-app-kohl.vercel.app',
  'https://anpexia-landing-eight.vercel.app',
  'https://app.anpexia.com.br',
  'https://admin.anpexia.com.br',
  'https://anpexia.com.br',
];
const envOrigins = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim().replace(/\/$/, '')) ?? [];
const allowedOrigins = [...new Set([...envOrigins, ...PRODUCTION_ORIGINS])]
  .filter((o) => o && o !== '*')
  .map((o) => o.replace(/\/$/, ''));

const corsOptions: cors.CorsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    const normalizedOrigin = origin.replace(/\/$/, '');

    if (allowedOrigins.includes(normalizedOrigin)) {
      return callback(null, true);
    }

    console.log('CORS blocked:', origin, '| Allowed:', allowedOrigins);
    // Allow Vercel preview deployments
    if (normalizedOrigin.includes('vercel.app') || normalizedOrigin.includes('anpexia')) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// --- 2) Helmet — DEPOIS do CORS ---
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: false,
  }),
);

// --- 3) Parsers e logging ---
app.use(express.json());
app.use(cookieParser());
app.use(morgan('dev'));

// --- 4) Health checks (Railway usa / ou /health) ---
app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'anpexia-api', timestamp: new Date().toISOString() });
});
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- 5) Rotas da API (carregadas com lazy import para capturar erros) ---
async function loadRoutes() {
  try {
    // Carrega env e valida variáveis obrigatórias
    const { env } = await import('./config/env');
    console.log(`✅ Env carregado (NODE_ENV=${env.nodeEnv})`);

    const { authRouter } = await import('./modules/auth/auth.controller');
    const { tenantRouter } = await import('./modules/tenants/tenant.controller');
    const { customerRouter } = await import('./modules/customers/customer.controller');
    const { inventoryRouter } = await import('./modules/inventory/inventory.controller');
    const { messagingRouter } = await import('./modules/messaging/messaging.controller');
    const { dashboardRouter } = await import('./modules/dashboard/dashboard.controller');
    const { chatbotRouter } = await import('./modules/chatbot/chatbot.controller');
    const { chatbotService } = await import('./modules/chatbot/chatbot.service');
    const schedulingRouter = (await import('./modules/scheduling/scheduling.controller')).default;
    const salesRouter = (await import('./modules/sales/sales.controller')).default;
    const onboardingRouter = (await import('./modules/onboarding/onboarding.controller')).default;
    const { scriptsRouter } = await import('./modules/scripts/scripts.controller');
    const { supplierRouter } = await import('./modules/suppliers/supplier.controller');
    const { demoRouter } = await import('./modules/demo/demo.controller');
    const { demoJFRouter } = await import('./modules/demo-jf/demo-jf.controller');

    app.use('/api/v1/auth', authRouter);
    app.use('/api/v1/tenants', tenantRouter);
    app.use('/api/v1/customers', customerRouter);
    app.use('/api/v1/inventory', inventoryRouter);
    app.use('/api/v1/messaging', messagingRouter);
    app.use('/api/v1/dashboard', dashboardRouter);
    // Debug: log ALL incoming webhook-like requests to detect Evolution API format
    app.all('/api/v1/chatbot/webhook*', (req, res, next) => {
      console.log(`[WEBHOOK-DEBUG] ${req.method} ${req.path} | Body keys: ${Object.keys(req.body || {}).join(',')} | IP: ${req.ip}`);
      next();
    });

    // Test endpoint — no auth, registered before chatbot router
    app.post('/api/v1/chatbot/test-message', async (req, res) => {
      try {
        const { phone, message } = req.body;
        if (!phone || !message) {
          return res.status(400).json({ success: false, error: 'Missing phone or message in body' });
        }
        const result = await chatbotService.handleTestMessage(phone, message);
        return res.json({ success: true, ...result });
      } catch (err: any) {
        console.error('[TEST-MESSAGE] Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
      }
    });
    app.use('/api/v1/chatbot', chatbotRouter);

    // Test email endpoint — no auth
    app.post('/api/v1/test/email', async (req, res) => {
      try {
        const { sendEmail } = await import('./services/email.service');
        const result = await sendEmail({
          to: 'angelolarocca10@gmail.com',
          subject: 'Teste Resend Anpexia',
          html: '<h2>Teste Resend Anpexia</h2><p>Configuração de email funcionando com sucesso! ✅</p>',
          text: 'Configuração de email funcionando com sucesso!',
        });
        console.log('[TEST-EMAIL] Sent:', result.id);
        return res.json({ success: true, emailId: result.id });
      } catch (err: any) {
        console.error('[TEST-EMAIL] Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
      }
    });
    app.use('/api/v1/scheduling', schedulingRouter);
    app.use('/api/v1/sales', salesRouter);
    app.use('/api/v1/onboarding', onboardingRouter);
    app.use('/api/v1/scripts', scriptsRouter);
    app.use('/api/v1/suppliers', supplierRouter);
    app.use('/api/v1/demo', demoRouter);
    app.use('/api/v1/demo-jf', demoJFRouter);

    const { errorHandler } = await import('./shared/middleware/error-handler');
    app.use(errorHandler);

    console.log('✅ Todas as rotas carregadas');

    // Initialize background cron jobs (non-blocking, won't crash if it fails)
    try {
      const { initCronJobs } = await import('./jobs/cron');
      initCronJobs();
    } catch (cronErr) {
      console.error('⚠️ Cron jobs failed to initialize:', cronErr);
    }
  } catch (err) {
    console.error('❌ ERRO ao carregar rotas:', err);
    // Rota fallback para que o app não fique mudo
    app.use('/api', (_req, res) => {
      res.status(503).json({
        success: false,
        error: { code: 'STARTUP_ERROR', message: 'Servidor iniciou mas falhou ao carregar módulos' },
      });
    });
  }
}

// Inicia o servidor PRIMEIRO, carrega rotas DEPOIS
console.log(`>>> [BOOT] Chamando app.listen na porta ${PORT} em 0.0.0.0...`);
const server = app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`🚀 Anpexia API ouvindo em 0.0.0.0:${PORT}`);
  loadRoutes();

  // Heartbeat: prova que o processo está vivo
  setInterval(() => {
    console.log(`💓 [HEARTBEAT] Processo vivo | uptime=${Math.floor(process.uptime())}s | mem=${Math.floor(process.memoryUsage().rss / 1024 / 1024)}MB`);
  }, 30_000);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  console.error(`❌ [BOOT] Falha ao abrir porta ${PORT}:`, err.message);
  process.exit(1);
});

export default app;
