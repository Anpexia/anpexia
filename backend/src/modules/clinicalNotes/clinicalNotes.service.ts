import prisma from '../../config/database';
import { logAction } from '../../services/auditLog.service';
import { makeClinicalNotesService } from './clinicalNotes.logic';

/**
 * Instância padrão do serviço, ligada ao Prisma real, ao audit log e à resolução
 * autoritativa do nome do autor (tabela de usuários).
 */
export const clinicalNotesService = makeClinicalNotesService({
  prisma: prisma as any,
  resolveAuthorName: async (authorId: string) => {
    const user = await prisma.user.findUnique({ where: { id: authorId }, select: { name: true } });
    return user?.name ?? null;
  },
  audit: logAction,
});
