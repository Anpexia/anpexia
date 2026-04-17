import crypto from 'crypto';
import prisma from '../../config/database';
import { AppError } from '../../shared/middleware/error-handler';

export type ProcedureType = string;

const DEFAULT_TYPES: string[] = ['CONSULTA', 'EXAME', 'CIRURGIA', 'TERAPIA', 'OUTROS'];

async function getTenantRepasseTypes(tenantId: string): Promise<string[]> {
  const rows = await prisma.repasseType.findMany({
    where: { tenantId },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    select: { name: true },
  });
  if (rows.length === 0) return DEFAULT_TYPES;
  return rows.map((r) => r.name);
}

interface CreateProcedureInput {
  code: string;
  description: string;
  type: string;
  value: number;
  convenioId?: string | null;
}

async function validateTypeForTenant(tenantId: string, type: string): Promise<string> {
  const normalized = (type || '').trim().toUpperCase();
  if (!normalized) {
    throw new AppError(400, 'INVALID_TYPE', 'Tipo obrigatório');
  }
  const validTypes = await getTenantRepasseTypes(tenantId);
  if (!validTypes.includes(normalized)) {
    throw new AppError(400, 'INVALID_TYPE', `Tipo inválido. Valores aceitos: ${validTypes.join(', ')}`);
  }
  return normalized;
}

