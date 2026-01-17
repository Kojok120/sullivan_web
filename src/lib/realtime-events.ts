import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export type RealtimeEventType =
  | 'grading_completed'
  | 'grading_failed'
  | 'gamification_update';

type RealtimeEventInput = {
  userId: string;
  type: RealtimeEventType;
  payload?: Prisma.InputJsonValue | null;
};

export async function emitRealtimeEvent({
  userId,
  type,
  payload,
}: RealtimeEventInput) {
  await prisma.realtimeEvent.create({
    data: {
      userId,
      type,
      payload: payload ?? undefined,
    },
  });
}
