import axios from 'axios';
import { env } from '../../config/env';

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
    await new Promise(r => setTimeout(r, 2000));

    try {
      await this.createInstance(instanceName);
    } catch (err: any) {
      if (err.response?.status === 403) {
        console.log(`[EVOLUTION] Instance "${instanceName}" still cached, retrying delete+create...`);
        await this.deleteInstance(instanceName);
        await new Promise(r => setTimeout(r, 3000));
        await this.createInstance(instanceName);
      } else throw err;
    }

    await this.setWebhook(instanceName);

    for (let i = 0; i < 8; i++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const qr = await this.getQrCode(instanceName);
        if (qr?.base64) return { qrcode: { base64: qr.base64 } };
      } catch {}
    }
    return { qrcode: { base64: null } };
  },

  async getQrCode(instanceName: string) {
    const { data } = await api.get(`/instance/connect/${instanceName}`);
    return data;
  },

  async getConnectionState(instanceName: string) {
    const { data } = await api.get(`/instance/connectionState/${instanceName}`);
    return data;
  },

  // ============================================================
  // Helper: format phone number
  // ============================================================
  formatPhone(phone: string): string {
    if (phone.includes('@')) {
      const num = phone.split('@')[0].replace(/\D/g, '');
      return this.ensureBrazilian9thDigit(num);
    }
    const cleaned = phone.replace(/\D/g, '');
    const withCountry = cleaned.startsWith('55') ? cleaned : `55${cleaned}`;
    return this.ensureBrazilian9thDigit(withCountry);
  },

  ensureBrazilian9thDigit(phone: string): string {
    if (!phone.startsWith('55')) return phone;
    // Brazilian mobile: 55 + 2-digit DDD + 9 + 8 digits = 13 digits
    // If 12 digits (missing the 9), insert it after DDD
    if (phone.length === 12) {
      return phone.slice(0, 4) + '9' + phone.slice(4);
    }
    return phone;
  },

  // ============================================================
  // Send plain text message
  // ============================================================
  async sendText(instanceName: string, phone: string, text: string) {
    const { data } = await api.post(`/message/sendText/${instanceName}`, {
      number: this.formatPhone(phone),
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
    const { data } = await api.post(`/message/sendButtons/${instanceName}`, {
      number: this.formatPhone(phone),
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
    const { data } = await api.post(`/message/sendList/${instanceName}`, {
      number: this.formatPhone(phone),
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
