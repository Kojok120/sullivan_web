import 'dotenv/config';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DEMO_CLASSROOM_NAME = 'デモ教室';

async function main() {
  // 既存要件に合わせ、デモ教室を必ず存在させる
  const demoClassroom = await prisma.classroom.upsert({
    where: { name: DEMO_CLASSROOM_NAME },
    update: {
      plan: 'STANDARD',
    },
    create: {
      name: DEMO_CLASSROOM_NAME,
      plan: 'STANDARD',
      groups: [],
    },
    select: {
      id: true,
      name: true,
      plan: true,
    },
  });

  // TEACHER/HEAD_TEACHER を全件デモ教室に統一する（冪等）
  const updated = await prisma.user.updateMany({
    where: {
      role: {
        in: ['TEACHER', 'HEAD_TEACHER'],
      },
    },
    data: {
      classroomId: demoClassroom.id,
    },
  });

  console.log(
    `[backfill-role-classroom] classroom=${demoClassroom.name} plan=${demoClassroom.plan} updatedUsers=${updated.count}`,
  );
}

main()
  .catch((error) => {
    console.error('[backfill-role-classroom] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
