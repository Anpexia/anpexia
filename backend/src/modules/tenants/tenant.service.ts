import prisma from '../../config/database';
import { AppError } from '../../shared/middleware/error-handler';
import { Module, TenantSegment } from '@prisma/client';
import { evolutionApi } from '../messaging/evolution.client';
import { authService } from '../auth/auth.service';

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const DEFAULT_MODULES: Module[] = ['DASHBOARD', 'CUSTOMERS', 'INVENTORY', 'MESSAGING'];

interface CreateTenantData {
  name: string;
  segment?: TenantSegment;
  phone?: string;
  email?: string;
  address?: string;
  plan?: 'STARTER' | 'PRO' | 'BUSINESS';
  ownerName?: string;
  ownerEmail?: string;
}

export const tenantService = {
  async list(skip: number, take: number) {
    const [tenants, total] = await Promise.all([
      prisma.tenant.findMany({
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          modules: true,
          _count: { select: { users: true, customers: true } },
        },
      }),
      prisma.tenant.count(),
    ]);

    return { tenants, total };
  },

  async getById(id: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        modules: true,
        users: { select: { id: true, name: true, email: true, role: true, isActive: true } },
        _count: { select: { customers: true, products: true, messagesSent: true } },
      },
    });

    if (!tenant) {
      throw new AppError(404, 'TENANT_NOT_FOUND', 'Empresa não encontrada');
    }

    return tenant;
  },

  async create(data: CreateTenantData) {
    let slug = generateSlug(data.name);

    // Garantir slug único
    const existing = await prisma.tenant.findUnique({ where: { slug } });
    if (existing) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    const tenant = await prisma.tenant.create({
      data: {
        name: data.name,
        slug,
        segment: data.segment,
        phone: data.phone,
        email: data.email,
        address: data.address,
        plan: data.plan || 'STARTER',
        modules: {
          create: DEFAULT_MODULES.map((module) => ({
            module,
            isActive: true,
          })),
        },
      },
      include: { modules: true },
    });

    // Create WhatsApp instance + ChatbotConfig for this tenant
    const instanceName = `tenant-${slug}`;
    try {
      await evolutionApi.createInstance(instanceName);
      console.log(`[TENANT] WhatsApp instance "${instanceName}" created for tenant ${tenant.id}`);
    } catch (err: any) {
      // Non-blocking: tenant is created even if Evolution API is down
      console.error(`[TENANT] Failed to create WhatsApp instance "${instanceName}":`, err.message);
    }

    await prisma.chatbotConfig.create({
      data: {
        tenantId: tenant.id,
        instanceName,
        isActive: false,
        greetingMessage: 'Ola! Sou o assistente virtual. Como posso te ajudar?',
        fallbackMessage: 'Desculpe, nao entendi. Pode reformular a pergunta?',
        humanHandoffMessage: 'Vou te encaminhar para um atendente. Aguarde um momento!',
      },
    });

    if (data.ownerName && data.ownerEmail) {
      try {
        await authService.createInvite({
          tenantId: tenant.id,
          name: data.ownerName,
          email: data.ownerEmail,
          role: 'OWNER',
        });
        console.log(`[TENANT] Owner invite sent to ${data.ownerEmail} for tenant ${tenant.id}`);
      } catch (err: any) {
        console.error(`[TENANT] Failed to create owner invite:`, err.message);
      }
    }

    return tenant;
  },

  async update(id: string, data: Partial<CreateTenantData> & { logo?: string }) {
    const tenant = await prisma.tenant.update({
      where: { id },
      data,
    });

    return tenant;
  },

  async updateModules(id: string, modules: { module: Module; isActive: boolean }[]) {
    const operations = modules.map((m) =>
      prisma.tenantModule.upsert({
        where: { tenantId_module: { tenantId: id, module: m.module } },
        create: { tenantId: id, module: m.module, isActive: m.isActive },
        update: { isActive: m.isActive },
      }),
    );

    const result = await prisma.$transaction(operations);
    return result;
  },

  async toggleActive(id: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      throw new AppError(404, 'TENANT_NOT_FOUND', 'Empresa não encontrada');
    }

    return prisma.tenant.update({
      where: { id },
      data: { isActive: !tenant.isActive },
    });
  },

  async remove(id: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: { _count: { select: { users: true, customers: true } } },
    });
    if (!tenant) {
      throw new AppError(404, 'TENANT_NOT_FOUND', 'Empresa não encontrada');
    }

    await prisma.$transaction(async (tx) => {
      // Chat & messaging
      await tx.chatDataCollection.deleteMany({ where: { tenantId: id } });
      await tx.chatbotConfig.deleteMany({ where: { tenantId: id } });
      await tx.chatbotFaq.deleteMany({ where: { tenantId: id } });
      await tx.chatMessage.deleteMany({ where: { tenantId: id } });
      await tx.messageSent.deleteMany({ where: { tenantId: id } });
      await tx.messageTemplate.deleteMany({ where: { tenantId: id } });

      // Scheduling (cascades: ScheduledCallProcedure, PrivateProcedureCall)
      await tx.scheduledCall.deleteMany({ where: { tenantId: id } });

      // Clinical records
      await tx.patientEvolution.deleteMany({ where: { tenantId: id } });
      await tx.anamnesis.deleteMany({ where: { tenantId: id } });
      await tx.medicalCertificate.deleteMany({ where: { tenantId: id } });
      await tx.prescription.deleteMany({ where: { tenantId: id } });
      await tx.doctorSignature.deleteMany({ where: { tenantId: id } });
      // MedicalRecord (cascades: MedicalEntry)
      await tx.medicalRecord.deleteMany({ where: { tenantId: id } });

      // Financial
      await tx.financialTransaction.deleteMany({ where: { tenantId: id } });
      await tx.financialCategory.deleteMany({ where: { tenantId: id } });

      // Inventory & suppliers
      await tx.inventoryMovement.deleteMany({ where: { tenantId: id } });
      await tx.supplierProduct.deleteMany({ where: { tenantId: id } });
      await tx.purchaseOrder.deleteMany({ where: { tenantId: id } });
      await tx.supplier.deleteMany({ where: { tenantId: id } });

      // Procedures & templates (delete before Product to avoid FK)
      await tx.doctorRepasse.deleteMany({ where: { tenantId: id } });
      await tx.procedureTemplate.deleteMany({ where: { tenantId: id } });
      await tx.repasseType.deleteMany({ where: { tenantId: id } });
      await tx.privateProcedure.deleteMany({ where: { tenantId: id } });

      // Products
      await tx.product.deleteMany({ where: { tenantId: id } });
      await tx.productCategory.deleteMany({ where: { tenantId: id } });

      // Convenios (delete Autorizacao first, then PatientConvenio cascades with Customer)
      await tx.autorizacao.deleteMany({ where: { tenantId: id } });
      await tx.convenio.deleteMany({ where: { tenantId: id } });
      await tx.tussProcedure.deleteMany({ where: { tenantId: id } });

      // Customers (cascades: CustomerTagAssignment, PatientConvenio)
      await tx.customerTag.deleteMany({ where: { tenantId: id } });
      await tx.customer.deleteMany({ where: { tenantId: id } });

      // Scripts
      await tx.scriptCategory.deleteMany({ where: { tenantId: id } });
      await tx.script.deleteMany({ where: { tenantId: id } });

      // Config & admin
      await tx.tenantModule.deleteMany({ where: { tenantId: id } });
      await tx.tenantSettings.deleteMany({ where: { tenantId: id } });
      await tx.auditLog.deleteMany({ where: { tenantId: id } });

      // Users & auth
      const users = await tx.user.findMany({ where: { tenantId: id }, select: { id: true } });
      const userIds = users.map((u) => u.id);
      if (userIds.length > 0) {
        await tx.trustedDevice.deleteMany({ where: { userId: { in: userIds } } });
        await tx.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
      }
      await tx.user.deleteMany({ where: { tenantId: id } });

      // Leads & tenant
      await tx.lead.deleteMany({ where: { convertedTenantId: id } });
      await tx.tenant.delete({ where: { id } });
    }, { timeout: 30000 });

    return { id, removed: true };
  },
};
