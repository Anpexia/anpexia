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

const EVOLUCAO_GERAL: FieldDef[] = [
  { key: 'subjective', label: 'Descricao / Subjetivo', placeholder: 'Queixas do paciente, relato, sintomas...', type: 'textarea' },
  { key: 'objective', label: 'Conduta / Objetivo', placeholder: 'Achados do exame, conduta adotada, tratamento...', type: 'textarea' },
  { key: 'exams', label: 'Exames Solicitados', placeholder: 'Exames laboratoriais, imagem, outros...', type: 'textarea' },
  { key: 'returnDate', label: 'Retorno Previsto', placeholder: 'Ex: Retorno em 30 dias, apos resultado dos exames...', type: 'textarea' },
];

const DADOS_CLINICOS_GERAL: FieldDef[] = [
  { key: 'bloodType', label: 'Tipo Sanguineo', placeholder: 'Ex: A+, O-, AB+...', type: 'text' },
  { key: 'allergies', label: 'Alergias', placeholder: 'Alergias conhecidas...', type: 'textarea' },
  { key: 'medications', label: 'Medicamentos em Uso', placeholder: 'Medicamentos atuais...', type: 'textarea' },
  { key: 'chronicDiseases', label: 'Doencas Cronicas', placeholder: 'Diabetes, hipertensao, etc...', type: 'textarea' },
  { key: 'clinicalNotes', label: 'Observacoes Clinicas', placeholder: 'Observacoes gerais...', type: 'textarea' },
];

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
    anamnese: ANAMNESE_GERAL,
    evolucao: EVOLUCAO_GERAL,
    dadosClinicos: DADOS_CLINICOS_GERAL,
  },

  CLINICA_ESTETICA: {
    label: 'Clinica Estetica',
    anamnese: ANAMNESE_GERAL,
    evolucao: EVOLUCAO_GERAL,
    dadosClinicos: DADOS_CLINICOS_GERAL,
  },

  CLINICA_ODONTOLOGICA: {
    label: 'Clinica Odontologica',
    anamnese: ANAMNESE_GERAL,
    evolucao: EVOLUCAO_GERAL,
    dadosClinicos: DADOS_CLINICOS_GERAL,
  },

  SALAO_BELEZA: {
    label: 'Salao de Beleza',
    anamnese: ANAMNESE_GERAL,
    evolucao: EVOLUCAO_GERAL,
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
