import prisma from '../../config/database';

export const settingsService = {
  async getSettings(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        address: true,
        logo: true,
        segment: true,
      },
    });

    const settings = await prisma.tenantSettings.findUnique({
      where: { tenantId },
    });

    return { tenant, settings };
  },

  async updateClinica(tenantId: string, data: {
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
    logo?: string;
    cnpj?: string;
  }) {
    const { cnpj, ...tenantData } = data;

    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: tenantData,
    });

    if (cnpj !== undefined) {
      await prisma.tenantSettings.upsert({
        where: { tenantId },
        create: { tenantId, cnpj },
        update: { cnpj },
      });
    }

    return tenant;
  },

  async updateHorarios(tenantId: string, data: {
    horarios?: any;
    duracaoConsultaPadrao?: number;
  }) {
    return prisma.tenantSettings.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });
  },

  async updateEmail(tenantId: string, data: {
    emailEnabled?: boolean;
    emailFrom?: string;
    emailWelcome?: boolean;
    emailConfirmacao?: boolean;
    emailLembrete?: boolean;
    emailCancelamento?: boolean;
  }) {
    return prisma.tenantSettings.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });
  },

  async testEmail(tenantId: string, to: string) {
    const { sendEmail } = await import('../../services/email.service');
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

    return sendEmail({
      to,
      subject: `Teste de Email - ${tenant?.name || 'Anpexia'}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <h2 style="color:#1E3A5F">Teste de Email</h2>
          <p>Este e um email de teste enviado pela plataforma <strong>${tenant?.name || 'Anpexia'}</strong>.</p>
          <p>Se voce recebeu este email, a configuracao esta funcionando corretamente!</p>
          <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
          <p style="color:#888;font-size:12px">Enviado via Anpexia</p>
          <p style="color:#aaa;font-size:11px">&copy; 2026 Anpexia &mdash; anpexia.com.br</p>
        </div>
      `,
    });
  },
};
