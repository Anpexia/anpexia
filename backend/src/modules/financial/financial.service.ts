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
};
