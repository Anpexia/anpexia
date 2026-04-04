import prisma from '../../config/database';
import { AppError } from '../../shared/middleware/error-handler';

export const signaturesService = {
  async getSignature(tenantId: string, doctorId: string) {
    const signature = await prisma.doctorSignature.findUnique({
      where: {
        tenantId_doctorId: { tenantId, doctorId },
      },
    });

    if (!signature) {
      throw new AppError(404, 'SIGNATURE_NOT_FOUND', 'Assinatura nao encontrada');
    }

    return signature;
  },

  async upsertSignature(tenantId: string, doctorId: string, signatureImage: string) {
    const signature = await prisma.doctorSignature.upsert({
      where: {
        tenantId_doctorId: { tenantId, doctorId },
      },
      update: {
        signatureImage,
      },
      create: {
        tenantId,
        doctorId,
        signatureImage,
      },
    });

    return signature;
  },
};
