const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  // Create enums first
  const enums = [
    `DO $$ BEGIN CREATE TYPE "InstanceConnectionStatus" AS ENUM ('open', 'close', 'connecting'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
    `DO $$ BEGIN CREATE TYPE "DeviceMessage" AS ENUM ('ios', 'android', 'web', 'unknown', 'desktop'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
    `DO $$ BEGIN CREATE TYPE "SessionStatus" AS ENUM ('opened', 'closed', 'paused'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
    `DO $$ BEGIN CREATE TYPE "TriggerType" AS ENUM ('all', 'keyword', 'none', 'advanced'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
    `DO $$ BEGIN CREATE TYPE "TriggerOperator" AS ENUM ('contains', 'equals', 'startsWith', 'endsWith', 'regex'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
    `DO $$ BEGIN CREATE TYPE "OpenaiBotType" AS ENUM ('assistant', 'chatCompletion'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
    `DO $$ BEGIN CREATE TYPE "DifyBotType" AS ENUM ('chatBot', 'textGenerator', 'agent', 'workflow'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
  ];

  for (const sql of enums) {
    await prisma.$executeRawUnsafe(sql);
  }
  console.log('Enums created');

  // Create tables
  const tables = [
    `CREATE TABLE IF NOT EXISTS "Instance" (
      "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "name" VARCHAR(255) NOT NULL,
      "connectionStatus" "InstanceConnectionStatus" NOT NULL DEFAULT 'open',
      "ownerJid" VARCHAR(100),
      "profileName" VARCHAR(100),
      "profilePicUrl" VARCHAR(500),
      "integration" VARCHAR(100),
      "number" VARCHAR(100),
      "businessId" VARCHAR(100),
      "token" VARCHAR(255),
      "clientName" VARCHAR(100),
      "disconnectionReasonCode" INTEGER,
      "disconnectionObject" JSONB,
      "disconnectionAt" TIMESTAMP,
      "createdAt" TIMESTAMP DEFAULT now(),
      "updatedAt" TIMESTAMP,
      CONSTRAINT "Instance_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Instance_name_key" ON "Instance"("name")`,

    `CREATE TABLE IF NOT EXISTS "Session" (
      "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "sessionId" TEXT NOT NULL,
      "creds" TEXT,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "Session_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "Session_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Instance"("id") ON DELETE CASCADE
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Session_sessionId_key" ON "Session"("sessionId")`,

    `CREATE TABLE IF NOT EXISTS "Chat" (
      "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "remoteJid" VARCHAR(100) NOT NULL,
      "name" VARCHAR(100),
      "labels" JSONB,
      "createdAt" TIMESTAMP DEFAULT now(),
      "updatedAt" TIMESTAMP,
      "instanceId" TEXT NOT NULL,
      "unreadMessages" INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT "Chat_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "Chat_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Chat_instanceId_remoteJid_key" ON "Chat"("instanceId", "remoteJid")`,
    `CREATE INDEX IF NOT EXISTS "Chat_instanceId_idx" ON "Chat"("instanceId")`,
    `CREATE INDEX IF NOT EXISTS "Chat_remoteJid_idx" ON "Chat"("remoteJid")`,

    `CREATE TABLE IF NOT EXISTS "Contact" (
      "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "remoteJid" VARCHAR(100) NOT NULL,
      "pushName" VARCHAR(100),
      "profilePicUrl" VARCHAR(500),
      "createdAt" TIMESTAMP DEFAULT now(),
      "updatedAt" TIMESTAMP,
      "instanceId" TEXT NOT NULL,
      CONSTRAINT "Contact_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "Contact_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Contact_remoteJid_instanceId_key" ON "Contact"("remoteJid", "instanceId")`,

    `CREATE TABLE IF NOT EXISTS "IntegrationSession" (
      "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "sessionId" TEXT NOT NULL,
      "remoteJid" TEXT NOT NULL,
      "pushName" TEXT,
      "sessionStatus" "SessionStatus" NOT NULL DEFAULT 'opened',
      "awaitUser" BOOLEAN NOT NULL DEFAULT false,
      "context" JSONB,
      "botId" TEXT,
      "type" TEXT,
      "instanceId" TEXT NOT NULL,
      "parameters" JSONB,
      "createdAt" TIMESTAMP DEFAULT now(),
      "updatedAt" TIMESTAMP,
      CONSTRAINT "IntegrationSession_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "IntegrationSession_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationSession_sessionId_remoteJid_key" ON "IntegrationSession"("sessionId", "remoteJid")`,

    `CREATE TABLE IF NOT EXISTS "Webhook" (
      "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "url" VARCHAR(500) NOT NULL,
      "headers" JSONB,
      "enabled" BOOLEAN DEFAULT true,
      "events" JSONB,
      "webhookByEvents" BOOLEAN DEFAULT false,
      "webhookBase64" BOOLEAN DEFAULT false,
      "createdAt" TIMESTAMP DEFAULT now(),
      "updatedAt" TIMESTAMP,
      "instanceId" TEXT NOT NULL,
      CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "Webhook_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Webhook_instanceId_key" ON "Webhook"("instanceId")`,

    `CREATE TABLE IF NOT EXISTS "Setting" (
      "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "rejectCall" BOOLEAN DEFAULT false,
      "msgCall" VARCHAR(100),
      "groupsIgnore" BOOLEAN DEFAULT false,
      "alwaysOnline" BOOLEAN DEFAULT false,
      "readMessages" BOOLEAN DEFAULT false,
      "readStatus" BOOLEAN DEFAULT false,
      "syncFullHistory" BOOLEAN DEFAULT false,
      "createdAt" TIMESTAMP DEFAULT now(),
      "updatedAt" TIMESTAMP,
      "instanceId" TEXT NOT NULL,
      CONSTRAINT "Setting_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "Setting_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Setting_instanceId_key" ON "Setting"("instanceId")`,

    `CREATE TABLE IF NOT EXISTS "Message" (
      "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "key" JSONB NOT NULL,
      "pushName" VARCHAR(100),
      "participant" VARCHAR(100),
      "messageType" VARCHAR(100) NOT NULL,
      "message" JSONB NOT NULL,
      "contextInfo" JSONB,
      "source" "DeviceMessage" NOT NULL,
      "messageTimestamp" INTEGER NOT NULL,
      "chatwootMessageId" INTEGER,
      "chatwootInboxId" INTEGER,
      "chatwootConversationId" INTEGER,
      "chatwootContactInboxSourceId" VARCHAR(100),
      "chatwootIsRead" BOOLEAN,
      "instanceId" TEXT NOT NULL,
      "webhookUrl" VARCHAR(500),
      "status" VARCHAR(30),
      "sessionId" TEXT,
      CONSTRAINT "Message_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "Message_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE,
      CONSTRAINT "Message_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "IntegrationSession"("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "Message_instanceId_idx" ON "Message"("instanceId")`,

    `CREATE TABLE IF NOT EXISTS "MessageUpdate" (
      "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "keyId" VARCHAR(100) NOT NULL,
      "remoteJid" VARCHAR(100) NOT NULL,
      "fromMe" BOOLEAN NOT NULL,
      "participant" VARCHAR(100),
      "pollUpdates" JSONB,
      "status" VARCHAR(30) NOT NULL,
      "messageId" TEXT NOT NULL,
      "instanceId" TEXT NOT NULL,
      CONSTRAINT "MessageUpdate_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "MessageUpdate_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE,
      CONSTRAINT "MessageUpdate_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE
    )`,

    `CREATE TABLE IF NOT EXISTS "Label" (
      "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "labelId" VARCHAR(100) NOT NULL,
      "name" VARCHAR(100) NOT NULL,
      "color" INTEGER NOT NULL,
      "predefinedId" VARCHAR(100),
      "instanceId" TEXT NOT NULL,
      CONSTRAINT "Label_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "Label_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Label_labelId_instanceId_key" ON "Label"("labelId", "instanceId")`,

    `CREATE TABLE IF NOT EXISTS "Proxy" (
      "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "enabled" BOOLEAN NOT NULL DEFAULT false,
      "host" VARCHAR(100) NOT NULL,
      "port" VARCHAR(10) NOT NULL,
      "protocol" VARCHAR(10) NOT NULL,
      "username" VARCHAR(100),
      "password" VARCHAR(100),
      "instanceId" TEXT NOT NULL,
      CONSTRAINT "Proxy_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "Proxy_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Proxy_instanceId_key" ON "Proxy"("instanceId")`,

    `CREATE TABLE IF NOT EXISTS "Chatwoot" (
      "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "enabled" BOOLEAN NOT NULL DEFAULT false,
      "accountId" VARCHAR(100),
      "token" VARCHAR(100),
      "url" VARCHAR(500),
      "nameInbox" VARCHAR(100),
      "signMsg" BOOLEAN DEFAULT false,
      "signDelimiter" VARCHAR(100),
      "number" VARCHAR(100),
      "reopenConversation" BOOLEAN DEFAULT false,
      "conversationPending" BOOLEAN DEFAULT false,
      "mergeBrazilContacts" BOOLEAN DEFAULT false,
      "importContacts" BOOLEAN DEFAULT false,
      "importMessages" BOOLEAN DEFAULT false,
      "daysLimitImportMessages" INTEGER,
      "organization" VARCHAR(100),
      "logo" VARCHAR(500),
      "autoCreate" BOOLEAN DEFAULT true,
      "createdAt" TIMESTAMP DEFAULT now(),
      "updatedAt" TIMESTAMP,
      "instanceId" TEXT NOT NULL,
      CONSTRAINT "Chatwoot_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "Chatwoot_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Chatwoot_instanceId_key" ON "Chatwoot"("instanceId")`,

    `CREATE TABLE IF NOT EXISTS "Media" (
      "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "fileName" VARCHAR(500) NOT NULL,
      "type" VARCHAR(100) NOT NULL,
      "mimetype" VARCHAR(100) NOT NULL,
      "createdAt" TIMESTAMP DEFAULT now(),
      "messageId" TEXT NOT NULL,
      "instanceId" TEXT NOT NULL,
      CONSTRAINT "Media_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "Media_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE,
      CONSTRAINT "Media_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Media_messageId_key" ON "Media"("messageId")`,

    `CREATE TABLE IF NOT EXISTS "Template" (
      "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "templateId" VARCHAR(100) NOT NULL,
      "name" VARCHAR(100) NOT NULL,
      "template" JSONB NOT NULL,
      "webhookUrl" VARCHAR(500),
      "instanceId" TEXT NOT NULL,
      CONSTRAINT "Template_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "Template_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE
    )`,

    `CREATE TABLE IF NOT EXISTS "IsOnWhatsapp" (
      "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
      "remoteJid" VARCHAR(100) NOT NULL,
      "jidOptions" JSONB,
      CONSTRAINT "IsOnWhatsapp_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "IsOnWhatsapp_remoteJid_key" ON "IsOnWhatsapp"("remoteJid")`,

    // Message queue tables
    `CREATE TABLE IF NOT EXISTS "Rabbitmq" ("id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "enabled" BOOLEAN NOT NULL DEFAULT false, "events" JSONB, "instanceId" TEXT NOT NULL, CONSTRAINT "Rabbitmq_pkey" PRIMARY KEY ("id"), CONSTRAINT "Rabbitmq_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Rabbitmq_instanceId_key" ON "Rabbitmq"("instanceId")`,
    `CREATE TABLE IF NOT EXISTS "Nats" ("id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "enabled" BOOLEAN NOT NULL DEFAULT false, "events" JSONB, "instanceId" TEXT NOT NULL, CONSTRAINT "Nats_pkey" PRIMARY KEY ("id"), CONSTRAINT "Nats_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Nats_instanceId_key" ON "Nats"("instanceId")`,
    `CREATE TABLE IF NOT EXISTS "Sqs" ("id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "enabled" BOOLEAN NOT NULL DEFAULT false, "events" JSONB, "instanceId" TEXT NOT NULL, CONSTRAINT "Sqs_pkey" PRIMARY KEY ("id"), CONSTRAINT "Sqs_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Sqs_instanceId_key" ON "Sqs"("instanceId")`,
    `CREATE TABLE IF NOT EXISTS "Kafka" ("id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "enabled" BOOLEAN NOT NULL DEFAULT false, "events" JSONB, "instanceId" TEXT NOT NULL, CONSTRAINT "Kafka_pkey" PRIMARY KEY ("id"), CONSTRAINT "Kafka_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Kafka_instanceId_key" ON "Kafka"("instanceId")`,
    `CREATE TABLE IF NOT EXISTS "Websocket" ("id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "enabled" BOOLEAN NOT NULL DEFAULT false, "events" JSONB, "instanceId" TEXT NOT NULL, CONSTRAINT "Websocket_pkey" PRIMARY KEY ("id"), CONSTRAINT "Websocket_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Websocket_instanceId_key" ON "Websocket"("instanceId")`,
    `CREATE TABLE IF NOT EXISTS "Pusher" ("id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "enabled" BOOLEAN NOT NULL DEFAULT false, "appId" VARCHAR(100), "key" VARCHAR(100), "secret" VARCHAR(100), "cluster" VARCHAR(100), "useTLS" BOOLEAN DEFAULT true, "events" JSONB, "instanceId" TEXT NOT NULL, CONSTRAINT "Pusher_pkey" PRIMARY KEY ("id"), CONSTRAINT "Pusher_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Pusher_instanceId_key" ON "Pusher"("instanceId")`,

    // Bot tables (simplified — only essential fields)
    `CREATE TABLE IF NOT EXISTS "Typebot" ("id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "enabled" BOOLEAN NOT NULL DEFAULT true, "description" VARCHAR(255), "url" VARCHAR(500) NOT NULL, "typebot" VARCHAR(100) NOT NULL, "expire" INTEGER DEFAULT 0, "keywordFinish" VARCHAR(100), "delayMessage" INTEGER, "unknownMessage" VARCHAR(500), "listeningFromMe" BOOLEAN DEFAULT false, "stopBotFromMe" BOOLEAN DEFAULT false, "keepOpen" BOOLEAN DEFAULT false, "debounceTime" INTEGER, "ignoreJids" JSONB, "splitMessages" BOOLEAN DEFAULT false, "timePerChar" INTEGER DEFAULT 0, "triggerType" "TriggerType", "triggerOperator" "TriggerOperator", "triggerValue" TEXT, "instanceId" TEXT NOT NULL, CONSTRAINT "Typebot_pkey" PRIMARY KEY ("id"), CONSTRAINT "Typebot_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS "TypebotSetting" ("id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "expire" INTEGER DEFAULT 0, "keywordFinish" VARCHAR(100), "delayMessage" INTEGER, "unknownMessage" VARCHAR(500), "listeningFromMe" BOOLEAN DEFAULT false, "stopBotFromMe" BOOLEAN DEFAULT false, "keepOpen" BOOLEAN DEFAULT false, "debounceTime" INTEGER, "ignoreJids" JSONB, "splitMessages" BOOLEAN DEFAULT false, "timePerChar" INTEGER DEFAULT 0, "createdAt" TIMESTAMP DEFAULT now(), "updatedAt" TIMESTAMP, "instanceId" TEXT NOT NULL, CONSTRAINT "TypebotSetting_pkey" PRIMARY KEY ("id"), CONSTRAINT "TypebotSetting_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "TypebotSetting_instanceId_key" ON "TypebotSetting"("instanceId")`,
    `CREATE TABLE IF NOT EXISTS "OpenaiCreds" ("id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "name" VARCHAR(255) NOT NULL, "apiKey" VARCHAR(255) NOT NULL, "createdAt" TIMESTAMP DEFAULT now(), "updatedAt" TIMESTAMP, "instanceId" TEXT NOT NULL, CONSTRAINT "OpenaiCreds_pkey" PRIMARY KEY ("id"), CONSTRAINT "OpenaiCreds_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS "OpenaiBot" ("id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "enabled" BOOLEAN NOT NULL DEFAULT true, "description" VARCHAR(255), "botType" "OpenaiBotType" NOT NULL, "assistantId" VARCHAR(255), "functionUrl" VARCHAR(500), "model" VARCHAR(100), "systemMessages" JSONB, "assistantMessages" JSONB, "userMessages" JSONB, "maxTokens" INTEGER, "expire" INTEGER DEFAULT 0, "keywordFinish" VARCHAR(100), "delayMessage" INTEGER, "unknownMessage" VARCHAR(500), "listeningFromMe" BOOLEAN DEFAULT false, "stopBotFromMe" BOOLEAN DEFAULT false, "keepOpen" BOOLEAN DEFAULT false, "debounceTime" INTEGER, "ignoreJids" JSONB, "splitMessages" BOOLEAN DEFAULT false, "timePerChar" INTEGER DEFAULT 0, "triggerType" "TriggerType", "triggerOperator" "TriggerOperator", "triggerValue" TEXT, "createdAt" TIMESTAMP DEFAULT now(), "updatedAt" TIMESTAMP, "openaiCredsId" TEXT NOT NULL, "instanceId" TEXT NOT NULL, CONSTRAINT "OpenaiBot_pkey" PRIMARY KEY ("id"), CONSTRAINT "OpenaiBot_openaiCredsId_fkey" FOREIGN KEY ("openaiCredsId") REFERENCES "OpenaiCreds"("id"), CONSTRAINT "OpenaiBot_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS "OpenaiSetting" ("id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "expire" INTEGER DEFAULT 0, "keywordFinish" VARCHAR(100), "delayMessage" INTEGER, "unknownMessage" VARCHAR(500), "listeningFromMe" BOOLEAN DEFAULT false, "stopBotFromMe" BOOLEAN DEFAULT false, "keepOpen" BOOLEAN DEFAULT false, "debounceTime" INTEGER, "speechToText" BOOLEAN DEFAULT false, "ignoreJids" JSONB, "splitMessages" BOOLEAN DEFAULT false, "timePerChar" INTEGER DEFAULT 0, "createdAt" TIMESTAMP DEFAULT now(), "updatedAt" TIMESTAMP, "openaiCredsId" TEXT NOT NULL, "instanceId" TEXT NOT NULL, CONSTRAINT "OpenaiSetting_pkey" PRIMARY KEY ("id"), CONSTRAINT "OpenaiSetting_openaiCredsId_fkey" FOREIGN KEY ("openaiCredsId") REFERENCES "OpenaiCreds"("id"), CONSTRAINT "OpenaiSetting_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "OpenaiSetting_instanceId_key" ON "OpenaiSetting"("instanceId")`,
    `CREATE TABLE IF NOT EXISTS "Dify" ("id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "enabled" BOOLEAN NOT NULL DEFAULT true, "description" VARCHAR(255), "botType" "DifyBotType" NOT NULL, "apiUrl" VARCHAR(500), "apiKey" VARCHAR(255), "expire" INTEGER DEFAULT 0, "keywordFinish" VARCHAR(100), "delayMessage" INTEGER, "unknownMessage" VARCHAR(500), "listeningFromMe" BOOLEAN DEFAULT false, "stopBotFromMe" BOOLEAN DEFAULT false, "keepOpen" BOOLEAN DEFAULT false, "debounceTime" INTEGER, "ignoreJids" JSONB, "splitMessages" BOOLEAN DEFAULT false, "timePerChar" INTEGER DEFAULT 0, "triggerType" "TriggerType", "triggerOperator" "TriggerOperator", "triggerValue" TEXT, "createdAt" TIMESTAMP DEFAULT now(), "updatedAt" TIMESTAMP, "instanceId" TEXT NOT NULL, CONSTRAINT "Dify_pkey" PRIMARY KEY ("id"), CONSTRAINT "Dify_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS "DifySetting" ("id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "expire" INTEGER DEFAULT 0, "keywordFinish" VARCHAR(100), "delayMessage" INTEGER, "unknownMessage" VARCHAR(500), "listeningFromMe" BOOLEAN DEFAULT false, "stopBotFromMe" BOOLEAN DEFAULT false, "keepOpen" BOOLEAN DEFAULT false, "debounceTime" INTEGER, "ignoreJids" JSONB, "splitMessages" BOOLEAN DEFAULT false, "timePerChar" INTEGER DEFAULT 0, "createdAt" TIMESTAMP DEFAULT now(), "updatedAt" TIMESTAMP, "instanceId" TEXT NOT NULL, CONSTRAINT "DifySetting_pkey" PRIMARY KEY ("id"), CONSTRAINT "DifySetting_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "DifySetting_instanceId_key" ON "DifySetting"("instanceId")`,
    `CREATE TABLE IF NOT EXISTS "Flowise" ("id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "enabled" BOOLEAN NOT NULL DEFAULT true, "description" VARCHAR(255), "apiUrl" VARCHAR(500), "apiKey" VARCHAR(255), "expire" INTEGER DEFAULT 0, "keywordFinish" VARCHAR(100), "delayMessage" INTEGER, "unknownMessage" VARCHAR(500), "listeningFromMe" BOOLEAN DEFAULT false, "stopBotFromMe" BOOLEAN DEFAULT false, "keepOpen" BOOLEAN DEFAULT false, "debounceTime" INTEGER, "ignoreJids" JSONB, "splitMessages" BOOLEAN DEFAULT false, "timePerChar" INTEGER DEFAULT 0, "triggerType" "TriggerType", "triggerOperator" "TriggerOperator", "triggerValue" TEXT, "createdAt" TIMESTAMP DEFAULT now(), "updatedAt" TIMESTAMP, "instanceId" TEXT NOT NULL, CONSTRAINT "Flowise_pkey" PRIMARY KEY ("id"), CONSTRAINT "Flowise_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS "FlowiseSetting" ("id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "expire" INTEGER DEFAULT 0, "keywordFinish" VARCHAR(100), "delayMessage" INTEGER, "unknownMessage" VARCHAR(500), "listeningFromMe" BOOLEAN DEFAULT false, "stopBotFromMe" BOOLEAN DEFAULT false, "keepOpen" BOOLEAN DEFAULT false, "debounceTime" INTEGER, "ignoreJids" JSONB, "splitMessages" BOOLEAN DEFAULT false, "timePerChar" INTEGER DEFAULT 0, "createdAt" TIMESTAMP DEFAULT now(), "updatedAt" TIMESTAMP, "instanceId" TEXT NOT NULL, CONSTRAINT "FlowiseSetting_pkey" PRIMARY KEY ("id"), CONSTRAINT "FlowiseSetting_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "FlowiseSetting_instanceId_key" ON "FlowiseSetting"("instanceId")`,
    `CREATE TABLE IF NOT EXISTS "EvolutionBot" ("id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "enabled" BOOLEAN NOT NULL DEFAULT true, "description" VARCHAR(255), "apiUrl" VARCHAR(500), "apiKey" VARCHAR(255), "expire" INTEGER DEFAULT 0, "keywordFinish" VARCHAR(100), "delayMessage" INTEGER, "unknownMessage" VARCHAR(500), "listeningFromMe" BOOLEAN DEFAULT false, "stopBotFromMe" BOOLEAN DEFAULT false, "keepOpen" BOOLEAN DEFAULT false, "debounceTime" INTEGER, "ignoreJids" JSONB, "splitMessages" BOOLEAN DEFAULT false, "timePerChar" INTEGER DEFAULT 0, "triggerType" "TriggerType", "triggerOperator" "TriggerOperator", "triggerValue" TEXT, "createdAt" TIMESTAMP DEFAULT now(), "updatedAt" TIMESTAMP, "instanceId" TEXT NOT NULL, CONSTRAINT "EvolutionBot_pkey" PRIMARY KEY ("id"), CONSTRAINT "EvolutionBot_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS "EvolutionBotSetting" ("id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "expire" INTEGER DEFAULT 0, "keywordFinish" VARCHAR(100), "delayMessage" INTEGER, "unknownMessage" VARCHAR(500), "listeningFromMe" BOOLEAN DEFAULT false, "stopBotFromMe" BOOLEAN DEFAULT false, "keepOpen" BOOLEAN DEFAULT false, "debounceTime" INTEGER, "ignoreJids" JSONB, "splitMessages" BOOLEAN DEFAULT false, "timePerChar" INTEGER DEFAULT 0, "createdAt" TIMESTAMP DEFAULT now(), "updatedAt" TIMESTAMP, "instanceId" TEXT NOT NULL, CONSTRAINT "EvolutionBotSetting_pkey" PRIMARY KEY ("id"), CONSTRAINT "EvolutionBotSetting_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "EvolutionBotSetting_instanceId_key" ON "EvolutionBotSetting"("instanceId")`,
    `CREATE TABLE IF NOT EXISTS "N8n" ("id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "enabled" BOOLEAN NOT NULL DEFAULT true, "description" VARCHAR(255), "apiUrl" VARCHAR(500), "apiKey" VARCHAR(255), "expire" INTEGER DEFAULT 0, "keywordFinish" VARCHAR(100), "delayMessage" INTEGER, "unknownMessage" VARCHAR(500), "listeningFromMe" BOOLEAN DEFAULT false, "stopBotFromMe" BOOLEAN DEFAULT false, "keepOpen" BOOLEAN DEFAULT false, "debounceTime" INTEGER, "ignoreJids" JSONB, "splitMessages" BOOLEAN DEFAULT false, "timePerChar" INTEGER DEFAULT 0, "triggerType" "TriggerType", "triggerOperator" "TriggerOperator", "triggerValue" TEXT, "createdAt" TIMESTAMP DEFAULT now(), "updatedAt" TIMESTAMP, "instanceId" TEXT NOT NULL, CONSTRAINT "N8n_pkey" PRIMARY KEY ("id"), CONSTRAINT "N8n_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS "N8nSetting" ("id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "expire" INTEGER DEFAULT 0, "keywordFinish" VARCHAR(100), "delayMessage" INTEGER, "unknownMessage" VARCHAR(500), "listeningFromMe" BOOLEAN DEFAULT false, "stopBotFromMe" BOOLEAN DEFAULT false, "keepOpen" BOOLEAN DEFAULT false, "debounceTime" INTEGER, "ignoreJids" JSONB, "splitMessages" BOOLEAN DEFAULT false, "timePerChar" INTEGER DEFAULT 0, "createdAt" TIMESTAMP DEFAULT now(), "updatedAt" TIMESTAMP, "instanceId" TEXT NOT NULL, CONSTRAINT "N8nSetting_pkey" PRIMARY KEY ("id"), CONSTRAINT "N8nSetting_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS "Evoai" ("id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "enabled" BOOLEAN NOT NULL DEFAULT true, "description" VARCHAR(255), "agentUrl" VARCHAR(500), "apiKey" VARCHAR(255), "expire" INTEGER DEFAULT 0, "keywordFinish" VARCHAR(100), "delayMessage" INTEGER, "unknownMessage" VARCHAR(500), "listeningFromMe" BOOLEAN DEFAULT false, "stopBotFromMe" BOOLEAN DEFAULT false, "keepOpen" BOOLEAN DEFAULT false, "debounceTime" INTEGER, "ignoreJids" JSONB, "splitMessages" BOOLEAN DEFAULT false, "timePerChar" INTEGER DEFAULT 0, "triggerType" "TriggerType", "triggerOperator" "TriggerOperator", "triggerValue" TEXT, "createdAt" TIMESTAMP DEFAULT now(), "updatedAt" TIMESTAMP, "instanceId" TEXT NOT NULL, CONSTRAINT "Evoai_pkey" PRIMARY KEY ("id"), CONSTRAINT "Evoai_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS "EvoaiSetting" ("id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "expire" INTEGER DEFAULT 0, "keywordFinish" VARCHAR(100), "delayMessage" INTEGER, "unknownMessage" VARCHAR(500), "listeningFromMe" BOOLEAN DEFAULT false, "stopBotFromMe" BOOLEAN DEFAULT false, "keepOpen" BOOLEAN DEFAULT false, "debounceTime" INTEGER, "ignoreJids" JSONB, "splitMessages" BOOLEAN DEFAULT false, "timePerChar" INTEGER DEFAULT 0, "createdAt" TIMESTAMP DEFAULT now(), "updatedAt" TIMESTAMP, "instanceId" TEXT NOT NULL, CONSTRAINT "EvoaiSetting_pkey" PRIMARY KEY ("id"), CONSTRAINT "EvoaiSetting_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "EvoaiSetting_instanceId_key" ON "EvoaiSetting"("instanceId")`,
  ];

  let success = 0;
  let errors = 0;
  for (const sql of tables) {
    try {
      await prisma.$executeRawUnsafe(sql);
      success++;
    } catch (e) {
      console.error('Error:', e.message.substring(0, 100));
      errors++;
    }
  }
  console.log(`Done: ${success} succeeded, ${errors} failed`);
}

run().catch(e => console.error('FATAL:', e.message)).finally(() => prisma.$disconnect());