export const tussService = {
  async list(tenantId: string, filters: { type?: string; convenioId?: string }) {
    const where: any = { tenantId };
    if (filters.type) where.type = filters.type;
    if (filters.convenioId) where.convenioId = filters.convenioId;

    return prisma.tussProcedure.findMany({
      where,
      include: { convenio: { select: { id: true, nome: true } } },
      orderBy: [{ type: 'asc' }, { description: 'asc' }],
    });
  },

  async create(tenantId: string, data: CreateProcedureInput) {
    const type = await validateTypeForTenant(tenantId, data.type);
    if (!data.code?.trim()) {
      throw new AppError(400, 'INVALID_CODE', 'Código TUSS obrigatório');
    }
    if (!data.description?.trim()) {
      throw new AppError(400, 'INVALID_DESCRIPTION', 'Descrição obrigatória');
    }
    if (typeof data.value !== 'number' || data.value < 0) {
      throw new AppError(400, 'INVALID_VALUE', 'Valor inválido');
    }

    return prisma.tussProcedure.create({
      data: {
        tenantId,
        code: data.code.trim(),
        description: data.description.trim(),
        type,
        value: data.value,
        convenioId: data.convenioId || null,
      },
      include: { convenio: { select: { id: true, nome: true } } },
    });
  },

  async update(tenantId: string, id: string, data: Partial<CreateProcedureInput>) {
    const existing = await prisma.tussProcedure.findFirst({ where: { id, tenantId } });
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Procedimento não encontrado');
    }

    const updateData: any = {};
    if (data.code !== undefined) updateData.code = data.code.trim();
    if (data.description !== undefined) updateData.description = data.description.trim();
    if (data.type !== undefined) updateData.type = await validateTypeForTenant(tenantId, data.type);
    if (data.value !== undefined) updateData.value = data.value;
    if (data.convenioId !== undefined) updateData.convenioId = data.convenioId || null;

    return prisma.tussProcedure.update({
      where: { id },
      data: updateData,
      include: { convenio: { select: { id: true, nome: true } } },
    });
  },

  async remove(tenantId: string, id: string) {
    const existing = await prisma.tussProcedure.findFirst({ where: { id, tenantId } });
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Procedimento não encontrado');
    }
    // Prevent deletion if used in any scheduled call procedure
    const used = await prisma.scheduledCallProcedure.count({ where: { tussProcedureId: id } });
    if (used > 0) {
      throw new AppError(400, 'IN_USE', 'Procedimento já vinculado a agendamentos');
    }
    await prisma.tussProcedure.delete({ where: { id } });
  },

  async generateTissXml(tenantId: string, params: { convenioId: string; dataInicio: string; dataFim: string }) {
    const { convenioId, dataInicio, dataFim } = params;

    const convenio = await prisma.convenio.findFirst({
      where: { id: convenioId, tenantId },
    });
    if (!convenio) {
      throw new AppError(404, 'CONVENIO_NOT_FOUND', 'Convênio não encontrado');
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { settings: true },
    });
    if (!tenant) throw new AppError(404, 'TENANT_NOT_FOUND', 'Clínica não encontrada');

    const start = new Date(`${dataInicio}T00:00:00-03:00`);
    const end = new Date(`${dataFim}T23:59:59.999-03:00`);

    // Find realized calls within period that have procedures from this convenio
    const calls = await prisma.scheduledCall.findMany({
      where: {
        tenantId,
        status: 'completed',
        date: { gte: start, lte: end },
        procedures: {
          some: {
            tussProcedure: { convenioId },
          },
        },
      },
      include: {
        customer: {
          include: {
            patientConvenios: {
              where: { convenioId },
              include: { convenio: true },
            },
          },
        },
        doctor: { select: { id: true, name: true, numeroRegistro: true, tipoRegistro: true } },
        procedures: {
          where: { tussProcedure: { convenioId } },
          include: { tussProcedure: true },
        },
      },
      orderBy: { date: 'asc' },
    });

    const nowIso = new Date().toISOString();
    const nowDate = nowIso.slice(0, 10);
    const nowTime = nowIso.slice(11, 19);
    const loteId = `${Date.now()}`.slice(-12);
    const cnpj = (tenant.settings?.cnpj || '').replace(/\D/g, '').padEnd(14, '0').slice(0, 14);

    const esc = (s: any) =>
      String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

    const fmtDate = (d: Date) => new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const fmtTime = (d: Date) => new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(11, 19);

    let seqGuia = 0;
    let totalValor = 0;
    const guiasXml: string[] = [];

    for (const call of calls) {
      seqGuia += 1;
      const patientConvenio = call.customer?.patientConvenios?.[0];
      const carteirinha = patientConvenio?.numeroCarteirinha || '';
      const validade = patientConvenio?.validade ? fmtDate(patientConvenio.validade) : '';

      const procedimentosXml = call.procedures
        .map((p, idx) => {
          const valor = p.tussProcedure.value;
          totalValor += valor;
          return `
        <ans:procedimentoExecutado>
          <ans:sequencialItem>${idx + 1}</ans:sequencialItem>
          <ans:dataExecucao>${fmtDate(call.date)}</ans:dataExecucao>
          <ans:horaInicial>${fmtTime(call.date)}</ans:horaInicial>
          <ans:procedimento>
            <ans:codigoTabela>22</ans:codigoTabela>
            <ans:codigoProcedimento>${esc(p.tussProcedure.code)}</ans:codigoProcedimento>
            <ans:descricaoProcedimento>${esc(p.tussProcedure.description)}</ans:descricaoProcedimento>
          </ans:procedimento>
          <ans:quantidadeExecutada>1</ans:quantidadeExecutada>
          <ans:valorUnitario>${valor.toFixed(2)}</ans:valorUnitario>
          <ans:valorTotal>${valor.toFixed(2)}</ans:valorTotal>
        </ans:procedimentoExecutado>`;
        })
        .join('');

      const guiaTotal = call.procedures.reduce((s, p) => s + p.tussProcedure.value, 0);
      const autorizacao = call.authorizationNumber || call.procedures.find((p) => p.authorizationNumber)?.authorizationNumber || '';

      guiasXml.push(`
    <ans:guiaSP-SADT>
      <ans:cabecalhoGuia>
        <ans:registroANS>${esc(convenio.codigo || '000000')}</ans:registroANS>
        <ans:numeroGuiaPrestador>${seqGuia}</ans:numeroGuiaPrestador>
      </ans:cabecalhoGuia>
      <ans:dadosAutorizacao>
        <ans:numeroGuiaOperadora>${esc(autorizacao)}</ans:numeroGuiaOperadora>
        <ans:dataAutorizacao>${fmtDate(call.date)}</ans:dataAutorizacao>
      </ans:dadosAutorizacao>
      <ans:dadosBeneficiario>
        <ans:numeroCarteira>${esc(carteirinha)}</ans:numeroCarteira>
        <ans:dataValidadeCarteira>${validade}</ans:dataValidadeCarteira>
        <ans:nomeBeneficiario>${esc(call.customer?.name || call.name)}</ans:nomeBeneficiario>
      </ans:dadosBeneficiario>
      <ans:dadosSolicitante>
        <ans:contratadoSolicitante>
          <ans:codigoPrestadorNaOperadora>${esc(cnpj)}</ans:codigoPrestadorNaOperadora>
          <ans:nomeContratado>${esc(tenant.name)}</ans:nomeContratado>
        </ans:contratadoSolicitante>
        <ans:profissionalSolicitante>
          <ans:nomeProfissional>${esc(call.doctor?.name || '')}</ans:nomeProfissional>
          <ans:conselhoProfissional>${esc(call.doctor?.tipoRegistro || 'CRM')}</ans:conselhoProfissional>
          <ans:numeroConselhoProfissional>${esc(call.doctor?.numeroRegistro || '')}</ans:numeroConselhoProfissional>
        </ans:profissionalSolicitante>
      </ans:dadosSolicitante>
      <ans:dadosAtendimento>
        <ans:dataAtendimento>${fmtDate(call.date)}</ans:dataAtendimento>
        <ans:tipoAtendimento>01</ans:tipoAtendimento>
        <ans:indicacaoAcidente>9</ans:indicacaoAcidente>
      </ans:dadosAtendimento>
      <ans:procedimentosExecutados>${procedimentosXml}
      </ans:procedimentosExecutados>
      <ans:valorTotal>
        <ans:valorProcedimentos>${guiaTotal.toFixed(2)}</ans:valorProcedimentos>
        <ans:valorTotalGeral>${guiaTotal.toFixed(2)}</ans:valorTotalGeral>
      </ans:valorTotal>
    </ans:guiaSP-SADT>`);
    }

    const corpoLote = `
  <ans:prestadorParaOperadora>
    <ans:cabecalhoLote>
      <ans:numeroLote>${loteId}</ans:numeroLote>
      <ans:prestadorContratado>
        <ans:codigoPrestadorNaOperadora>${esc(cnpj)}</ans:codigoPrestadorNaOperadora>
        <ans:nomeContratado>${esc(tenant.name)}</ans:nomeContratado>
        <ans:cnpjContratado>${esc(cnpj)}</ans:cnpjContratado>
      </ans:prestadorContratado>
      <ans:operadoraParaOperadora>
        <ans:registroANS>${esc(convenio.codigo || '000000')}</ans:registroANS>
        <ans:nomeOperadora>${esc(convenio.nome)}</ans:nomeOperadora>
      </ans:operadoraParaOperadora>
    </ans:cabecalhoLote>
    <ans:guiasTISS>${guiasXml.join('')}
    </ans:guiasTISS>
  </ans:prestadorParaOperadora>`;

    const cabecalho = `<ans:cabecalho>
    <ans:identificacaoTransacao>
      <ans:tipoTransacao>ENVIO_LOTE_GUIAS</ans:tipoTransacao>
      <ans:sequencialTransacao>${loteId}</ans:sequencialTransacao>
      <ans:dataRegistroTransacao>${nowDate}</ans:dataRegistroTransacao>
      <ans:horaRegistroTransacao>${nowTime}</ans:horaRegistroTransacao>
    </ans:identificacaoTransacao>
    <ans:origem>
      <ans:identificacaoPrestador>
        <ans:codigoPrestadorNaOperadora>${esc(cnpj)}</ans:codigoPrestadorNaOperadora>
      </ans:identificacaoPrestador>
    </ans:origem>
    <ans:destino>
      <ans:registroANS>${esc(convenio.codigo || '000000')}</ans:registroANS>
    </ans:destino>
    <ans:Padrao>4.01.00</ans:Padrao>
  </ans:cabecalho>`;

    // Build body without epilogo (for hash calculation)
    const bodyWithoutEpilogo = `${cabecalho}${corpoLote}`;

    // Hash is MD5 of the concatenated content (TISS spec)
    const hash = crypto.createHash('md5').update(bodyWithoutEpilogo, 'utf8').digest('hex');

    const epilogo = `
  <ans:epilogo>
    <ans:hash>${hash}</ans:hash>
  </ans:epilogo>`;

    const xml = `<?xml version="1.0" encoding="ISO-8859-1"?>
<ans:mensagemTISS xmlns:ans="http://www.ans.gov.br/padroes/tiss/schemas" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.ans.gov.br/padroes/tiss/schemas tissV4_01_00.xsd">
  ${bodyWithoutEpilogo}${epilogo}
</ans:mensagemTISS>`;

    return {
      xml,
      loteId,
      totalGuias: calls.length,
      totalValor,
      convenio: { id: convenio.id, nome: convenio.nome },
    };
  },

  // ----- Doctor Repasse -----

  async getDoctorRepasse(tenantId: string, doctorId: string) {
    const doctor = await prisma.user.findFirst({ where: { id: doctorId, tenantId } });
    if (!doctor) throw new AppError(404, 'DOCTOR_NOT_FOUND', 'Médico não encontrado');

    const repasses = await prisma.doctorRepasse.findMany({
      where: { tenantId, doctorId },
    });

    // Return percentages for all tenant repasse types (default 0)
    const validTypes = await getTenantRepasseTypes(tenantId);
    const map = new Map(repasses.map((r) => [r.procedureType, r.percentage]));
    return validTypes.map((type) => ({
      procedureType: type,
      percentage: map.get(type) ?? 0,
    }));
  },

  async updateDoctorRepasse(
    tenantId: string,
    doctorId: string,
    repasses: Array<{ procedureType: string; percentage: number }>,
  ) {
    const doctor = await prisma.user.findFirst({ where: { id: doctorId, tenantId } });
    if (!doctor) throw new AppError(404, 'DOCTOR_NOT_FOUND', 'Médico não encontrado');

    const results = [];
    for (const r of repasses) {
      const type = await validateTypeForTenant(tenantId, r.procedureType);
      const pct = Number(r.percentage);
      if (isNaN(pct) || pct < 0 || pct > 100) {
        throw new AppError(400, 'INVALID_PERCENTAGE', 'Percentual deve estar entre 0 e 100');
      }

      const existing = await prisma.doctorRepasse.findFirst({
        where: { tenantId, doctorId, procedureType: type },
      });

      if (existing) {
        results.push(
          await prisma.doctorRepasse.update({
            where: { id: existing.id },
            data: { percentage: pct },
          }),
        );
      } else {
        results.push(
          await prisma.doctorRepasse.create({
            data: { tenantId, doctorId, procedureType: type, percentage: pct },
          }),
        );
      }
    }

    return this.getDoctorRepasse(tenantId, doctorId);
  },

  async getRepasseReport(
    tenantId: string,
    doctorId: string,
    params: { startDate?: string; endDate?: string },
  ) {
    const doctor = await prisma.user.findFirst({ where: { id: doctorId, tenantId } });
    if (!doctor) throw new AppError(404, 'DOCTOR_NOT_FOUND', 'Médico não encontrado');

    const where: any = {
      tenantId,
      doctorId,
      status: 'completed',
    };

    if (params.startDate || params.endDate) {
      where.date = {};
      if (params.startDate) where.date.gte = new Date(`${params.startDate}T00:00:00-03:00`);
      if (params.endDate) where.date.lte = new Date(`${params.endDate}T23:59:59.999-03:00`);
    }

    const calls = await prisma.scheduledCall.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true } },
        procedures: { include: { tussProcedure: true } },
      },
      orderBy: { date: 'asc' },
    });

    const repasses = await prisma.doctorRepasse.findMany({ where: { tenantId, doctorId } });
    const repasseMap = new Map(repasses.map((r) => [r.procedureType, r.percentage]));

    let totalProcedimentos = 0;
    let totalRepasse = 0;
    const items: any[] = [];

    for (const call of calls) {
      for (const p of call.procedures) {
        const valor = p.tussProcedure.value;
        const pct = repasseMap.get(p.tussProcedure.type) ?? 0;
        const repasse = (valor * pct) / 100;
        totalProcedimentos += valor;
        totalRepasse += repasse;
        items.push({
          date: call.date,
          scheduledCallId: call.id,
          customerName: call.customer?.name || call.name,
          procedureCode: p.tussProcedure.code,
          procedureDescription: p.tussProcedure.description,
          procedureType: p.tussProcedure.type,
          value: valor,
          percentage: pct,
          repasse,
        });
      }
    }

    return {
      doctor: { id: doctor.id, name: doctor.name },
      period: { startDate: params.startDate, endDate: params.endDate },
      totalProcedimentos,
      totalRepasse,
      items,
    };
  },
};
