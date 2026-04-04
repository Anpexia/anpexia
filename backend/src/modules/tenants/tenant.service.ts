import prisma from '../../config/database';
import { AppError } from '../../shared/middleware/error-handler';
import { Module, TenantSegment } from '@prisma/client';
import { evolutionApi } from '../messaging/evolution.client';

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
  plan?: 'ESSENTIAL' | 'PROFESSIONAL' | 'ENTERPRISE';
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
        plan: data.plan || 'ESSENTIAL',
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
};
