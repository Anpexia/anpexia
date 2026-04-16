import prisma from '../../config/database';
import { AppError } from '../../shared/middleware/error-handler';
import { Prisma } from '@prisma/client';

interface ListTransactionsParams {
  skip: number;
  take: number;
  type?: string;
  subtype?: string;
  category?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

interface CreateTransactionData {
  type: 'INCOME' | 'EXPENSE';
  category: string;
  description: string;
  amount: number;
  date: string;
  paymentMethod: string;
  customerId?: string;
  status?: string;
  notes?: string;
}

type CategorySubtype = 'FIXA' | 'VARIAVEL' | 'ADMINISTRATIVA' | null | undefined;

interface CreateCategoryData {
  name: string;
  type: 'INCOME' | 'EXPENSE';
  subtype?: CategorySubtype;
}

export const financialService = {
  async listTransactions(tenantId: string, params: ListTransactionsParams) {
    const where: any = { tenantId };

    if (params.type) {
      where.type = params.type;
    }

    if (params.category) {
      where.category = params.category;
    }

    if (params.status) {
      where.status = params.status;
    }

    if (params.startDate || params.endDate) {
      where.date = {};
      if (params.startDate) {
        where.date.gte = new Date(params.startDate);
      }
      if (params.endDate) {
        where.date.lte = new Date(params.endDate);
      }
    }

    // When subtype is provided, restrict the transaction list to those whose
    // category name matches a FinancialCategory with that subtype for the tenant.
    if (params.subtype) {
      const matchedCategories = await prisma.financialCategory.findMany({
        where: {
          tenantId,
          subtype: params.subtype,
          ...(params.type ? { type: params.type as any } : {}),
        },
        select: { name: true },
      });
      const names = matchedCategories.map((c) => c.name);
      where.category = names.length > 0 ? { in: names } : '__NO_MATCH__';
    }

    const [transactions, total] = await Promise.all([
      prisma.financialTransaction.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { date: 'desc' },
        include: {
          customer: { select: { id: true, name: true } },
        },
      }),
      prisma.financialTransaction.count({ where }),
    ]);

