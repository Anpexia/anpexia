import prisma from '../../config/database';
import { AppError } from '../../shared/middleware/error-handler';
import { resolvePhones } from '../../shared/utils/phone';
import { cpfHash as computeCpfHash } from '../../shared/utils/cpf';

// Telefone NÃO é mais identificador único — famílias compartilham número.
// Retorna (sem bloquear) os pacientes que já usam o telefone, para alerta no front.
export async function findSharedPhonePatients(tenantId: string, phone: string | undefined | null, excludeId?: string) {
  if (!phone) return [];
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return [];
  const suffix = digits.slice(-9);
  const where: any = {
    tenantId,
    isActive: true,
    OR: [{ cellPhone: { endsWith: suffix } }, { phone: { endsWith: suffix } }],
  };
  if (excludeId) where.id = { not: excludeId };
  return prisma.customer.findMany({ where, select: { id: true, name: true } });
}

// CPF é o identificador secundário: único por tenant (via blind index cpfHash).
export async function checkDuplicateCpf(tenantId: string, cpfHashValue: string | null, excludeId?: string) {
  if (!cpfHashValue) return;
  const where: any = { tenantId, cpfHash: cpfHashValue, isActive: true };
  if (excludeId) where.id = { not: excludeId };
  const existing = await prisma.customer.findFirst({ where, select: { id: true, name: true } });
  if (existing) {
    throw new AppError(409, 'CPF_DUPLICATE', 'Já existe um paciente cadastrado com este CPF.', {
      existingId: existing.id,
      existingName: existing.name,
    });
  }
}

interface ListParams {
  skip: number;
  take: number;
  search?: string;
  tag?: string;
}

interface CreateCustomerData {
  name: string;
  phone?: string;
  cellPhone?: string | null;
  landlinePhone?: string | null;
  email?: string;
  cpfCnpj?: string;
  documentType?: string | null;
  documentNumber?: string | null;
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
  responsavelId?: string | null;
  parentesco?: string | null;
  usarTelResponsavel?: boolean;
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
          responsavel: { select: { id: true, name: true, phone: true } },
          dependentes: { select: { id: true, name: true, birthDate: true, parentesco: true }, where: { isActive: true } },
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
      const nextAppointment = future.length > 0
        ? future.reduce((earliest, a) => (a.date < earliest.date ? a : earliest)).date
        : null;
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
        responsavel: { select: { id: true, name: true, phone: true } },
        dependentes: { select: { id: true, name: true, phone: true, birthDate: true, parentesco: true, usarTelResponsavel: true }, where: { isActive: true } },
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
    const nextAppointment = futureCalls.length > 0
      ? futureCalls.reduce((earliest, a) => (a.date < earliest.date ? a : earliest)).date
      : null;
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
    const { tagIds, birthDate, responsavelId, parentesco, usarTelResponsavel, phone, cellPhone, landlinePhone, ...rest } = data;

    // Normaliza/valida celular e fixo; phone passa a espelhar cellPhone.
    const phones = resolvePhones({ phone, cellPhone, landlinePhone });

    // CPF (quando preenchido) é único por tenant. Telefone NÃO bloqueia mais.
    const cpfHashValue = computeCpfHash(data.cpfCnpj);
    await checkDuplicateCpf(tenantId, cpfHashValue);

    const customer = await prisma.customer.create({
      data: {
        ...rest,
        tenantId,
        phone: phones.phone,
        cellPhone: phones.cellPhone,
        landlinePhone: phones.landlinePhone,
        cpfHash: cpfHashValue,
        birthDate: birthDate ? new Date(birthDate) : undefined,
        address: data.address ? JSON.parse(JSON.stringify(data.address)) : undefined,
        responsavelId: responsavelId || undefined,
        parentesco: parentesco || undefined,
        usarTelResponsavel: usarTelResponsavel ?? false,
        tags: tagIds?.length
          ? { create: tagIds.map((tagId) => ({ tagId })) }
          : undefined,
      },
      include: {
        tags: { include: { tag: true } },
        responsavel: { select: { id: true, name: true, phone: true } },
      },
    });

