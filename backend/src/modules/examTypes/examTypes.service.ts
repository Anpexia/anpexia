import prisma from '../../config/database';
import { AppError } from '../../shared/middleware/error-handler';

const SEED_BY_SEGMENT: Record<string, { name: string; category: string }[]> = {
  CLINICA_GERAL: [
    { name: 'Hemograma Completo', category: 'LABORATORIAL' },
    { name: 'Glicemia em Jejum', category: 'LABORATORIAL' },
    { name: 'Colesterol Total e Fracoes', category: 'LABORATORIAL' },
    { name: 'Triglicerides', category: 'LABORATORIAL' },
    { name: 'TSH e T4 Livre', category: 'LABORATORIAL' },
    { name: 'Creatinina', category: 'LABORATORIAL' },
    { name: 'Ureia', category: 'LABORATORIAL' },
    { name: 'TGO / TGP', category: 'LABORATORIAL' },
    { name: 'Urina Tipo I (EAS)', category: 'LABORATORIAL' },
    { name: 'Raio-X de Torax', category: 'IMAGEM' },
    { name: 'Ultrassonografia Abdominal', category: 'IMAGEM' },
    { name: 'Eletrocardiograma', category: 'CARDIOLOGICO' },
  ],
  CLINICA_MEDICA: [
    { name: 'Hemograma Completo', category: 'LABORATORIAL' },
    { name: 'Glicemia em Jejum', category: 'LABORATORIAL' },
    { name: 'Hemoglobina Glicada (HbA1c)', category: 'LABORATORIAL' },
    { name: 'Colesterol Total e Fracoes', category: 'LABORATORIAL' },
    { name: 'Triglicerides', category: 'LABORATORIAL' },
    { name: 'TSH e T4 Livre', category: 'LABORATORIAL' },
    { name: 'Creatinina', category: 'LABORATORIAL' },
    { name: 'Ureia', category: 'LABORATORIAL' },
    { name: 'Acido Urico', category: 'LABORATORIAL' },
    { name: 'TGO / TGP', category: 'LABORATORIAL' },
    { name: 'Vitamina D', category: 'LABORATORIAL' },
    { name: 'Vitamina B12', category: 'LABORATORIAL' },
    { name: 'Ferritina', category: 'LABORATORIAL' },
    { name: 'PCR (Proteina C Reativa)', category: 'LABORATORIAL' },
    { name: 'Urina Tipo I (EAS)', category: 'LABORATORIAL' },
    { name: 'Raio-X de Torax', category: 'IMAGEM' },
    { name: 'Ultrassonografia Abdominal', category: 'IMAGEM' },
    { name: 'Tomografia Computadorizada', category: 'IMAGEM' },
    { name: 'Ressonancia Magnetica', category: 'IMAGEM' },
    { name: 'Eletrocardiograma', category: 'CARDIOLOGICO' },
    { name: 'Ecocardiograma', category: 'CARDIOLOGICO' },
  ],
  CLINICA_OFTALMOLOGICA: [
    { name: 'Tonometria', category: 'OFTALMOLOGICO' },
    { name: 'Fundoscopia', category: 'OFTALMOLOGICO' },
    { name: 'Biomicroscopia', category: 'OFTALMOLOGICO' },
    { name: 'OCT de Macula', category: 'OFTALMOLOGICO' },
    { name: 'OCT de Nervo Optico', category: 'OFTALMOLOGICO' },
    { name: 'Campo Visual Computadorizado', category: 'OFTALMOLOGICO' },
    { name: 'Retinografia', category: 'OFTALMOLOGICO' },
    { name: 'Topografia Corneana', category: 'OFTALMOLOGICO' },
    { name: 'Paquimetria', category: 'OFTALMOLOGICO' },
    { name: 'Gonioscopia', category: 'OFTALMOLOGICO' },
    { name: 'Angiofluoresceinografia', category: 'OFTALMOLOGICO' },
    { name: 'Biometria Ultrassonica', category: 'OFTALMOLOGICO' },
    { name: 'Mapeamento de Retina', category: 'OFTALMOLOGICO' },
    { name: 'Teste de Schirmer', category: 'OFTALMOLOGICO' },
    { name: 'Curva Tensional Diaria', category: 'OFTALMOLOGICO' },
    { name: 'Microscopia Especular', category: 'OFTALMOLOGICO' },
  ],
  CLINICA_ESTETICA: [
    { name: 'Avaliacao Corporal', category: 'AVALIACAO' },
    { name: 'Avaliacao Facial', category: 'AVALIACAO' },
    { name: 'Bioimpedancia', category: 'AVALIACAO' },
    { name: 'Registro Fotografico', category: 'AVALIACAO' },
    { name: 'Dermatoscopia', category: 'DERMATOLOGICO' },
    { name: 'Hemograma Completo', category: 'LABORATORIAL' },
    { name: 'Coagulograma', category: 'LABORATORIAL' },
    { name: 'Glicemia em Jejum', category: 'LABORATORIAL' },
  ],
  CLINICA_ODONTOLOGICA: [
    { name: 'Radiografia Periapical', category: 'IMAGEM' },
    { name: 'Radiografia Panoramica', category: 'IMAGEM' },
    { name: 'Radiografia Interproximal (Bite-Wing)', category: 'IMAGEM' },
    { name: 'Tomografia Cone Beam (TCFC)', category: 'IMAGEM' },
    { name: 'Radiografia Oclusal', category: 'IMAGEM' },
    { name: 'Telerradiografia', category: 'IMAGEM' },
    { name: 'Modelos de Estudo', category: 'COMPLEMENTAR' },
    { name: 'Teste de Vitalidade Pulpar', category: 'COMPLEMENTAR' },
    { name: 'Exame Periodontal Completo', category: 'COMPLEMENTAR' },
    { name: 'Hemograma Completo', category: 'LABORATORIAL' },
    { name: 'Coagulograma', category: 'LABORATORIAL' },
    { name: 'Glicemia em Jejum', category: 'LABORATORIAL' },
  ],
};

export const examTypesService = {
  async list(tenantId: string, autoSeed?: string) {
    let items = await prisma.examType.findMany({
      where: { tenantId },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    if (items.length === 0 && autoSeed) {
      await this.seed(tenantId, autoSeed);
      items = await prisma.examType.findMany({
        where: { tenantId },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      });
    }
    return items;
  },

  async create(tenantId: string, data: { name: string; category?: string }) {
    return prisma.examType.create({
      data: {
        tenantId,
        name: data.name,
        category: data.category || 'GERAL',
      },
    });
  },

  async update(tenantId: string, id: string, data: { name?: string; category?: string; ativo?: boolean }) {
    const existing = await prisma.examType.findFirst({ where: { id, tenantId } });
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Tipo de exame nao encontrado');
    return prisma.examType.update({ where: { id }, data });
  },

  async remove(tenantId: string, id: string) {
    const existing = await prisma.examType.findFirst({ where: { id, tenantId } });
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Tipo de exame nao encontrado');
    await prisma.examType.delete({ where: { id } });
  },

  async seed(tenantId: string, segment?: string) {
    const seg = segment || 'CLINICA_GERAL';
    const defaults = SEED_BY_SEGMENT[seg] || SEED_BY_SEGMENT.CLINICA_GERAL;
    for (const d of defaults) {
      await prisma.examType.upsert({
        where: { tenantId_name: { tenantId, name: d.name } },
        update: {},
        create: { tenantId, name: d.name, category: d.category },
      });
    }
  },
};
