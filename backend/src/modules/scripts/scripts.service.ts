import prisma from '../../config/database';
import { AppError } from '../../shared/middleware/error-handler';

interface ListParams {
  search?: string;
  categoryId?: string;
}

interface CreateCategoryData {
  name: string;
  icon?: string;
  order?: number;
}

interface CreateScriptData {
  categoryId: string;
  title: string;
  content: string;
  tags?: string[];
}

export const scriptsService = {
  // Categories
  async listCategories(tenantId: string) {
    return prisma.scriptCategory.findMany({
      where: { tenantId, isActive: true },
      orderBy: { order: 'asc' },
      include: { _count: { select: { scripts: { where: { isActive: true } } } } },
    });
  },

  async createCategory(tenantId: string, data: CreateCategoryData) {
    return prisma.scriptCategory.create({
      data: { tenantId, ...data },
      include: { _count: { select: { scripts: { where: { isActive: true } } } } },
    });
  },

  async updateCategory(tenantId: string, id: string, data: Partial<CreateCategoryData>) {
    const existing = await prisma.scriptCategory.findFirst({ where: { id, tenantId } });
    if (!existing) throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Categoria nao encontrada');
    return prisma.scriptCategory.update({
      where: { id },
      data,
      include: { _count: { select: { scripts: { where: { isActive: true } } } } },
    });
  },

  async deleteCategory(tenantId: string, id: string) {
    const existing = await prisma.scriptCategory.findFirst({ where: { id, tenantId } });
    if (!existing) throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Categoria nao encontrada');
    await prisma.scriptCategory.update({ where: { id }, data: { isActive: false } });
  },

  // Scripts
  async listScripts(tenantId: string, params: ListParams) {
    const where: any = { tenantId, isActive: true };

    if (params.categoryId) {
      where.categoryId = params.categoryId;
    }

    if (params.search) {
      where.OR = [
        { title: { contains: params.search, mode: 'insensitive' } },
        { content: { contains: params.search, mode: 'insensitive' } },
        { tags: { hasSome: [params.search.toLowerCase()] } },
      ];
    }

    return prisma.script.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { category: { select: { id: true, name: true, icon: true } } },
    });
  },

  async getScriptById(tenantId: string, id: string) {
    const script = await prisma.script.findFirst({
      where: { id, tenantId },
      include: { category: { select: { id: true, name: true, icon: true } } },
    });
    if (!script) throw new AppError(404, 'SCRIPT_NOT_FOUND', 'Script nao encontrado');
    return script;
  },

  async createScript(tenantId: string, data: CreateScriptData) {
    const category = await prisma.scriptCategory.findFirst({
      where: { id: data.categoryId, tenantId },
    });
    if (!category) throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Categoria nao encontrada');

    return prisma.script.create({
      data: {
        tenantId,
        categoryId: data.categoryId,
        title: data.title,
        content: data.content,
        tags: data.tags || [],
      },
      include: { category: { select: { id: true, name: true, icon: true } } },
    });
  },

  async updateScript(tenantId: string, id: string, data: Partial<CreateScriptData>) {
    const existing = await prisma.script.findFirst({ where: { id, tenantId } });
    if (!existing) throw new AppError(404, 'SCRIPT_NOT_FOUND', 'Script nao encontrado');

    return prisma.script.update({
      where: { id },
      data: {
        ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
        ...(data.title !== undefined && { title: data.title }),
        ...(data.content !== undefined && { content: data.content }),
        ...(data.tags !== undefined && { tags: data.tags }),
      },
      include: { category: { select: { id: true, name: true, icon: true } } },
    });
  },

  async deleteScript(tenantId: string, id: string) {
    const existing = await prisma.script.findFirst({ where: { id, tenantId } });
    if (!existing) throw new AppError(404, 'SCRIPT_NOT_FOUND', 'Script nao encontrado');
    await prisma.script.update({ where: { id }, data: { isActive: false } });
  },

  // Seed default scripts for a clinic tenant
  async seedDefaultScripts(tenantId: string) {
    const existing = await prisma.scriptCategory.count({ where: { tenantId } });
    if (existing > 0) return; // Already seeded

    const categories = [
      { name: 'Agendamento', icon: 'Calendar', order: 1 },
      { name: 'Exames', icon: 'FlaskConical', order: 2 },
      { name: 'Medicamentos e Receitas', icon: 'Pill', order: 3 },
      { name: 'Valores e Convenios', icon: 'DollarSign', order: 4 },
      { name: 'Localizacao e Horarios', icon: 'MapPin', order: 5 },
      { name: 'Duvidas Frequentes', icon: 'HelpCircle', order: 6 },
      { name: 'Urgencias e Emergencias', icon: 'AlertTriangle', order: 7 },
    ];

    const created: Record<string, string> = {};
    for (const cat of categories) {
      const c = await prisma.scriptCategory.create({ data: { tenantId, ...cat } });
      created[cat.name] = c.id;
    }

    const defaultScripts = [
      // Agendamento
      { categoryId: created['Agendamento'], title: 'Paciente quer marcar consulta', content: 'Claro! Vou verificar a disponibilidade para voce.\n\nPosso confirmar alguns dados?\n- Nome completo\n- Data de nascimento\n- Convenio (se tiver)\n- Preferencia de dia/horario\n\nVou verificar os horarios disponiveis e retorno em seguida.', tags: ['agendar', 'marcar', 'consulta'] },
      { categoryId: created['Agendamento'], title: 'Paciente quer remarcar consulta', content: 'Sem problemas! Vou reagendar sua consulta.\n\nPreciso confirmar:\n- Seu nome completo\n- Data da consulta atual\n- Nova data/horario de preferencia\n\nVou verificar a disponibilidade e confirmo em seguida. Lembrando que pedimos que remarcacoes sejam feitas com pelo menos 24h de antecedencia.', tags: ['remarcar', 'reagendar', 'mudar'] },
      { categoryId: created['Agendamento'], title: 'Paciente quer cancelar consulta', content: 'Posso ajudar com o cancelamento.\n\nPreciso confirmar:\n- Seu nome completo\n- Data da consulta a ser cancelada\n\nLembrando que pedimos aviso com pelo menos 24h de antecedencia. Gostaria de reagendar para outra data?', tags: ['cancelar', 'desmarcar'] },
      { categoryId: created['Agendamento'], title: 'Paciente pergunta sobre primeira consulta', content: 'Para sua primeira consulta, por favor traga:\n- Documento de identidade com foto\n- Cartao do convenio (se aplicavel)\n- Exames anteriores relacionados\n- Lista de medicamentos que usa atualmente\n\nRecomendamos chegar 15 minutos antes do horario marcado para preencher a ficha cadastral.', tags: ['primeira', 'novo', 'documentos'] },

      // Exames
      { categoryId: created['Exames'], title: 'Paciente pergunta sobre resultado de exame', content: 'Os resultados de exames ficam disponiveis em:\n- Exames de sangue: 3 a 5 dias uteis\n- Exames de imagem: 5 a 7 dias uteis\n- Biopsia: 7 a 15 dias uteis\n\nVoce pode retirar os resultados presencialmente ou solicitar envio por email. Preciso do seu nome completo para verificar o status.', tags: ['resultado', 'exame', 'prazo'] },
      { categoryId: created['Exames'], title: 'Paciente pergunta sobre preparo de exame', content: 'O preparo depende do tipo de exame. Em geral:\n\n- Exame de sangue: jejum de 8 a 12 horas (pode beber agua)\n- Ultrassom abdominal: jejum de 6 horas\n- Ultrassom pelvico: bexiga cheia (beba 4 copos de agua 1h antes)\n\nPosso verificar o preparo especifico do seu exame. Qual exame foi solicitado?', tags: ['preparo', 'jejum', 'instrucoes'] },
      { categoryId: created['Exames'], title: 'Paciente quer saber como retirar exames', content: 'Para retirar seus exames:\n\n1. Presencialmente: traga documento com foto, de segunda a sexta das 8h as 17h\n2. Por email: podemos enviar em PDF para o email cadastrado\n3. Pelo site/app: resultados disponiveis na area do paciente\n\nPreciso do seu nome completo para verificar se os resultados ja estao prontos.', tags: ['retirar', 'buscar', 'pegar'] },

      // Medicamentos e Receitas
      { categoryId: created['Medicamentos e Receitas'], title: 'Paciente precisa de segunda via de receita', content: 'Para segunda via de receita, o paciente precisa:\n- Agendar consulta de retorno com o medico, OU\n- Em caso de medicamento de uso continuo, podemos solicitar renovacao ao medico\n\nReceitas de medicamentos controlados (tarja preta) exigem nova consulta obrigatoriamente.\n\nPosso agendar um retorno rapido para voce?', tags: ['receita', 'segunda via', 'medicamento'] },
      { categoryId: created['Medicamentos e Receitas'], title: 'Paciente com duvida sobre medicamento prescrito', content: 'Entendo sua preocupacao! Porem, duvidas sobre posologia, efeitos colaterais ou interacoes medicamentosas precisam ser esclarecidas diretamente com o medico que prescreveu.\n\nPosso agendar um retorno ou encaminhar sua duvida para o doutor(a). Qual o nome do medico que te atendeu?', tags: ['duvida', 'remedio', 'efeito colateral'] },

      // Valores e Convenios
      { categoryId: created['Valores e Convenios'], title: 'Paciente pergunta sobre convenios aceitos', content: 'Aceitamos os seguintes convenios:\n[LISTA DE CONVENIOS DA CLINICA]\n\nPara consultas, basta apresentar a carteirinha do convenio. Alguns procedimentos podem precisar de autorizacao previa — nesse caso, orientamos sobre o processo.\n\nQual convenio voce possui?', tags: ['convenio', 'plano', 'aceitar'] },
      { categoryId: created['Valores e Convenios'], title: 'Paciente pergunta valor de consulta particular', content: 'Nossos valores para consulta particular:\n- Consulta geral: R$ [VALOR]\n- Consulta especialista: R$ [VALOR]\n- Retorno (ate 30 dias): R$ [VALOR]\n\nFormas de pagamento: dinheiro, PIX, cartao de credito/debito.\n\nDeseja agendar uma consulta?', tags: ['valor', 'preco', 'particular', 'quanto custa'] },
      { categoryId: created['Valores e Convenios'], title: 'Paciente pergunta sobre cobertura do convenio', content: 'Para verificar cobertura do seu convenio, preciso de:\n- Nome do convenio\n- Numero da carteirinha\n- Procedimento desejado\n\nVou consultar junto a operadora e retorno com a informacao. A verificacao geralmente leva de 1 a 2 dias uteis.', tags: ['cobertura', 'autorizado', 'cobre'] },

      // Localizacao e Horarios
      { categoryId: created['Localizacao e Horarios'], title: 'Paciente pergunta endereco da clinica', content: 'Nosso endereco:\n[ENDERECO COMPLETO DA CLINICA]\n\nPonto de referencia: [REFERENCIA]\n\nEstacionamento: [INFORMACAO SOBRE ESTACIONAMENTO]\n\nPosso enviar a localizacao pelo Google Maps?', tags: ['endereco', 'onde fica', 'localizacao', 'como chegar'] },
      { categoryId: created['Localizacao e Horarios'], title: 'Paciente pergunta horario de funcionamento', content: 'Nosso horario de funcionamento:\n- Segunda a sexta: 8h as 18h\n- Sabado: 8h as 12h\n- Domingo e feriados: fechado\n\n*Horarios podem variar conforme o profissional. Deseja verificar a disponibilidade de algum medico especifico?', tags: ['horario', 'funcionamento', 'abre', 'fecha'] },

      // Duvidas Frequentes
      { categoryId: created['Duvidas Frequentes'], title: 'Paciente quer falar com o medico por WhatsApp', content: 'Infelizmente o atendimento medico via WhatsApp nao e possivel por questoes eticas e de seguranca.\n\nO que posso fazer por voce:\n- Agendar uma consulta presencial ou teleconsulta\n- Encaminhar uma mensagem ao medico (sem garantia de resposta imediata)\n- Agendar retorno se ja e paciente\n\nComo prefere prosseguir?', tags: ['falar com medico', 'whatsapp', 'mensagem'] },
      { categoryId: created['Duvidas Frequentes'], title: 'Paciente pergunta sobre teleconsulta', content: 'Sim, oferecemos teleconsulta!\n\nComo funciona:\n1. Agendamento igual a consulta presencial\n2. Voce recebe um link por email/WhatsApp\n3. No horario marcado, acesse o link pelo celular ou computador\n4. A receita e atestado sao enviados digitalmente\n\nValores e cobertura de convenio sao os mesmos da consulta presencial. Deseja agendar?', tags: ['teleconsulta', 'online', 'video'] },

      // Urgencias e Emergencias
      { categoryId: created['Urgencias e Emergencias'], title: 'Paciente relata sintomas urgentes', content: '**ATENCAO**: Se voce esta com:\n- Dor no peito\n- Dificuldade para respirar\n- Sangramento intenso\n- Perda de consciencia\n- Sinais de AVC (rosto torto, fala arrastada, fraqueza em um lado)\n\n**LIGUE IMEDIATAMENTE para o SAMU: 192** ou va a UPA/pronto-socorro mais proximo.\n\nNossa clinica nao possui atendimento de emergencia.', tags: ['urgente', 'emergencia', 'dor', 'grave'] },
      { categoryId: created['Urgencias e Emergencias'], title: 'Paciente com febre ou mal-estar', content: 'Recomendacoes gerais:\n- Febre acima de 38.5°C: tome o antitermico receitado e monitore\n- Febre acima de 39°C por mais de 48h: procure atendimento medico\n- Mal-estar leve: descanse, hidrate-se e observe\n\nSe os sintomas persistirem ou piorarem, procure uma UPA.\n\nPosso agendar uma consulta para avaliacao?', tags: ['febre', 'mal estar', 'sintomas'] },
    ];

    for (const script of defaultScripts) {
      await prisma.script.create({ data: { tenantId, ...script } });
    }
  },
};
