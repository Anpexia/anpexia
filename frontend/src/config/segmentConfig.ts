import type { TenantSegment } from '../utils/segment';

export interface FieldDef {
  key: string;
  label: string;
  placeholder: string;
  type: 'textarea' | 'text' | 'number' | 'select';
  options?: string[];
}

export interface SegmentConfig {
  label: string;
  anamnese: FieldDef[];
  evolucao: FieldDef[];
  dadosClinicos: FieldDef[];
}

// ========== ANAMNESE ==========

const ANAMNESE_GERAL: FieldDef[] = [
  { key: 'queixaPrincipal', label: 'Queixas Principais', placeholder: 'Descreva as queixas do paciente...', type: 'textarea' },
  { key: 'historiaDoencaAtual', label: 'Historico de Doenca Atual', placeholder: 'Descreva o historico da doenca atual, inicio, evolucao...', type: 'textarea' },
  { key: 'historicoMedicoPassado', label: 'Historico Medico Passado', placeholder: 'Cirurgias, internacoes, doencas previas...', type: 'textarea' },
  { key: 'medicamentos', label: 'Medicamentos em Uso', placeholder: 'Liste os medicamentos, dosagens e frequencia...', type: 'textarea' },
  { key: 'alergias', label: 'Alergias', placeholder: 'Alergias a medicamentos, alimentos, substancias...', type: 'textarea' },
  { key: 'historicoFamiliar', label: 'Historico Familiar', placeholder: 'Doencas na familia: diabetes, hipertensao, cancer, cardiopatias...', type: 'textarea' },
  { key: 'historicoSocial', label: 'Historico Social', placeholder: 'Tabagismo, etilismo, atividade fisica, profissao, moradia...', type: 'textarea' },
  { key: 'observacoesAnamnese', label: 'Observacoes', placeholder: 'Observacoes adicionais...', type: 'textarea' },
];

const ANAMNESE_OFTALMO: FieldDef[] = [
  { key: 'queixaPrincipal', label: 'Queixa Principal', placeholder: 'Descreva a queixa visual do paciente...', type: 'textarea' },
  { key: 'historiaDoencaAtual', label: 'Historia da Doenca Atual', placeholder: 'Inicio, evolucao dos sintomas visuais...', type: 'textarea' },
  { key: 'usoOculos', label: 'Uso de Oculos / Lentes', placeholder: 'Usa oculos? Lentes de contato? Desde quando? Grau atual...', type: 'textarea' },
  { key: 'historicoOftalmologico', label: 'Historico Oftalmologico', placeholder: 'Cirurgias oculares, traumas, tratamentos anteriores, laser...', type: 'textarea' },
  { key: 'historicoMedicoPassado', label: 'Historico Medico', placeholder: 'Diabetes, hipertensao, doencas autoimunes, tireoide...', type: 'textarea' },
  { key: 'medicamentos', label: 'Medicamentos em Uso', placeholder: 'Colirios, medicamentos sistemicos, dosagens...', type: 'textarea' },
  { key: 'alergias', label: 'Alergias', placeholder: 'Alergias a colirios, medicamentos, substancias...', type: 'textarea' },
  { key: 'historicoFamiliar', label: 'Historico Familiar', placeholder: 'Glaucoma, DMRI, ceratocone, cegueira na familia...', type: 'textarea' },
  { key: 'observacoesAnamnese', label: 'Observacoes', placeholder: 'Observacoes adicionais...', type: 'textarea' },
];

const ANAMNESE_ESTETICA: FieldDef[] = [
  { key: 'queixaPrincipal', label: 'Queixa / Objetivo Estetico', placeholder: 'Qual o objetivo do paciente? Area de interesse...', type: 'textarea' },
  { key: 'historiaDoencaAtual', label: 'Tratamentos Esteticos Anteriores', placeholder: 'Procedimentos ja realizados, resultados, complicacoes...', type: 'textarea' },
  { key: 'fototipo', label: 'Tipo de Pele / Fototipo', placeholder: 'Fitzpatrick I-VI, oleosidade, sensibilidade, manchas...', type: 'textarea' },
  { key: 'historicoMedicoPassado', label: 'Historico Medico', placeholder: 'Diabetes, queloides, herpes, disturbios de cicatrizacao...', type: 'textarea' },
  { key: 'medicamentos', label: 'Medicamentos em Uso', placeholder: 'Isotretinoina, anticoagulantes, hormonais, suplementos...', type: 'textarea' },
  { key: 'alergias', label: 'Alergias', placeholder: 'Alergias a cosmeticos, anestesicos, latex, substancias...', type: 'textarea' },
  { key: 'historicoSocial', label: 'Habitos', placeholder: 'Tabagismo, exposicao solar, uso de protetor, skincare...', type: 'textarea' },
  { key: 'observacoesAnamnese', label: 'Observacoes', placeholder: 'Expectativas, contraindicacoes observadas...', type: 'textarea' },
];

