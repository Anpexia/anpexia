import prisma from '../../config/database';
import { AppError } from '../../shared/middleware/error-handler';

export const conveniosService = {
  // ---- Convenios (tenant-level) ----

  async list(tenantId: string) {
    return prisma.convenio.findMany({
      where: { tenantId },
      orderBy: { nome: 'asc' },
    });
  },

  async create(tenantId: string, data: { nome: string; codigo?: string; ativo?: boolean }) {
    return prisma.convenio.create({
      data: { tenantId, nome: data.nome, codigo: data.codigo, ativo: data.ativo ?? true },
    });
  },

  async update(tenantId: string, id: string, data: { nome?: string; codigo?: string; ativo?: boolean }) {
    const conv = await prisma.convenio.findFirst({ where: { id, tenantId } });
    if (!conv) throw new AppError(404, 'NOT_FOUND', 'Convenio nao encontrado');
    return prisma.convenio.update({ where: { id }, data });
  },

  async remove(tenantId: string, id: string) {
    const conv = await prisma.convenio.findFirst({ where: { id, tenantId } });
    if (!conv) throw new AppError(404, 'NOT_FOUND', 'Convenio nao encontrado');
    await prisma.convenio.delete({ where: { id } });
  },

  async seed(tenantId: string) {
    const defaults = [
      { nome: 'Bradesco Saude', codigo: '005711' },
      { nome: 'SulAmerica', codigo: '006246' },
      { nome: 'Unimed', codigo: '000701' },
      { nome: 'Amil', codigo: '326305' },
      { nome: 'Particular', codigo: null },
    ];
    for (const d of defaults) {
      await prisma.convenio.upsert({
        where: { tenantId_nome: { tenantId, nome: d.nome } },
        update: {},
        create: { tenantId, nome: d.nome, codigo: d.codigo },
      });
    }
  },

  // ---- Patient Convenio ----

  async getPatientConvenio(patientId: string) {
    return prisma.patientConvenio.findFirst({
      where: { patientId },
      include: {
        convenio: { select: { id: true, nome: true, codigo: true } },
        autorizacoes: { orderBy: { dataSolicitacao: 'desc' }, take: 1 },
      },
    });
  },

  async upsertPatientConvenio(patientId: string, data: {
    convenioId: string;
    numeroCarteirinha: string;
    validade?: string | null;
    titular?: string;
    nomeTitular?: string | null;
  }) {
    const existing = await prisma.patientConvenio.findFirst({ where: { patientId } });

    if (existing) {
      // If changing convenio, delete old and create new
      if (existing.convenioId !== data.convenioId) {
        await prisma.patientConvenio.delete({ where: { id: existing.id } });
        return prisma.patientConvenio.create({
          data: {
            patientId,
            convenioId: data.convenioId,
            numeroCarteirinha: data.numeroCarteirinha,
            validade: data.validade ? new Date(data.validade) : null,
            titular: data.titular || 'PROPRIO',
            nomeTitular: data.nomeTitular || null,
          },
          include: { convenio: { select: { id: true, nome: true, codigo: true } } },
        });
      }
      return prisma.patientConvenio.update({
        where: { id: existing.id },
        data: {
          numeroCarteirinha: data.numeroCarteirinha,
          validade: data.validade ? new Date(data.validade) : null,
          titular: data.titular || 'PROPRIO',
          nomeTitular: data.nomeTitular || null,
        },
        include: { convenio: { select: { id: true, nome: true, codigo: true } } },
      });
    }

    return prisma.patientConvenio.create({
      data: {
        patientId,
        convenioId: data.convenioId,
        numeroCarteirinha: data.numeroCarteirinha,
        validade: data.validade ? new Date(data.validade) : null,
        titular: data.titular || 'PROPRIO',
        nomeTitular: data.nomeTitular || null,
      },
      include: { convenio: { select: { id: true, nome: true, codigo: true } } },
    });
  },

  // ---- Autorizacoes ----

  async listAutorizacoes(patientId: string) {
    const pc = await prisma.patientConvenio.findFirst({ where: { patientId } });
    if (!pc) return [];
    return prisma.autorizacao.findMany({
      where: { patientConvenioId: pc.id },
      orderBy: { dataSolicitacao: 'desc' },
    });
  },

  async createAutorizacao(tenantId: string, patientId: string, data: {
    procedimento: string;
    codigoTUSS?: string;
    observacoes?: string;
    criadoPor?: string;
  }) {
    const pc = await prisma.patientConvenio.findFirst({ where: { patientId } });
    if (!pc) throw new AppError(400, 'NO_CONVENIO', 'Paciente nao possui convenio cadastrado');
    return prisma.autorizacao.create({
      data: {
        patientConvenioId: pc.id,
        tenantId,
        procedimento: data.procedimento,
        codigoTUSS: data.codigoTUSS || null,
        observacoes: data.observacoes || null,
        criadoPor: data.criadoPor || null,
      },
    });
  },

  async updateAutorizacao(tenantId: string, id: string, data: {
    status?: string;
    numeroAutorizacao?: string;
    dataResposta?: string;
    observacoes?: string;
  }) {
    const auth = await prisma.autorizacao.findFirst({ where: { id, tenantId } });
    if (!auth) throw new AppError(404, 'NOT_FOUND', 'Autorizacao nao encontrada');
    return prisma.autorizacao.update({
      where: { id },
      data: {
        ...(data.status && { status: data.status }),
        ...(data.numeroAutorizacao !== undefined && { numeroAutorizacao: data.numeroAutorizacao }),
        ...(data.dataResposta && { dataResposta: new Date(data.dataResposta) }),
        ...(data.observacoes !== undefined && { observacoes: data.observacoes }),
      },
    });
  },

  // ---- Dashboard ----

  async getPendingAutorizacoes(tenantId: string, limit = 5) {
    const autorizacoes = await prisma.autorizacao.findMany({
      where: { tenantId, status: 'PENDENTE' },
      include: {
        patientConvenio: {
          include: {
            patient: { select: { id: true, name: true } },
            convenio: { select: { nome: true } },
          },
        },
      },
      orderBy: { dataSolicitacao: 'desc' },
      take: limit,
    });

    const total = await prisma.autorizacao.count({
      where: { tenantId, status: 'PENDENTE' },
    });

    return {
      total,
      items: autorizacoes.map((a) => ({
        id: a.id,
        patientName: a.patientConvenio.patient.name,
        convenioNome: a.patientConvenio.convenio.nome,
        procedimento: a.procedimento,
        dataSolicitacao: a.dataSolicitacao,
      })),
    };
  },
};
