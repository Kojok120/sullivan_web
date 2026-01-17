import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export type ClaimResult = {
  shouldProcess: boolean;
  reason?: string;
};

export async function claimGradingJob(fileId: string, fileName: string): Promise<ClaimResult> {
  try {
    await prisma.gradingJob.create({
      data: {
        fileId,
        fileName,
        status: 'PROCESSING',
      },
    });
    return { shouldProcess: true };
  } catch (error) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      throw error;
    }

    const existing = await prisma.gradingJob.findUnique({ where: { fileId } });
    if (!existing) {
      return { shouldProcess: false, reason: 'unknown' };
    }

    if (existing.status === 'COMPLETED' || existing.status === 'PROCESSING') {
      return { shouldProcess: false, reason: existing.status };
    }

    const claimed = await prisma.gradingJob.updateMany({
      where: { fileId, status: 'FAILED' },
      data: {
        status: 'PROCESSING',
        fileName,
        attempts: { increment: 1 },
        lastError: null,
      },
    });

    return claimed.count === 1
      ? { shouldProcess: true, reason: 'retry' }
      : { shouldProcess: false, reason: 'busy' };
  }
}

export async function markGradingJobCompleted(fileId: string): Promise<void> {
  await prisma.gradingJob.updateMany({
    where: { fileId },
    data: { status: 'COMPLETED', lastError: null },
  });
}

export async function markGradingJobFailed(fileId: string, message: string): Promise<void> {
  await prisma.gradingJob.updateMany({
    where: { fileId },
    data: { status: 'FAILED', lastError: message.slice(0, 2000) },
  });
}