    return { transactions, total };
  },

  async createTransaction(tenantId: string, data: CreateTransactionData) {
    const transaction = await prisma.financialTransaction.create({
      data: {
        tenantId,
        type: data.type,
        category: data.category,
        description: data.description,
        amount: new Prisma.Decimal(data.amount),
        date: new Date(data.date),
        paymentMethod: data.paymentMethod as any,
        customerId: data.customerId || undefined,
        status: (data.status as any) || 'PENDENTE',
        notes: data.notes,
      },
      include: {
        customer: { select: { id: true, name: true } },
      },
    });

    return transaction;
  },

  async updateTransaction(tenantId: string, id: string, data: Partial<CreateTransactionData>) {
    const existing = await prisma.financialTransaction.findFirst({ where: { id, tenantId } });
    if (!existing) {
      throw new AppError(404, 'TRANSACTION_NOT_FOUND', 'Transacao nao encontrada');
    }

    const updateData: any = { ...data };

    if (data.amount !== undefined) {
      updateData.amount = new Prisma.Decimal(data.amount);
    }

    if (data.date) {
      updateData.date = new Date(data.date);
    }

    const transaction = await prisma.financialTransaction.update({
      where: { id },
      data: updateData,
      include: {
        customer: { select: { id: true, name: true } },
      },
    });

    return transaction;
  },

  async deleteTransaction(tenantId: string, id: string) {
    const existing = await prisma.financialTransaction.findFirst({ where: { id, tenantId } });
    if (!existing) {
      throw new AppError(404, 'TRANSACTION_NOT_FOUND', 'Transacao nao encontrada');
    }

    await prisma.financialTransaction.delete({ where: { id } });
  },

  async getSummary(tenantId: string, month?: number, year?: number) {
    const now = new Date();
    const targetYear = year || now.getFullYear();
    const targetMonth = month || now.getMonth() + 1;

    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);

    const where: any = {
      tenantId,
      date: { gte: startDate, lte: endDate },
      status: { not: 'CANCELADO' },
    };

    const transactions = await prisma.financialTransaction.findMany({ where });

    let totalIncome = new Prisma.Decimal(0);
    let totalExpenses = new Prisma.Decimal(0);
    const byCategory: Record<string, { income: number; expense: number }> = {};

    for (const t of transactions) {
      const amount = new Prisma.Decimal(t.amount);

      if (!byCategory[t.category]) {
        byCategory[t.category] = { income: 0, expense: 0 };
      }

      if (t.type === 'INCOME') {
        totalIncome = totalIncome.add(amount);
        byCategory[t.category].income += Number(amount);
      } else {
        totalExpenses = totalExpenses.add(amount);
        byCategory[t.category].expense += Number(amount);
      }
    }

    return {
      month: targetMonth,
      year: targetYear,
      totalIncome: Number(totalIncome),
      totalExpenses: Number(totalExpenses),
      netProfit: Number(totalIncome.sub(totalExpenses)),
      byCategory,
    };
  },

  async listCategories(tenantId: string, type?: string) {
    const where: any = { tenantId };
    if (type) {
      where.type = type;
    }

    const categories = await prisma.financialCategory.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    return categories;
  },

  async createCategory(tenantId: string, data: CreateCategoryData) {
    const normalizedSubtype = data.type === 'INCOME' ? null : data.subtype ?? null;

    const category = await prisma.financialCategory.create({
      data: {
        tenantId,
        name: data.name,
        type: data.type,
        subtype: normalizedSubtype,
      },
    });

    return category;
  },

  async updateCategory(tenantId: string, id: string, data: Partial<CreateCategoryData>) {
    const existing = await prisma.financialCategory.findFirst({ where: { id, tenantId } });
    if (!existing) {
      throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Categoria nao encontrada');
    }

    const effectiveType = (data.type ?? existing.type) as 'INCOME' | 'EXPENSE';
    const updateData: any = { ...data };

    if (effectiveType === 'INCOME') {
      updateData.subtype = null;
    } else if (data.subtype !== undefined) {
      updateData.subtype = data.subtype ?? null;
    }

    const category = await prisma.financialCategory.update({
      where: { id },
      data: updateData,
    });

    return category;
  },

  async deleteCategory(tenantId: string, id: string) {
    const existing = await prisma.financialCategory.findFirst({ where: { id, tenantId } });
    if (!existing) {
      throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Categoria nao encontrada');
    }

    await prisma.financialCategory.delete({ where: { id } });
  },

  // ==========================================
  // DOCTORS REPORT
  // ==========================================
  //
  // Schema field references (verified against backend/prisma/schema.prisma):
  //
  //  User (line 111)
  //    - id, tenantId, name, role (Role enum, DOCTOR), especialidade (String?),
  //      isActive (Boolean)
  //
  //  ScheduledCall (line 788)
  //    - id, tenantId, customerId, doctorId, name, date (DateTime),
  //      status (String; value 'completed' for done appointments)
  //    - relations: doctor (User "DoctorScheduledCalls"), customer,
  //      procedures (ScheduledCallProcedure[])
  //    - NOTE: there is NO per-appointment repasseValue field.
  //
  //  ScheduledCallProcedure (line 1204)
  //    - id, scheduledCallId, tussProcedureId, authorizationNumber
  //    - relations: tussProcedure (TussProcedure)
  //    - NOTE: there is NO per-procedure repasseValue override.
  //
  //  TussProcedure (line 1184)
  //    - id, tenantId, code, description, type (CONSULTA|EXAME|CIRURGIA|TERAPIA|OUTROS),
  //      value (Float)
  //
  //  DoctorRepasse (line 1219)
  //    - id, tenantId, doctorId, procedureType (same enum as TussProcedure.type),
  //      percentage (Float, 0-100)
  //
  // Computation rules:
  //   - Faturado of a procedure = TussProcedure.value.
  //   - Repasse of a procedure = TussProcedure.value * DoctorRepasse.percentage / 100
  //     where DoctorRepasse matches doctorId + procedureType. If no matching repasse,
  //     repasse of that procedure = 0.
  //   - An appointment without procedures contributes 0 to totalFaturado/totalRepasse
  //     but still counts as a procedimento (1 appointment).
  //
  async getDoctorsReport(tenantId: string, startDate?: string, endDate?: string) {
    const now = new Date();
    const start = startDate
      ? new Date(startDate)
      : new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const end = endDate
      ? new Date(endDate)
      : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // Ensure the end date includes the full day when caller passes a plain date.
    if (endDate && endDate.length <= 10) {
      end.setHours(23, 59, 59, 999);
    }

    const [doctors, repasses, calls] = await Promise.all([
      prisma.user.findMany({
        where: { tenantId, role: 'DOCTOR', isActive: true },
        select: { id: true, name: true, especialidade: true },
        orderBy: { name: 'asc' },
      }),
      prisma.doctorRepasse.findMany({ where: { tenantId } }),
      prisma.scheduledCall.findMany({
        where: {
          tenantId,
          status: 'completed',
          doctorId: { not: null },
          date: { gte: start, lte: end },
        },
        orderBy: { date: 'asc' },
        include: {
          customer: { select: { id: true, name: true } },
          procedures: {
            include: {
              tussProcedure: {
                select: { id: true, code: true, description: true, type: true, value: true },
              },
            },
          },
        },
      }),
    ]);

    // Build lookup map: doctorId -> procedureType -> percentage.
    const repasseMap: Record<string, Record<string, number>> = {};
    for (const r of repasses) {
      if (!repasseMap[r.doctorId]) repasseMap[r.doctorId] = {};
      repasseMap[r.doctorId][r.procedureType] = Number(r.percentage) || 0;
    }

    type ProcedureEntry = {
      date: string;
      patientName: string;
      procedures: string[];
      valorFaturado: number;
      valorRepasse: number;
    };

    type DoctorBucket = {
      id: string;
      name: string;
      especialidade: string | null;
      totalProcedimentos: number;
      totalFaturado: number;
      totalRepasse: number;
      procedures: ProcedureEntry[];
    };

    const buckets: Record<string, DoctorBucket> = {};
    for (const doc of doctors) {
      buckets[doc.id] = {
        id: doc.id,
        name: doc.name,
        especialidade: doc.especialidade ?? null,
        totalProcedimentos: 0,
        totalFaturado: 0,
        totalRepasse: 0,
        procedures: [],
      };
    }

    for (const call of calls) {
      if (!call.doctorId) continue;
      const bucket = buckets[call.doctorId];
      // Only include calls whose doctor is still in the active-doctors list.
      if (!bucket) continue;

      let valorFaturado = 0;
      let valorRepasse = 0;
      const descs: string[] = [];

      for (const proc of call.procedures) {
        const tp = proc.tussProcedure;
        if (!tp) continue;
        const value = Number(tp.value) || 0;
        valorFaturado += value;
        const pct = repasseMap[call.doctorId]?.[tp.type] ?? 0;
        valorRepasse += value * (pct / 100);
        descs.push(tp.description || tp.code);
      }

      const patientName = call.customer?.name || call.name || 'Paciente';

      bucket.totalProcedimentos += 1;
      bucket.totalFaturado += valorFaturado;
      bucket.totalRepasse += valorRepasse;
      bucket.procedures.push({
        date: call.date.toISOString(),
        patientName,
        procedures: descs,
        valorFaturado,
        valorRepasse,
      });
    }

    const doctorsResult = Object.values(buckets)
      .filter((b) => b.totalProcedimentos >= 1)
      .map((b) => ({
        ...b,
        totalFaturado: Math.round(b.totalFaturado * 100) / 100,
        totalRepasse: Math.round(b.totalRepasse * 100) / 100,
        procedures: b.procedures.map((p) => ({
          ...p,
          valorFaturado: Math.round(p.valorFaturado * 100) / 100,
          valorRepasse: Math.round(p.valorRepasse * 100) / 100,
        })),
      }));

    const totalFaturado = doctorsResult.reduce((sum, d) => sum + d.totalFaturado, 0);
    const totalRepasse = doctorsResult.reduce((sum, d) => sum + d.totalRepasse, 0);
    const totalProcedimentos = doctorsResult.reduce((sum, d) => sum + d.totalProcedimentos, 0);

    return {
      totalFaturado: Math.round(totalFaturado * 100) / 100,
      totalRepasse: Math.round(totalRepasse * 100) / 100,
      totalProcedimentos,
      doctors: doctorsResult,
    };
  },
};