const ANAMNESE_ODONTO: FieldDef[] = [
  { key: 'queixaPrincipal', label: 'Queixa Principal', placeholder: 'Descreva a queixa odontologica do paciente...', type: 'textarea' },
  { key: 'historiaDoencaAtual', label: 'Historia da Doenca Atual', placeholder: 'Inicio dos sintomas, dor, sensibilidade, sangramento...', type: 'textarea' },
  { key: 'historicoOdontologico', label: 'Historico Odontologico', placeholder: 'Tratamentos previos, proteses, implantes, ortodontia, endodontia...', type: 'textarea' },
  { key: 'historicoMedicoPassado', label: 'Historico Medico', placeholder: 'Endocardite, hemofilia, diabetes, hepatite, HIV, radioterapia...', type: 'textarea' },
  { key: 'medicamentos', label: 'Medicamentos em Uso', placeholder: 'Anticoagulantes, bifosfonatos, imunossupressores...', type: 'textarea' },
  { key: 'alergias', label: 'Alergias', placeholder: 'Alergias a anestesicos, latex, antibioticos, metais...', type: 'textarea' },
  { key: 'habitosOrais', label: 'Habitos Orais', placeholder: 'Bruxismo, apertamento, roer unhas, respirador bucal, tabagismo...', type: 'textarea' },
  { key: 'historicoFamiliar', label: 'Historico Familiar', placeholder: 'Doencas periodontais, cancer oral na familia...', type: 'textarea' },
  { key: 'observacoesAnamnese', label: 'Observacoes', placeholder: 'Observacoes adicionais...', type: 'textarea' },
];

// ========== EVOLUCAO ==========

const EVOLUCAO_GERAL: FieldDef[] = [
  { key: 'subjective', label: 'Descricao / Subjetivo', placeholder: 'Queixas do paciente, relato, sintomas...', type: 'textarea' },
  { key: 'objective', label: 'Conduta / Objetivo', placeholder: 'Achados do exame, conduta adotada, tratamento...', type: 'textarea' },
  { key: 'exams', label: 'Exames Solicitados', placeholder: 'Exames laboratoriais, imagem, outros...', type: 'textarea' },
  { key: 'returnDate', label: 'Retorno Previsto', placeholder: 'Ex: Retorno em 30 dias, apos resultado dos exames...', type: 'textarea' },
];

const EVOLUCAO_OFTALMO: FieldDef[] = [
  { key: 'subjective', label: 'Queixa / Subjetivo', placeholder: 'Queixas visuais, sintomas, relato do paciente...', type: 'textarea' },
  { key: 'acuity_od', label: 'Acuidade Visual OD', placeholder: 'Ex: 20/20, 20/40 cc, J1...', type: 'text' },
  { key: 'acuity_oe', label: 'Acuidade Visual OE', placeholder: 'Ex: 20/20, 20/40 cc, J1...', type: 'text' },
  { key: 'iop_od', label: 'Pressao Intraocular OD (mmHg)', placeholder: 'Ex: 14', type: 'number' },
  { key: 'iop_oe', label: 'Pressao Intraocular OE (mmHg)', placeholder: 'Ex: 15', type: 'number' },
  { key: 'objective', label: 'Biomicroscopia / Exame', placeholder: 'Achados do exame: palpebras, conjuntiva, cornea, CA, cristalino, FO...', type: 'textarea' },
  { key: 'exams', label: 'Exames Solicitados', placeholder: 'OCT, campo visual, paquimetria, topografia, retinografia...', type: 'textarea' },
  { key: 'plan', label: 'Conduta / Plano', placeholder: 'Prescricao de colirios, orientacoes, encaminhamentos...', type: 'textarea' },
  { key: 'returnDate', label: 'Retorno', placeholder: 'Ex: Retorno em 3 meses com exames...', type: 'textarea' },
];

const EVOLUCAO_ESTETICA: FieldDef[] = [
  { key: 'subjective', label: 'Queixa / Area Tratada', placeholder: 'Area de interesse, expectativa do paciente...', type: 'textarea' },
  { key: 'objective', label: 'Procedimento Realizado', placeholder: 'Protocolo aplicado, produtos, dosagem, tecnica...', type: 'textarea' },
  { key: 'assessment', label: 'Avaliacao Pos-procedimento', placeholder: 'Resultado imediato, reacoes, observacoes clinicas...', type: 'textarea' },
  { key: 'plan', label: 'Orientacoes / Proxima Sessao', placeholder: 'Cuidados pos-procedimento, proxima sessao prevista...', type: 'textarea' },
  { key: 'exams', label: 'Fotos / Exames', placeholder: 'Registro fotografico antes/depois, exames solicitados...', type: 'textarea' },
  { key: 'returnDate', label: 'Retorno', placeholder: 'Ex: Retorno em 15 dias para avaliacao...', type: 'textarea' },
];

