import prisma from '../../config/database';
import { AppError } from '../../shared/middleware/error-handler';

interface MaterialInput {
  productId: string;
  quantity: number;
}

interface CreateTemplateInput {
  name: string;
  description?: string | null;
  materials: MaterialInput[];
}

interface UpdateTemplateInput {
  name?: string;
  description?: string | null;
  materials?: MaterialInput[];
}

function shapeTemplate(tpl: any) {
  return {
    id: tpl.id,
    name: tpl.name,
    description: tpl.description,
    createdAt: tpl.createdAt,
    materials: (tpl.materials || []).map((m: any) => ({
      productId: m.productId,
      productName: m.product?.name || '',
      unit: m.product?.unit || 'un',
      quantity: m.quantity,
    })),
  };
}

async function validateMaterials(tenantId: string, materials: MaterialInput[]) {
  if (!Array.isArray(materials) || materials.length === 0) {
    throw new AppError(400, 'MATERIALS_REQUIRED', 'Pelo menos um material e obrigatorio');
  }
  const productIds = Array.from(new Set(materials.map((m) => m.productId)));
  const found = await prisma.product.findMany({
    where: { id: { in: productIds }, tenantId },
    select: { id: true },
  });
  if (found.length !== productIds.length) {
    throw new AppError(400, 'INVALID_PRODUCTS', 'Um ou mais materiais nao pertencem ao tenant');
  }
  for (const m of materials) {
    if (typeof m.quantity !== 'number' || m.quantity <= 0) {
      throw new AppError(400, 'INVALID_QUANTITY', 'Quantidade do material deve ser maior que zero');
    }
  }
}

export const procedureTemplatesService = {
  async list(tenantId: string) {
    const templates = await prisma.procedureTemplate.findMany({
      where: { tenantId },
      include: {
        materials: {
          include: { product: { select: { name: true, unit: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });
    return templates.map(shapeTemplate);
  },

  async create(tenantId: string, data: CreateTemplateInput) {
    if (!data.name?.trim()) {
      throw new AppError(400, 'NAME_REQUIRED', 'Nome do procedimento e obrigatorio');
    }
    await validateMaterials(tenantId, data.materials);

    const created = await prisma.$transaction(async (tx) => {
      const tpl = await tx.procedureTemplate.create({
        data: {
          tenantId,
          name: data.name.trim(),
          description: data.description?.trim() || null,
        },
      });
      await tx.procedureMaterial.createMany({
        data: data.materials.map((m) => ({
          templateId: tpl.id,
          productId: m.productId,
          quantity: m.quantity,
        })),
      });
      return tx.procedureTemplate.findUnique({
        where: { id: tpl.id },
        include: {
          materials: {
            include: { product: { select: { name: true, unit: true } } },
          },
        },
      });
    });
    return shapeTemplate(created);
  },

  async update(tenantId: string, id: string, data: UpdateTemplateInput) {
    const existing = await prisma.procedureTemplate.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Template nao encontrado');
    }
    if (existing.tenantId !== tenantId) {
      throw new AppError(403, 'FORBIDDEN', 'Template nao pertence ao tenant');
    }

    if (data.materials) {
      await validateMaterials(tenantId, data.materials);
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.procedureTemplate.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name.trim() } : {}),
          ...(data.description !== undefined
            ? { description: data.description?.trim() || null }
            : {}),
        },
      });

      if (data.materials) {
        await tx.procedureMaterial.deleteMany({ where: { templateId: id } });
        await tx.procedureMaterial.createMany({
          data: data.materials.map((m) => ({
            templateId: id,
            productId: m.productId,
            quantity: m.quantity,
          })),
        });
      }

      return tx.procedureTemplate.findUnique({
        where: { id },
        include: {
          materials: {
            include: { product: { select: { name: true, unit: true } } },
          },
        },
      });
    });
    return shapeTemplate(updated);
  },

  async remove(tenantId: string, id: string) {
    const existing = await prisma.procedureTemplate.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Template nao encontrado');
    }
    if (existing.tenantId !== tenantId) {
      throw new AppError(403, 'FORBIDDEN', 'Template nao pertence ao tenant');
    }
    await prisma.procedureTemplate.delete({ where: { id } });
  },
};
