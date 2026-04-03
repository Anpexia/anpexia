import prisma from '../../config/database';
import { AppError } from '../../shared/middleware/error-handler';

interface ListParams {
  skip: number;
  take: number;
  search?: string;
  tag?: string;
}

interface CreateCustomerData {
  name: string;
  phone?: string;
  email?: string;
  cpfCnpj?: string;
  birthDate?: string;
  address?: {
    cep?: string;
    street?: string;
    number?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
  };
  insurance?: string;
  notes?: string;
  origin?: string;
  optInWhatsApp?: boolean;
  tagIds?: string[];
}

interface MedicalRecordData {
  bloodType?: string;
  allergies?: string;
  medications?: string;
  chronicDiseases?: string;
  clinicalNotes?: string;
}

interface MedicalEntryData {
  authorName: string;
  authorId?: string;
  type?: string;
  content: string;
}

export const customerService = {
  async list(tenantId: string, params: ListParams) {
    const where: any = { tenantId, isActive: true };

    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { phone: { contains: params.search } },
        { email: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    if (params.tag) {
      where.tags = { some: { tag: { name: params.tag } } };
    }

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: 'desc' },
        include: {
          tags: { include: { tag: true } },
          scheduledCalls: {
            select: { id: true, date: true, status: true },
            orderBy: { date: 'desc' },
            take: 50,
          },
        },
      }),
      prisma.customer.count({ where }),
    ]);

    // Compute appointment summary for each customer
    const enriched = customers.map((c) => {
      const calls = c.scheduledCalls || [];
      const now = new Date();
      const completed = calls.filter((a) => a.status === 'completed');
      const past = calls.filter((a) => a.date < now && a.status !== 'cancelled');
      const future = calls.filter(
        (a) => a.date >= now && (a.status === 'scheduled' || a.status === 'confirmed'),
      );
      const lastAppointment = past.length > 0 ? past[0].date : null;
      const nextAppointment = future.length > 0 ? future[future.length - 1].date : null;
      const totalAppointments = completed.length;

      const { scheduledCalls: _, ...rest } = c;
      return { ...rest, lastAppointment, nextAppointment, totalAppointments };
    });

    return { customers: enriched, total };
  },

  async getById(tenantId: string, id: string) {
    const customer = await prisma.customer.findFirst({
      where: { id, tenantId },
      include: {
        tags: { include: { tag: true } },
        messagesSent: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        scheduledCalls: {
          orderBy: { date: 'desc' },
          take: 100,
        },
        medicalRecord: {
          include: {
            entries: {
              orderBy: { createdAt: 'desc' },
              take: 100,
            },
          },
        },
      },
    });

    if (!customer) {
      throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Cliente não encontrado');
    }

    // Fetch chat messages if customer has phone
    let chatMessages: any[] = [];
    if (customer.phone) {
      const cleanPhone = customer.phone.replace(/\D/g, '');
      chatMessages = await prisma.chatMessage.findMany({
        where: { tenantId, phone: { contains: cleanPhone.slice(-8) } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    }

    // Compute summary
    const calls = customer.scheduledCalls || [];
    const now = new Date();
    const completedCalls = calls.filter((a) => a.status === 'completed');
    const pastCalls = calls.filter((a) => a.date < now && a.status !== 'cancelled');
    const futureCalls = calls.filter(
      (a) => a.date >= now && (a.status === 'scheduled' || a.status === 'confirmed'),
    );
    const lastAppointment = pastCalls.length > 0 ? pastCalls[0].date : null;
    const nextAppointment = futureCalls.length > 0 ? futureCalls[futureCalls.length - 1].date : null;
    const totalAppointments = completedCalls.length;

    // Days since last contact (message or chat)
    const lastMessageDate = customer.messagesSent[0]?.sentAt || customer.messagesSent[0]?.createdAt || null;
    const lastChatDate = chatMessages[0]?.createdAt || null;
    const lastContactDate = [lastMessageDate, lastChatDate].filter(Boolean).sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0] || null;
    const daysSinceLastContact = lastContactDate ? Math.floor((now.getTime() - new Date(lastContactDate).getTime()) / (1000 * 60 * 60 * 24)) : null;

    // WhatsApp status from last chat message metadata
    const lastOutgoing = chatMessages.find((m) => m.direction === 'OUTGOING');
    const whatsappStatus = lastOutgoing?.metadata?.flowState || (chatMessages.length > 0 ? 'active' : 'none');

    return {
      ...customer,
      chatMessages,
      lastAppointment,
      nextAppointment,
      totalAppointments,
      daysSinceLastContact,
      whatsappStatus,
    };
  },

  async create(tenantId: string, data: CreateCustomerData) {
    const { tagIds, birthDate, ...rest } = data;

    const customer = await prisma.customer.create({
      data: {
        ...rest,
        tenantId,
        birthDate: birthDate ? new Date(birthDate) : undefined,
        address: data.address ? JSON.parse(JSON.stringify(data.address)) : undefined,
        tags: tagIds?.length
          ? { create: tagIds.map((tagId) => ({ tagId })) }
          : undefined,
      },
      include: { tags: { include: { tag: true } } },
    });

    return customer;
  },

  async update(tenantId: string, id: string, data: Partial<CreateCustomerData>) {
    const existing = await prisma.customer.findFirst({ where: { id, tenantId } });
    if (!existing) {
      throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Cliente não encontrado');
    }

    const { tagIds, birthDate, ...rest } = data;

    const customer = await prisma.customer.update({
      where: { id },
      data: {
        ...rest,
        birthDate: birthDate ? new Date(birthDate) : undefined,
        address: data.address ? JSON.parse(JSON.stringify(data.address)) : undefined,
      },
      include: { tags: { include: { tag: true } } },
    });

    return customer;
  },

  async delete(tenantId: string, id: string) {
    const existing = await prisma.customer.findFirst({ where: { id, tenantId } });
    if (!existing) {
      throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Cliente não encontrado');
    }

    // Soft delete
    await prisma.customer.update({
      where: { id },
      data: { isActive: false },
    });
  },

  async addTag(tenantId: string, customerId: string, tagId: string) {
    const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId } });
    if (!customer) {
      throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Cliente não encontrado');
    }

    return prisma.customerTagAssignment.create({
      data: { customerId, tagId },
      include: { tag: true },
    });
  },

  async removeTag(customerId: string, tagId: string) {
    await prisma.customerTagAssignment.deleteMany({
      where: { customerId, tagId },
    });
  },

  // Medical Record methods
  async getMedicalRecord(tenantId: string, customerId: string) {
    const record = await prisma.medicalRecord.findUnique({
      where: { tenantId_customerId: { tenantId, customerId } },
      include: {
        entries: { orderBy: { createdAt: 'desc' }, take: 100 },
      },
    });
    return record;
  },

  async upsertMedicalRecord(tenantId: string, customerId: string, data: MedicalRecordData) {
    const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId } });
    if (!customer) throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Cliente não encontrado');

    const record = await prisma.medicalRecord.upsert({
      where: { tenantId_customerId: { tenantId, customerId } },
      create: { tenantId, customerId, ...data },
      update: data,
      include: {
        entries: { orderBy: { createdAt: 'desc' }, take: 100 },
      },
    });
    return record;
  },

  async addMedicalEntry(tenantId: string, customerId: string, data: MedicalEntryData) {
    // Ensure medical record exists
    let record = await prisma.medicalRecord.findUnique({
      where: { tenantId_customerId: { tenantId, customerId } },
    });
    if (!record) {
      record = await prisma.medicalRecord.create({
        data: { tenantId, customerId },
      });
    }

    const entry = await prisma.medicalEntry.create({
      data: {
        medicalRecordId: record.id,
        authorName: data.authorName,
        authorId: data.authorId,
        type: data.type || 'note',
        content: data.content,
      },
    });
    return entry;
  },

  async deleteMedicalEntry(tenantId: string, entryId: string) {
    const entry = await prisma.medicalEntry.findFirst({
      where: { id: entryId },
      include: { medicalRecord: true },
    });
    if (!entry || entry.medicalRecord.tenantId !== tenantId) {
      throw new AppError(404, 'ENTRY_NOT_FOUND', 'Anotação não encontrada');
    }
    await prisma.medicalEntry.delete({ where: { id: entryId } });
  },
};