const EVOLUCAO_ODONTO: FieldDef[] = [
  { key: 'subjective', label: 'Queixa / Subjetivo', placeholder: 'Sintomas, dor, sensibilidade, relato do paciente...', type: 'textarea' },
  { key: 'denteRegiao', label: 'Dente / Regiao', placeholder: 'Ex: 36, 46, Quadrante superior direito, arcada inferior...', type: 'text' },
  { key: 'objective', label: 'Exame Clinico / Procedimento', placeholder: 'Achados clinicos, procedimento realizado, materiais usados...', type: 'textarea' },
  { key: 'assessment', label: 'Diagnostico', placeholder: 'Carie, periodontite, pulpite, fratura, abscesso...', type: 'textarea' },
  { key: 'plan', label: 'Plano de Tratamento', placeholder: 'Proximos procedimentos, encaminhamentos, orientacoes...', type: 'textarea' },
  { key: 'exams', label: 'Exames Solicitados', placeholder: 'Radiografia periapical, panoramica, tomografia...', type: 'textarea' },
  { key: 'returnDate', label: 'Retorno', placeholder: 'Ex: Retorno em 7 dias para remocao de sutura...', type: 'textarea' },
];

// ========== DADOS CLINICOS ==========

const DADOS_CLINICOS_GERAL: FieldDef[] = [
  { key: 'bloodType', label: 'Tipo Sanguineo', placeholder: 'Ex: A+, O-, AB+...', type: 'text' },
  { key: 'allergies', label: 'Alergias', placeholder: 'Alergias conhecidas...', type: 'textarea' },
  { key: 'medications', label: 'Medicamentos em Uso', placeholder: 'Medicamentos atuais...', type: 'textarea' },
  { key: 'chronicDiseases', label: 'Doencas Cronicas', placeholder: 'Diabetes, hipertensao, etc...', type: 'textarea' },
  { key: 'clinicalNotes', label: 'Observacoes Clinicas', placeholder: 'Observacoes gerais...', type: 'textarea' },
];

// ========== CONFIGS POR SEGMENTO ==========

const configs: Record<string, SegmentConfig> = {
  CLINICA_GERAL: {
    label: 'Clinica Geral',
    anamnese: ANAMNESE_GERAL,
    evolucao: EVOLUCAO_GERAL,
    dadosClinicos: DADOS_CLINICOS_GERAL,
  },

  CLINICA_MEDICA: {
    label: 'Clinica Medica',
    anamnese: ANAMNESE_GERAL,
    evolucao: EVOLUCAO_GERAL,
    dadosClinicos: DADOS_CLINICOS_GERAL,
  },

  CLINICA_OFTALMOLOGICA: {
    label: 'Clinica Oftalmologica',
    anamnese: ANAMNESE_OFTALMO,
    evolucao: EVOLUCAO_OFTALMO,
    dadosClinicos: DADOS_CLINICOS_GERAL,
  },

  CLINICA_ESTETICA: {
    label: 'Clinica Estetica',
    anamnese: ANAMNESE_ESTETICA,
    evolucao: EVOLUCAO_ESTETICA,
    dadosClinicos: DADOS_CLINICOS_GERAL,
  },

  CLINICA_ODONTOLOGICA: {
    label: 'Clinica Odontologica',
    anamnese: ANAMNESE_ODONTO,
    evolucao: EVOLUCAO_ODONTO,
    dadosClinicos: DADOS_CLINICOS_GERAL,
  },

  SALAO_BELEZA: {
    label: 'Salao de Beleza',
    anamnese: ANAMNESE_ESTETICA,
    evolucao: EVOLUCAO_ESTETICA,
    dadosClinicos: DADOS_CLINICOS_GERAL,
  },

  OUTROS: {
    label: 'Outros',
    anamnese: ANAMNESE_GERAL,
    evolucao: EVOLUCAO_GERAL,
    dadosClinicos: DADOS_CLINICOS_GERAL,
  },
};

export function getSegmentConfig(segment?: string | null): SegmentConfig {
  return configs[segment || 'CLINICA_GERAL'] || configs.CLINICA_GERAL;
}

export const SEGMENT_OPTIONS: { value: TenantSegment; label: string }[] = [
  { value: 'CLINICA_GERAL', label: 'Clinica Geral' },
  { value: 'CLINICA_MEDICA', label: 'Clinica Medica' },
  { value: 'CLINICA_OFTALMOLOGICA', label: 'Clinica Oftalmologica' },
  { value: 'CLINICA_ESTETICA', label: 'Clinica Estetica' },
  { value: 'CLINICA_ODONTOLOGICA', label: 'Clinica Odontologica' },
  { value: 'SALAO_BELEZA', label: 'Salao de Beleza' },
  { value: 'OUTROS', label: 'Outros' },
];