    return customer;
  },

  async update(tenantId: string, id: string, data: Partial<CreateCustomerData>) {
    const existing = await prisma.customer.findFirst({ where: { id, tenantId } });
    if (!existing) {
      throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Cliente não encontrado');
    }

    const { tagIds, birthDate, responsavelId, parentesco, usarTelResponsavel, phone, cellPhone, landlinePhone, ...rest } = data;

    // Recalcula os telefones com base no que veio + estado atual (campos ausentes mantêm valor).
    const phonesProvided = phone !== undefined || cellPhone !== undefined || landlinePhone !== undefined;
    const phones = resolvePhones(
      { phone, cellPhone, landlinePhone },
      { cellPhone: existing.cellPhone, landlinePhone: existing.landlinePhone },
    );

    // Telefone NÃO bloqueia mais (famílias compartilham). CPF continua único.
    if (data.cpfCnpj !== undefined) {
      const newCpfHash = computeCpfHash(data.cpfCnpj);
      if (newCpfHash && newCpfHash !== existing.cpfHash) {
        await checkDuplicateCpf(tenantId, newCpfHash, id);
      }
    }

    const updateData: any = {
      ...rest,
      birthDate: birthDate ? new Date(birthDate) : undefined,
      address: data.address ? JSON.parse(JSON.stringify(data.address)) : undefined,
    };

    if (data.cpfCnpj !== undefined) {
      updateData.cpfHash = computeCpfHash(data.cpfCnpj);
    }

    if (phonesProvided) {
      updateData.phone = phones.phone;
      updateData.cellPhone = phones.cellPhone;
      updateData.landlinePhone = phones.landlinePhone;
    }

    if (responsavelId !== undefined) updateData.responsavelId = responsavelId || null;
    if (parentesco !== undefined) updateData.parentesco = parentesco || null;
    if (usarTelResponsavel !== undefined) updateData.usarTelResponsavel = usarTelResponsavel;

    const customer = await prisma.customer.update({
      where: { id },
      data: updateData,
      include: {
        tags: { include: { tag: true } },
        responsavel: { select: { id: true, name: true, phone: true } },
        dependentes: { select: { id: true, name: true, birthDate: true, parentesco: true }, where: { isActive: true } },
      },
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

  async removeTag(tenantId: string, customerId: string, tagId: string) {
    const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId } });
    if (!customer) throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Cliente não encontrado');
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

  async getContactPhone(customerId: string): Promise<{ phone: string | null; responsavelName: string | null }> {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { phone: true, usarTelResponsavel: true, responsavel: { select: { name: true, phone: true } } },
    });
    if (!customer) return { phone: null, responsavelName: null };
    if (customer.usarTelResponsavel && customer.responsavel?.phone) {
      return { phone: customer.responsavel.phone, responsavelName: customer.responsavel.name };
    }
    return { phone: customer.phone, responsavelName: null };
  },

  async promoteToTitular(tenantId: string, customerId: string, phone?: string) {
    const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId } });
    if (!customer) throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Cliente não encontrado');

    const updateData: any = { responsavelId: null, parentesco: null, usarTelResponsavel: false };
    if (phone) {
      // Promovido a titular precisa do próprio telefone — roteia p/ celular/fixo.
      const phones = resolvePhones({ phone });
      updateData.phone = phones.phone;
      updateData.cellPhone = phones.cellPhone;
      updateData.landlinePhone = phones.landlinePhone;
    }

    return prisma.customer.update({
      where: { id: customerId },
      data: updateData,
      select: { id: true, name: true, phone: true, cellPhone: true, landlinePhone: true, responsavelId: true },
    });
  },

  // Fila de revisão de telefones (relatório administrativo).
  async listPhoneReview(tenantId: string) {
    return prisma.phoneReviewItem.findMany({
      where: { tenantId, resolved: false },
      orderBy: { createdAt: 'desc' },
      select: { id: true, customerId: true, customerName: true, originalPhone: true, reason: true, createdAt: true },
    });
  },

  async resolvePhoneReview(tenantId: string, reviewId: string) {
    const item = await prisma.phoneReviewItem.findFirst({ where: { id: reviewId, tenantId } });
    if (!item) throw new AppError(404, 'REVIEW_NOT_FOUND', 'Item de revisão não encontrado');
    return prisma.phoneReviewItem.update({ where: { id: reviewId }, data: { resolved: true } });
  },
};
