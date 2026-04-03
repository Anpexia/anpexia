import prisma from '../../config/database';
import { extractField } from './extraction.service';
import { FIELD_CONFIGS, FIELD_ORDER, validateBirthDate } from './validation';
import { FlowResponse } from './conversation-flow';

/**
 * Persistent data collection service for WhatsApp chatbot.
 * Handles structured collection of patient data with AI extraction and button confirmation.
 *
 * Flow: ask question → patient replies → AI extracts value → validate → confirm with buttons → save
 */

interface CollectionState {
  id: string;
  tenantId: string;
  phone: string;
  mode: string;
  currentField: string;
  extractedValue: string | null;
  collectedData: Record<string, any>;
  customerId: string | null;
  fieldsToCollect: string[];
}

// Get active collection for this phone
async function getCollection(tenantId: string, phone: string): Promise<CollectionState | null> {
  const row = await prisma.chatDataCollection.findUnique({
    where: { tenantId_phone: { tenantId, phone } },
  });
  if (!row) return null;
  return {
    ...row,
    collectedData: (row.collectedData as Record<string, any>) || {},
  };
}

// Create or update collection
async function upsertCollection(tenantId: string, phone: string, data: Partial<{
  mode: string;
  currentField: string;
  extractedValue: string | null;
  collectedData: Record<string, any>;
  customerId: string | null;
  fieldsToCollect: string[];
}>) {
  const existing = await prisma.chatDataCollection.findUnique({
    where: { tenantId_phone: { tenantId, phone } },
  });

  if (existing) {
    return prisma.chatDataCollection.update({
      where: { id: existing.id },
      data: {
        ...data,
        collectedData: data.collectedData !== undefined ? data.collectedData : undefined,
      },
    });
  }

  return prisma.chatDataCollection.create({
    data: {
      tenantId,
      phone,
      mode: data.mode || 'COLLECTING',
      currentField: data.currentField || 'name',
      extractedValue: data.extractedValue ?? null,
      collectedData: data.collectedData || {},
      customerId: data.customerId ?? null,
      fieldsToCollect: data.fieldsToCollect || [],
    },
  });
}

async function deleteCollection(tenantId: string, phone: string) {
  try {
    await prisma.chatDataCollection.delete({
      where: { tenantId_phone: { tenantId, phone } },
    });
  } catch {}
}

/**
 * Check if there's an active data collection in progress.
 * Returns true if the message was handled by the collection flow.
 */
export async function isCollecting(tenantId: string, phone: string): Promise<boolean> {
  const col = await getCollection(tenantId, phone);
  return col !== null;
}

/**
 * Start collecting data for a new or existing patient.
 * Returns the first question to ask.
 */
export async function startCollection(
  tenantId: string,
  phone: string,
  requiredFields: string[],
  customerId?: string,
  existingData?: Record<string, any>,
): Promise<FlowResponse> {
  // Filter to only fields that are missing
  const fieldsToCollect = requiredFields.filter(f => {
    if (!FIELD_CONFIGS[f]) return false;
    if (existingData && existingData[f]) return false;
    return true;
  });

  if (fieldsToCollect.length === 0) {
    // Nothing to collect
    await deleteCollection(tenantId, phone);
    return {
      type: 'text',
      text: 'Seus dados estao completos! Como posso te ajudar?',
    };
  }

  const firstField = fieldsToCollect[0];
  const config = FIELD_CONFIGS[firstField];

  await upsertCollection(tenantId, phone, {
    mode: 'COLLECTING',
    currentField: firstField,
    extractedValue: null,
    collectedData: existingData || {},
    customerId: customerId || null,
    fieldsToCollect,
  });

  const buttons: Array<{ id: string; text: string }> = [];
  if (config.skipable) {
    buttons.push({ id: 'btn_skip_field', text: 'Pular' });
  }

  if (buttons.length > 0) {
    return {
      type: 'buttons',
      title: 'Cadastro',
      text: config.question,
      buttons,
    };
  }

  return {
    type: 'text',
    text: config.question,
  };
}

/**
 * Handle a message during active data collection.
 * Returns FlowResponse to send back, or null if collection is done.
 */
export async function handleCollectionMessage(
  tenantId: string,
  phone: string,
  messageText: string,
): Promise<FlowResponse | null> {
  const col = await getCollection(tenantId, phone);
  if (!col) return null;

  const text = messageText.trim();
  const textLower = text.toLowerCase();
  const normalized = textLower.replace(/^btn_/, '').replace(/\s+/g, '_');

  // ---- CONFIRMING mode: waiting for Sim/Corrigir button ----
  if (col.mode === 'CONFIRMING') {
    return handleConfirming(col, tenantId, phone, text, textLower, normalized);
  }

  // ---- COLLECTING mode: waiting for field value ----
  return handleCollecting(col, tenantId, phone, text, textLower, normalized);
}

