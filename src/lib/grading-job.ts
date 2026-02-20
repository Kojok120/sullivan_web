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

// ==========================================
// QStash Helpers
// ==========================================
import { Client as QStashClient } from '@upstash/qstash';

export async function publishGradingJob(fileId: string, fileName: string): Promise<void> {
  const token = process.env.QSTASH_TOKEN;
  const appUrl = process.env.GRADING_WORKER_URL || process.env.APP_URL;

  if (!token || !appUrl) {
    throw new Error('QStash configuration (QSTASH_TOKEN or APP_URL) is missing');
  }

  const client = new QStashClient({ token });
  const baseUrl = appUrl.replace(/\/+$/, '');

  await client.publishJSON({
    url: `${baseUrl}/api/queue/grading`,
    body: { fileId, fileName },
    retries: 3,
  });
  console.log(`Published grading job to QStash for ${fileName}`);
}

export async function publishDriveCheckJob(source: string, state: string | null, channelId: string | null): Promise<void> {
  const token = process.env.QSTASH_TOKEN;
  const appUrl = process.env.GRADING_WORKER_URL || process.env.APP_URL;

  if (!token || !appUrl) {
    throw new Error('QStash configuration (QSTASH_TOKEN or APP_URL) is missing');
  }

  const client = new QStashClient({ token });
  const baseUrl = appUrl.replace(/\/+$/, '');

  await client.publishJSON({
    url: `${baseUrl}/api/queue/drive-check`,
    body: { source, state, channelId },
    delay: "5s", // Wait 5 seconds for Drive API consistency
    retries: 3,
  });
  console.log(`Queued drive check via QStash (from: ${source})`);
}
