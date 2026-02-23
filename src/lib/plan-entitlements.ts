import type { ClassroomPlan } from '@prisma/client';

/**
 * 教室プランに応じたAI家庭教師機能の利用可否を返す。
 * PREMIUM のみ許可し、未所属/未設定は安全側で拒否する。
 */
export function canUseAiTutor(plan: ClassroomPlan | null | undefined): boolean {
  return plan === 'PREMIUM';
}