async function handleCollecting(
  col: CollectionState,
  tenantId: string,
  phone: string,
  text: string,
  textLower: string,
  normalized: string,
): Promise<FlowResponse> {
  const fieldConfig = FIELD_CONFIGS[col.currentField];
  if (!fieldConfig) {
    await deleteCollection(tenantId, phone);
    return { type: 'text', text: 'Ocorreu um erro. Digite *oi* para recomecar.' };
  }

  // Check for skip
  if (fieldConfig.skipable && (textLower === 'pular' || normalized === 'skip_field' || normalized === 'skip' || textLower === 'btn_skip_field')) {
    return moveToNextField(col, tenantId, phone);
  }

  // Extract the value using Claude AI
  const extracted = await extractField(fieldConfig.extractionPrompt, text);

  if (!extracted) {
    return {
      type: 'text',
      text: `Nao consegui entender seu ${fieldConfig.label}. Por favor, envie apenas o dado solicitado.\n\n${fieldConfig.question}`,
    };
  }

  // Format if formatter exists
  const formatted = fieldConfig.format ? fieldConfig.format(extracted) : extracted;

  // Validate
  if (!fieldConfig.validate(extracted)) {
    return {
      type: 'text',
      text: `O ${fieldConfig.label} informado parece invalido. Por favor, verifique e envie novamente.\n\n${fieldConfig.question}`,
    };
  }

  // Move to CONFIRMING mode with buttons
  await upsertCollection(tenantId, phone, {
    mode: 'CONFIRMING',
    extractedValue: formatted,
  });

  return {
    type: 'buttons',
    title: 'Confirmar dado',
    text: fieldConfig.confirmMessage(formatted),
    buttons: [
      { id: 'btn_confirm_yes', text: 'Sim, esta correto' },
      { id: 'btn_confirm_no', text: 'Nao, corrigir' },
    ],
  };
}

async function handleConfirming(
  col: CollectionState,
  tenantId: string,
  phone: string,
  text: string,
  textLower: string,
  normalized: string,
): Promise<FlowResponse> {
  const fieldConfig = FIELD_CONFIGS[col.currentField];

  // Check for YES confirmation
  const isYes = ['sim', 's', 'yes', 'correto', 'certo', 'isso', 'btn_confirm_yes'].includes(textLower) ||
    normalized === 'confirm_yes' || normalized === 'sim,_esta_correto' || normalized === 'sim_esta_correto';

  // Check for NO / correct
  const isNo = ['nao', 'não', 'n', 'no', 'errado', 'corrigir', 'btn_confirm_no'].includes(textLower) ||
    normalized === 'confirm_no' || normalized === 'nao,_corrigir' || normalized === 'nao_corrigir';

  if (isYes && col.extractedValue) {
    // Save the confirmed value to collected data
    const updatedData = { ...col.collectedData };

    // Convert date string to ISO format for birthDate
    if (col.currentField === 'birthDate') {
      const parsed = validateBirthDate(col.extractedValue);
      if (parsed.date) {
        updatedData[col.currentField] = parsed.date.toISOString();
      }
    } else if (col.currentField === 'cpfCnpj') {
      updatedData[col.currentField] = col.extractedValue.replace(/\D/g, '');
    } else {
      updatedData[col.currentField] = col.extractedValue;
    }

    await upsertCollection(tenantId, phone, {
      collectedData: updatedData,
      extractedValue: null,
    });

    // Move to next field
    return moveToNextField(
      { ...col, collectedData: updatedData },
      tenantId,
      phone,
    );
  }

  if (isNo) {
    // Go back to COLLECTING for the same field
    await upsertCollection(tenantId, phone, {
      mode: 'COLLECTING',
      extractedValue: null,
    });

    return {
      type: 'text',
      text: `Sem problemas! Envie novamente seu *${fieldConfig.label}*:`,
    };
  }

  // Unrecognized — remind about the buttons
  return {
    type: 'buttons',
    title: 'Confirmar dado',
    text: `${fieldConfig.confirmMessage(col.extractedValue || '')}\n\nPor favor, confirme tocando em um dos botoes:`,
    buttons: [
      { id: 'btn_confirm_yes', text: 'Sim, esta correto' },
      { id: 'btn_confirm_no', text: 'Nao, corrigir' },
    ],
  };
}

async function moveToNextField(
  col: CollectionState,
  tenantId: string,
  phone: string,
): Promise<FlowResponse> {
  const currentIndex = col.fieldsToCollect.indexOf(col.currentField);
  const nextIndex = currentIndex + 1;

  if (nextIndex >= col.fieldsToCollect.length) {
    // All fields collected — save to customer
    return finishCollection(col, tenantId, phone);
  }

  const nextField = col.fieldsToCollect[nextIndex];
  const nextConfig = FIELD_CONFIGS[nextField];

  await upsertCollection(tenantId, phone, {
    mode: 'COLLECTING',
    currentField: nextField,
    extractedValue: null,
  });

  const buttons: Array<{ id: string; text: string }> = [];
  if (nextConfig.skipable) {
    buttons.push({ id: 'btn_skip_field', text: 'Pular' });
  }

  if (buttons.length > 0) {
    return {
      type: 'buttons',
      title: 'Cadastro',
      text: nextConfig.question,
      buttons,
    };
  }

  return { type: 'text', text: nextConfig.question };
}

