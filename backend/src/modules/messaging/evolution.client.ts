import axios from 'axios';
import { env } from '../../config/env';
import { onlyDigits, classifyPhone } from '../../shared/utils/phone';

const api = axios.create({
  baseURL: env.evolutionApiUrl,
  headers: {
    'Content-Type': 'application/json',
    apikey: env.evolutionApiKey,
  },
  timeout: 15000,
});

// Cache tenantId → instanceName to avoid repeated DB lookups
const instanceCache = new Map<string, { name: string; expiry: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const evolutionApi = {
  /**
   * Resolve tenantId to Evolution API instanceName via ChatbotConfig.
   * Caches results for 5 minutes. Returns null if not configured.
   */
  async getInstanceName(tenantId: string): Promise<string | null> {
    const cached = instanceCache.get(tenantId);
    if (cached && cached.expiry > Date.now()) return cached.name;

    // Lazy import to avoid circular dependency
    const { default: prisma } = await import('../../config/database');
    const config = await prisma.chatbotConfig.findFirst({
      where: { tenantId },
      select: { instanceName: true },
    });

    if (!config?.instanceName) return null;

    instanceCache.set(tenantId, { name: config.instanceName, expiry: Date.now() + CACHE_TTL });
    return config.instanceName;
  },

  /** Clear cache entry (call after updating instanceName) */
  clearCache(tenantId?: string) {
    if (tenantId) instanceCache.delete(tenantId);
    else instanceCache.clear();
  },

  getWebhookUrl(): string {
    return env.nodeEnv === 'production'
      ? 'https://api.anpexia.com.br/api/v1/chatbot/webhook'
      : `http://localhost:${env.port}/api/v1/chatbot/webhook`;
  },

  async deleteInstance(instanceName: string) {
    try {
      await api.delete(`/instance/delete/${instanceName}`);
    } catch {
      // 404 is expected if instance doesn't exist
    }
  },

  async createInstance(instanceName: string) {
    const { data } = await api.post('/instance/create', {
      instanceName,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
    });
    return data;
  },

  async setWebhook(instanceName: string) {
    const { data } = await api.post(`/webhook/set/${instanceName}`, {
      webhook: {
        enabled: true,
        url: this.getWebhookUrl(),
        webhookByEvents: false,
        webhookBase64: false,
        events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
      },
    });
    return data;
  },

  async resetInstance(instanceName: string) {
    await this.deleteInstance(instanceName);
    await new Promise(r => setTimeout(r, 1000));

    let result: any;
    try {
      result = await this.createInstance(instanceName);
    } catch (err: any) {
      if (err.response?.status === 403) {
        console.log(`[EVOLUTION] Instance "${instanceName}" still cached, retrying delete+create...`);
        await this.deleteInstance(instanceName);
        await new Promise(r => setTimeout(r, 3000));
        result = await this.createInstance(instanceName);
      } else throw err;
    }

    console.log(`[EVOLUTION] createInstance response:`, JSON.stringify(result).slice(0, 500));

    await this.setWebhook(instanceName);

    const qrBase64 = result?.qrcode?.base64 || null;
    return { qrcode: { base64: qrBase64 } };
  },

  async getConnectionState(instanceName: string) {
    const { data } = await api.get(`/instance/connectionState/${instanceName}`);
    return data;
  },

  async getConnectQr(instanceName: string) {
    const { data } = await api.get(`/instance/connect/${instanceName}`);
    return data;
  },

  // ============================================================
  // Helper: format phone number (PONTO ÚNICO de validação de envio)
  // ============================================================
  // Só permite CELULAR. Nunca injeta um "9" em telefone fixo. Retorna null para
  // fixo/inválido (WhatsApp não funciona neles) — os métodos de envio pulam o
  // envio nesse caso. A decisão amigável (mensagem ao usuário) usa
  // getWhatsappPhone() antes de chegar aqui.
  formatPhone(phone: string): string | null {
    const d = onlyDigits(phone.includes('@') ? phone.split('@')[0] : phone);
    // Número nacional (sem DDI 55).
    let nat = d.startsWith('55') && (d.length === 12 || d.length === 13) ? d.slice(2) : d;
    // Legado: celular antigo de 10 dígitos (sem o 9) — 3º dígito 6-9 → insere o 9.
    if (nat.length === 10 && nat[2] >= '6' && nat[2] <= '9') {
      nat = nat.slice(0, 2) + '9' + nat.slice(2);
    }
    const c = classifyPhone(nat);
    if (c.type === 'mobile') return '55' + c.national;
    return null;
  },

  // ============================================================
  // Send plain text message
  // ============================================================
  async sendText(instanceName: string, phone: string, text: string) {
    const number = this.formatPhone(phone);
    if (!number) {
      console.warn(`[EVOLUTION] Envio ignorado: numero nao e celular valido para WhatsApp (${phone})`);
      return { skipped: true, reason: 'NON_MOBILE' };
    }
    const { data } = await api.post(`/message/sendText/${instanceName}`, {
      number,
      text,
    });
    return data;
  },

  // ============================================================
  // Send button message (max 3 buttons)
  // ============================================================
  async sendButtons(
    instanceName: string,
    phone: string,
    body: string,
    buttons: Array<{ id: string; text: string }>,
    title?: string,
    footer?: string,
  ) {
    const number = this.formatPhone(phone);
    if (!number) {
      console.warn(`[EVOLUTION] Envio (buttons) ignorado: numero nao e celular valido (${phone})`);
      return { skipped: true, reason: 'NON_MOBILE' };
    }
    const { data } = await api.post(`/message/sendButtons/${instanceName}`, {
      number,
      buttonMessage: {
        title: title || '',
        description: body,
        footerText: footer || '',
        buttons: buttons.map((b, i) => ({
          buttonId: b.id,
          buttonText: { displayText: b.text },
          type: 1,
        })),
      },
    });
    return data;
  },

  // ============================================================
  // Send list message (up to 10 rows per section)
  // ============================================================
  async sendList(
    instanceName: string,
    phone: string,
    body: string,
    buttonText: string,
    sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>,
    title?: string,
    footer?: string,
  ) {
    const number = this.formatPhone(phone);
    if (!number) {
      console.warn(`[EVOLUTION] Envio (list) ignorado: numero nao e celular valido (${phone})`);
      return { skipped: true, reason: 'NON_MOBILE' };
    }
    const { data } = await api.post(`/message/sendList/${instanceName}`, {
      number,
      listMessage: {
        title: title || '',
        description: body,
        footerText: footer || '',
        buttonText,
        sections: sections.map(s => ({
          title: s.title,
          rows: s.rows.map(r => ({
            rowId: r.id,
            title: r.title,
            description: r.description || '',
          })),
        })),
      },
    });
    return data;
  },

  // ============================================================
  // Tenant-resolved convenience methods
  // ============================================================
  async sendTextByTenant(tenantId: string, phone: string, text: string) {
    const instanceName = await this.getInstanceName(tenantId);
    if (!instanceName) {
      console.log(`[EVOLUTION] Tenant ${tenantId} has no WhatsApp instance configured, skipping`);
      return null;
    }
    return this.sendText(instanceName, phone, text);
  },

  async sendButtonsByTenant(
    tenantId: string,
    phone: string,
    body: string,
    buttons: Array<{ id: string; text: string }>,
    title?: string,
    footer?: string,
  ) {
    const instanceName = await this.getInstanceName(tenantId);
    if (!instanceName) return null;
    return this.sendButtons(instanceName, phone, body, buttons, title, footer);
  },

  async sendListByTenant(
    tenantId: string,
    phone: string,
    body: string,
    buttonText: string,
    sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>,
    title?: string,
    footer?: string,
  ) {
    const instanceName = await this.getInstanceName(tenantId);
    if (!instanceName) return null;
    return this.sendList(instanceName, phone, body, buttonText, sections, title, footer);
  },

  // ============================================================
  // Disconnect instance
  // ============================================================
  async disconnect(instanceName: string) {
    const { data } = await api.delete(`/instance/logout/${instanceName}`);
    return data;
  },
};
