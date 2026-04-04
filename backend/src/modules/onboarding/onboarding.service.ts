import prisma from '../../config/database';
import bcrypt from 'bcryptjs';
import { AppError } from '../../shared/middleware/error-handler';
import { automationService } from '../sales/automation.service';

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

interface OwnerData {
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
}

export const onboardingService = {
  async convertLeadToClient(leadId: string, ownerData: OwnerData) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new AppError(404, 'LEAD_NOT_FOUND', 'Lead nao encontrado');
    if (lead.stage !== 'CONTRACTED') throw new AppError(400, 'INVALID_STAGE', 'Lead precisa estar no estagio CONTRACTED');

    const tenantName = lead.company || lead.name;
    let slug = generateSlug(tenantName);
    const existing = await prisma.tenant.findUnique({ where: { slug } });
    if (existing) slug = `${slug}-${Date.now().toString(36)}`;

    const tenant = await prisma.tenant.create({
      data: {
        name: tenantName,
        slug,
        segment: (lead.segment as any) || 'OUTROS',
        plan: lead.plan || 'STARTER',
        phone: lead.phone,
        email: lead.email,
        modules: {
          create: (['DASHBOARD', 'CUSTOMERS', 'INVENTORY', 'MESSAGING'] as const).map((module) => ({
            module,
            isActive: true,
          })),
        },
      },
    });

    const passwordHash = await bcrypt.hash(ownerData.ownerPassword, 12);

    const user = await prisma.user.create({
      data: {
        name: ownerData.ownerName,
        email: ownerData.ownerEmail,
        passwordHash,
        role: 'OWNER',
        tenantId: tenant.id,
      },
      select: { id: true, name: true, email: true, role: true },
    });

    const updatedLead = await prisma.lead.update({
      where: { id: leadId },
      data: {
        convertedTenantId: tenant.id,
        stage: 'ONBOARDING',
      },
    });

    await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        type: 'conversion',
        description: `Convertido para tenant "${tenant.name}" (ID: ${tenant.id})`,
      },
    });

    await automationService.processTrigger('on_onboarding', leadId);

    return { tenant, user, lead: updatedLead };
  },

  async getOnboardingStatus(leadId: string) {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: { convertedTenant: true },
    });
    if (!lead) throw new AppError(404, 'LEAD_NOT_FOUND', 'Lead nao encontrado');
    return lead;
  },
};
