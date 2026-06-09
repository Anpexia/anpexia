import { AppError } from '../../shared/middleware/error-handler';

/**
 * Lógica do módulo de Texto Livre Clínico (ClinicalNote), isolada de Prisma/env
 * para ser testável sem banco. O módulo é APPEND-ONLY: nunca há UPDATE/overwrite
 * de conteúdo — cada salvamento gera um novo registro imutável.
 *
 * O campo `context` separa ANAMNESE de EVOLUCAO. Os dados permanecem totalmente
 * isolados entre os dois módulos (mesma tabela, registros distintos por context).
 */

export const CLINICAL_NOTE_CONTEXTS = ['ANAMNESE', 'EVOLUCAO'] as const;
export type ClinicalNoteContext = (typeof CLINICAL_NOTE_CONTEXTS)[number];

export function isValidContext(value: unknown): value is ClinicalNoteContext {
  return typeof value === 'string' && (CLINICAL_NOTE_CONTEXTS as readonly string[]).includes(value);
}

export interface ClinicalNoteAuthor {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
}

export interface ClinicalNotesPrisma {
  customer: { findFirst(args: any): Promise<any> };
  clinicalNote: {
    create(args: any): Promise<any>;
    findMany(args: any): Promise<any[]>;
    findFirst(args: any): Promise<any>;
    update(args: any): Promise<any>;
  };
}

export interface AuditFn {
  (input: {
    userId?: string | null;
    userEmail?: string | null;
    userRole?: string | null;
    tenantId?: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    metadata?: Record<string, unknown> | null;
    ipAddress?: string | null;
  }): Promise<void> | void;
}

export interface ClinicalNotesDeps {
  prisma: ClinicalNotesPrisma;
  /** Resolve o nome autoritativo do autor (tabela de usuários). Opcional. */
  resolveAuthorName?: (authorId: string, tenantId: string) => Promise<string | null>;
  /** Gravador de auditoria. Nunca deve lançar. */
  audit?: AuditFn;
}

export function makeClinicalNotesService(deps: ClinicalNotesDeps) {
  const { prisma, resolveAuthorName, audit } = deps;

  function assertContext(context: unknown): ClinicalNoteContext {
    if (!isValidContext(context)) {
      throw new AppError(400, 'INVALID_CONTEXT', 'Contexto inválido (use ANAMNESE ou EVOLUCAO)');
    }
    return context;
  }

  return {
    /** Lista os registros de texto livre de um paciente em ordem cronológica (mais antigo primeiro). */
    async list(tenantId: string, patientId: string, context: unknown) {
      const ctx = assertContext(context);
      return prisma.clinicalNote.findMany({
        where: { tenantId, patientId, context: ctx },
        orderBy: { createdAt: 'asc' },
      });
    },

    /**
     * Cria um novo registro de texto livre (append-only). Nunca sobrescreve.
     * Registra a auditoria do conteúdo adicionado.
     */
    async create(
      tenantId: string,
      patientId: string,
      author: ClinicalNoteAuthor,
      context: unknown,
      content: string,
      meta?: { ip?: string | null },
    ) {
      const ctx = assertContext(context);
      const text = typeof content === 'string' ? content.trim() : '';
      if (!text) {
        throw new AppError(400, 'EMPTY_CONTENT', 'O conteúdo do registro não pode ser vazio');
      }

      const patient = await prisma.customer.findFirst({ where: { id: patientId, tenantId } });
      if (!patient) {
        throw new AppError(404, 'PATIENT_NOT_FOUND', 'Paciente não encontrado');
      }

      let authorName = author.name ?? null;
      if (!authorName && resolveAuthorName) {
        try {
          authorName = await resolveAuthorName(author.id, tenantId);
        } catch {
          authorName = null;
        }
      }

      const note = await prisma.clinicalNote.create({
        data: {
          tenantId,
          patientId,
          authorId: author.id,
          authorName: authorName ?? null,
          context: ctx,
          content: text,
        },
      });

      // Auditoria: registra usuário, ação, conteúdo adicionado (data/hora vem do created_at).
      if (audit) {
        await audit({
          userId: author.id,
          userEmail: author.email ?? null,
          userRole: author.role ?? null,
          tenantId,
          action: 'CREATE_CLINICALNOTE',
          entity: 'ClinicalNote',
          entityId: note.id,
          ipAddress: meta?.ip ?? null,
          metadata: {
            context: ctx,
            authorName: authorName ?? null,
            content: text,
            contentLength: text.length,
          },
        });
      }

      return note;
    },

    /**
     * Edita um registro de texto livre. SOMENTE o autor original pode editar
     * (correção/complemento). Preserva autor e data de criação; grava
     * updatedBy/updatedAt e audita o conteúdo antes/depois.
     */
    async update(
      tenantId: string,
      noteId: string,
      editor: ClinicalNoteAuthor,
      content: string,
      meta?: { ip?: string | null },
    ) {
      const text = typeof content === 'string' ? content.trim() : '';
      if (!text) {
        throw new AppError(400, 'EMPTY_CONTENT', 'O conteúdo do registro não pode ser vazio');
      }

      const existing = await prisma.clinicalNote.findFirst({ where: { id: noteId, tenantId } });
      if (!existing) {
        throw new AppError(404, 'CLINICALNOTE_NOT_FOUND', 'Registro não encontrado');
      }
      // Regra de negócio: apenas o autor do registro pode editá-lo.
      if (existing.authorId !== editor.id) {
        throw new AppError(403, 'NOT_AUTHOR', 'Somente o autor do registro pode editá-lo');
      }

      const before = existing.content;

      const note = await prisma.clinicalNote.update({
        where: { id: noteId },
        // authorId/authorName e createdAt NÃO são tocados — autor e data originais preservados.
        data: { content: text, updatedById: editor.id, updatedAt: new Date() },
      });

      if (audit) {
        await audit({
          userId: editor.id,
          userEmail: editor.email ?? null,
          userRole: editor.role ?? null,
          tenantId,
          action: 'UPDATE_CLINICALNOTE',
          entity: 'ClinicalNote',
          entityId: note.id,
          ipAddress: meta?.ip ?? null,
          metadata: {
            context: existing.context,
            originalAuthorId: existing.authorId,
            originalAuthorName: existing.authorName ?? null,
            contentBefore: before,
            contentAfter: text,
            contentLength: text.length,
          },
        });
      }

      return note;
    },
  };
}

export type ClinicalNotesService = ReturnType<typeof makeClinicalNotesService>;
