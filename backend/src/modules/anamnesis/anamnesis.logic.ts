import { AppError } from '../../shared/middleware/error-handler';

/**
 * Lógica da Anamnese (campos estruturados), isolada de Prisma/env para teste.
 *
 * Proteção contra concorrência nos campos estruturados:
 *  - MERGE RASO: o conteúdo recebido sobrescreve apenas as próprias chaves; os
 *    campos preenchidos por outro profissional nunca são perdidos.
 *  - OPTIMISTIC LOCKING: a atualização só ocorre se a `version` esperada bater.
 *    Em conflito, re-mescla sobre o estado mais recente e tenta novamente (1x).
 *
 * Obs.: o texto livre da anamnese NÃO vive mais aqui — migrou para ClinicalNote
 * (append-only). Aqui ficam apenas os campos estruturados.
 */

export interface AnamnesisPrisma {
  anamnesis: {
    findFirst(args: any): Promise<any>;
    create(args: any): Promise<any>;
    updateMany(args: any): Promise<{ count: number }>;
  };
}

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

export function makeAnamnesisService(prisma: AnamnesisPrisma) {
  return {
    async get(tenantId: string, patientId: string) {
      return prisma.anamnesis.findFirst({
        where: { tenantId, patientId },
        orderBy: { createdAt: 'desc' },
      });
    },

    async create(tenantId: string, patientId: string, doctorId: string, data: any) {
      return prisma.anamnesis.create({
        data: { tenantId, patientId, doctorId, data: asObject(data) },
      });
    },

    /**
     * Atualiza os campos estruturados com merge raso + optimistic locking.
     * @param incoming Patch parcial (apenas os campos alterados) ou objeto completo.
     * @param expectedVersion Versão que o cliente carregou (optional). Se ausente,
     *        usa a versão atual do registro (compatível com clientes antigos).
     */
    async update(tenantId: string, id: string, incoming: any, expectedVersion?: number) {
      const existing = await prisma.anamnesis.findFirst({ where: { id, tenantId } });
      if (!existing) {
        throw new AppError(404, 'ANAMNESIS_NOT_FOUND', 'Anamnese não encontrada');
      }

      const patch = asObject(incoming);

      const tryUpdate = async (current: any) => {
        const merged = { ...asObject(current.data), ...patch };
        const guardVersion = typeof current.version === 'number' ? current.version : 0;
        const res = await prisma.anamnesis.updateMany({
          where: { id, tenantId, version: guardVersion },
          data: { data: merged, version: guardVersion + 1 },
        });
        return res.count > 0;
      };

      // 1ª tentativa: usa a versão esperada do cliente (ou a atual do registro).
      const firstGuard =
        typeof expectedVersion === 'number'
          ? { ...existing, version: expectedVersion }
          : existing;

      if (await tryUpdate(firstGuard)) {
        return prisma.anamnesis.findFirst({ where: { id, tenantId } });
      }

      // Conflito de concorrência: re-mescla sobre o estado mais novo e tenta 1x.
      const fresh = await prisma.anamnesis.findFirst({ where: { id, tenantId } });
      if (!fresh) {
        throw new AppError(404, 'ANAMNESIS_NOT_FOUND', 'Anamnese não encontrada');
      }
      if (await tryUpdate(fresh)) {
        return prisma.anamnesis.findFirst({ where: { id, tenantId } });
      }

      throw new AppError(409, 'ANAMNESIS_CONFLICT', 'Conflito de concorrência, recarregue e tente novamente');
    },
  };
}

export type AnamnesisService = ReturnType<typeof makeAnamnesisService>;
