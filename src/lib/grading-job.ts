import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
    DEFAULT_DRIVE_CHECK_TASK_QUEUE,
    DEFAULT_GRADING_TASK_QUEUE,
    enqueueCloudTask,
} from '@/lib/cloud-tasks';

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

function resolveGradingTaskQueue() {
  return (process.env.GRADING_TASK_QUEUE || DEFAULT_GRADING_TASK_QUEUE).trim() || DEFAULT_GRADING_TASK_QUEUE;
}

function resolveDriveCheckTaskQueue() {
  return (process.env.DRIVE_CHECK_TASK_QUEUE || DEFAULT_DRIVE_CHECK_TASK_QUEUE).trim() || DEFAULT_DRIVE_CHECK_TASK_QUEUE;
}

export async function publishGradingJob(fileId: string, fileName: string): Promise<void> {
  await enqueueCloudTask({
    queue: resolveGradingTaskQueue(),
    path: '/api/queue/grading',
    payload: { fileId, fileName },
  });
  console.log(`Published grading job to Cloud Tasks for ${fileName}`);
}

export async function publishDriveCheckJob(source: string, state: string | null, channelId: string | null): Promise<void> {
  await enqueueCloudTask({
    queue: resolveDriveCheckTaskQueue(),
    path: '/api/queue/drive-check',
    payload: { source, state, channelId },
    delaySeconds: 5,
  });
  console.log(`Queued drive check via Cloud Tasks (from: ${source})`);
}
