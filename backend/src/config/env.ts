import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Tenta carregar .env em qualquer ambiente (não faz mal se as vars já estiverem no process.env)
// dotenv NÃO sobrescreve vars que já existem no ambiente
let dir = process.cwd();
let found = false;
while (!found) {
  const envPath = path.join(dir, '.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    found = true;
  } else {
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}
if (!found) {
  console.warn('⚠️  Arquivo .env não encontrado. Usando variáveis do ambiente.');
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`❌ Variável de ambiente obrigatória não definida: ${name}`);
    throw new Error(`Variável de ambiente obrigatória não definida: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  // JWT — obrigatórias, sem fallback inseguro
  jwtSecret: required('JWT_SECRET'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  frontendUrl: process.env.FRONTEND_URL || 'https://app.anpexia.com.br',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',

  // Banco de dados
  databaseUrl: required('DATABASE_URL'),

  // Evolution API (WhatsApp)
  evolutionApiUrl: process.env.EVOLUTION_API_URL || 'http://localhost:8080',
  evolutionApiKey: process.env.EVOLUTION_API_KEY || '',

  // Pagamentos (Mercado Pago)
  mpAccessToken: process.env.MP_ACCESS_TOKEN || '',
  mpPublicKey: process.env.MP_PUBLIC_KEY || '',

  // Criptografia — obrigatória, sem fallback inseguro
  encryptionKey: required('ENCRYPTION_KEY'),

  // IA (Chatbot) — Claude / Anthropic
  anthropicApiKey: required('ANTHROPIC_API_KEY'),

  // Cosmos Bluesoft (barcode product lookup) — opcional
  cosmosApiToken: process.env.COSMOS_API_TOKEN || '',

  // SMTP (Email) — legacy, kept for tenant-level config
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: Number(process.env.SMTP_PORT) || 587,
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  smtpFrom: process.env.SMTP_FROM || '',

  // Resend (HTTP email API) — primary email service
  resendApiKey: process.env.RESEND_API_KEY || '',
  emailFrom: process.env.EMAIL_FROM || 'onboarding@resend.dev',
} as const;
