import prisma from '../../config/database';
import { env } from '../../config/env';
import { evolutionApi } from '../messaging/evolution.client';

// Sales pipeline uses the global 'anpexia' instance (leads have no tenant yet)
const SALES_INSTANCE = 'anpexia';

export const automationService = {
  async sendWhatsApp(phone: string, message: string): Promise<boolean> {
    if (!env.evolutionApiUrl || !env.evolutionApiKey) {
      console.log(`[AUTO-MSG] WhatsApp not configured. Would send to ${phone}: ${message}`);
      return false;
    }
    try {
      await evolutionApi.sendText(SALES_INSTANCE, phone, message);
      return true;
    } catch (err) {
      console.error('[AUTO-MSG] Failed to send WhatsApp:', err);
      return false;
    }
  },

  async processTrigger(trigger: string, leadId: string): Promise<void> {
    const templates = await prisma.salesMessageTemplate.findMany({
      where: { trigger, isActive: true },
    });

    if (templates.length === 0) return;

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return;

    for (const template of templates) {
      const body = template.body
        .replace(/\{nome\}/g, lead.name)
        .replace(/\{empresa\}/g, lead.company || '')
        .replace(/\{segmento\}/g, lead.segment || '');

      if (template.delayMinutes > 0) {
        await prisma.leadMessage.create({
          data: {
            leadId: lead.id,
            direction: 'outgoing',
            channel: 'whatsapp',
            body,
            templateKey: template.key,
            status: 'scheduled',
          },
        });
      } else {
        const sent = await automationService.sendWhatsApp(lead.phone, body);
        await prisma.leadMessage.create({
          data: {
            leadId: lead.id,
            direction: 'outgoing',
            channel: 'whatsapp',
            body,
            templateKey: template.key,
            status: sent ? 'sent' : 'failed',
            sentAt: sent ? new Date() : null,
          },
        });
      }
    }
  },

  async seedTemplates(): Promise<void> {
    const defaults = [
      {
        key: 'welcome_lead',
        name: 'Boas-vindas ao lead',
        body: 'Oi {nome}! Obrigado pelo interesse na Anpexia. Somos especialistas em automacao empresarial e vamos ajudar voce a economizar tempo e reduzir custos. Posso te contar mais sobre como funciona?',
        trigger: 'on_new_lead',
        delayMinutes: 2,
      },
      {
        key: 'nurture_benefits',
        name: 'Nutricao — Beneficios',
        body: 'Oi {nome}! Sabia que nossos clientes economizam em media 20 horas por semana com a Anpexia? Automatizamos atendimento, estoque, mensagens e muito mais. Quer agendar uma conversa de 15 minutos para eu te mostrar?',
        trigger: 'on_no_response_48h',
        delayMinutes: 0,
      },
      {
        key: 'nurture_cases',
        name: 'Nutricao — Casos de uso',
        body: '{nome}, a Anpexia funciona para qualquer segmento: clinicas, restaurantes, lojas, prestadores de servico... Temos chatbot com IA que atende seus clientes 24h e controle de estoque automatico. Posso agendar uma demonstracao?',
        trigger: 'on_no_response_96h',
        delayMinutes: 0,
      },
      {
        key: 'call_scheduled',
        name: 'Call agendada — Confirmacao',
        body: 'Perfeito {nome}! Nossa conversa esta confirmada. Vou te enviar um lembrete no dia. Ate la!',
        trigger: 'on_call_scheduled',
        delayMinutes: 0,
      },
      {
        key: 'call_reminder',
        name: 'Lembrete de call',
        body: 'Oi {nome}! Lembrete: nossa conversa e hoje. Estou animado para te mostrar como a Anpexia pode ajudar o seu negocio. Ate ja!',
        trigger: 'on_call_reminder',
        delayMinutes: 0,
      },
      {
        key: 'follow_up_no_response',
        name: 'Follow-up sem resposta',
        body: 'Oi {nome}, tudo bem? Vi que nao conseguimos falar ainda. Sei que a rotina e corrida! Posso te ligar em um horario melhor? Me diz quando fica bom para voce.',
        trigger: 'on_no_response_48h',
        delayMinutes: 0,
      },
      {
        key: 'congratulations_contracted',
        name: 'Parabens pela contratacao',
        body: 'Seja bem-vindo(a) a Anpexia, {nome}! Estamos muito felizes em ter a {empresa} como cliente. Nos proximos dias vou configurar tudo e te enviar o acesso ao painel. Qualquer duvida, estou aqui!',
        trigger: 'on_contracted',
        delayMinutes: 0,
      },
      {
        key: 'onboarding_access',
        name: 'Onboarding — Acesso ao painel',
        body: '{nome}, seu painel Anpexia esta pronto! Enviei o acesso por email. Vamos agendar uma call de onboarding para eu te mostrar tudo? Me diz um horario bom.',
        trigger: 'on_onboarding',
        delayMinutes: 0,
      },
    ];

    for (const tpl of defaults) {
      await prisma.salesMessageTemplate.upsert({
        where: { key: tpl.key },
        create: tpl,
        update: { name: tpl.name, body: tpl.body, trigger: tpl.trigger, delayMinutes: tpl.delayMinutes },
      });
    }
  },

  async listTemplates() {
    return prisma.salesMessageTemplate.findMany({ orderBy: { createdAt: 'asc' } });
  },

  async updateTemplate(id: string, data: { name?: string; body?: string; isActive?: boolean; delayMinutes?: number }) {
    return prisma.salesMessageTemplate.update({ where: { id }, data });
  },
};
