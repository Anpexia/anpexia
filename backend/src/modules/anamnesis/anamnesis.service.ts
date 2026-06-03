import prisma from '../../config/database';
import { makeAnamnesisService } from './anamnesis.logic';

export const anamnesisService = makeAnamnesisService(prisma as any);