function buildCustomerData(data: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  if (data.name) result.name = data.name;
  if (data.birthDate) result.birthDate = new Date(data.birthDate);
  if (data.cpfCnpj) result.cpfCnpj = data.cpfCnpj;
  if (data.email) result.email = data.email;
  if (data.address) result.address = { raw: data.address };
  if (data.insurance) result.insurance = data.insurance;
  return result;
}

async function finishCollection(
  col: CollectionState,
  tenantId: string,
  phone: string,
): Promise<FlowResponse> {
  const data = col.collectedData;
  const customerData = buildCustomerData(data);

  try {
    if (col.customerId) {
      // Update existing customer
      await prisma.customer.update({
        where: { id: col.customerId },
        data: customerData,
      });

      await prisma.auditLog.create({
        data: {
          tenantId,
          action: 'customer.chatbot_update',
          entity: 'Customer',
          entityId: col.customerId,
          changes: { collectedFields: Object.keys(data), source: 'whatsapp-chatbot' },
        },
      });
    } else {
      // Check if customer already exists with this phone (exact match by tenantId + phone)
      const existing = await prisma.customer.findFirst({
        where: { tenantId, phone, isActive: true },
      });

      if (existing) {
        // Update instead of duplicating
        await prisma.customer.update({
          where: { id: existing.id },
          data: customerData,
        });

        await prisma.auditLog.create({
          data: {
            tenantId,
            action: 'customer.chatbot_update',
            entity: 'Customer',
            entityId: existing.id,
            changes: { collectedFields: Object.keys(data), source: 'whatsapp-chatbot' },
          },
        });
      } else {
        // Create new customer
        const customer = await prisma.customer.create({
          data: {
            tenantId,
            name: data.name || 'Paciente',
            phone,
            email: data.email || undefined,
            cpfCnpj: data.cpfCnpj || undefined,
            birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
            address: data.address ? { raw: data.address } : undefined,
            insurance: data.insurance || undefined,
            origin: 'whatsapp-chatbot',
            optInWhatsApp: true,
          },
        });

        await prisma.auditLog.create({
          data: {
            tenantId,
            action: 'customer.chatbot_create',
            entity: 'Customer',
            entityId: customer.id,
            changes: { collectedFields: Object.keys(data), source: 'whatsapp-chatbot' },
          },
        });
      }
    }
  } catch (err: any) {
    console.error('[DATA_COLLECTION] Error saving customer:', err.message);
    // Don't delete collection state on error — allow retry
    return {
      type: 'text',
      text: 'Ops, tive um problema ao salvar seus dados. Vou tentar novamente — por favor, envie qualquer mensagem.',
    };
  }

  // Clean up collection state only on success
  await deleteCollection(tenantId, phone);

  const name = data.name || 'Paciente';
  return {
    type: 'buttons',
    title: `Pronto, ${name}!`,
    text: `Cadastro ${col.customerId ? 'atualizado' : 'concluido'} com sucesso!\n\nComo posso te ajudar?`,
    buttons: [
      { id: 'btn_book', text: 'Agendar consulta' },
      { id: 'btn_info', text: 'Conhecer a clinica' },
    ],
  };
}

/**
 * Get the required fields that are missing for a customer.
 */
export async function getMissingFields(
  tenantId: string,
  customerId: string,
  requiredFields: string[],
): Promise<string[]> {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) return requiredFields;

  return requiredFields.filter(field => {
    const value = (customer as any)[field];
    if (!value) return true;
    if (typeof value === 'string') return value.trim() === '';
    // For Json fields like address: check if it has meaningful content
    if (typeof value === 'object') {
      const raw = (value as any).raw;
      return !raw || (typeof raw === 'string' && raw.trim() === '');
    }
    return false;
  });
}

/**
 * Respond with a "complete your registration first" message when patient sends
 * an off-topic message during data collection.
 */
export function buildCollectionReminderResponse(currentField: string): FlowResponse {
  const fieldConfig = FIELD_CONFIGS[currentField];
  if (!fieldConfig) {
    return { type: 'text', text: 'Vou te ajudar com isso logo! Mas antes, preciso completar seu cadastro.' };
  }

  return {
    type: 'text',
    text: `Vou te ajudar com isso logo! Mas antes, preciso que me envie seu *${fieldConfig.label}* para completar seu cadastro.`,
  };
}
