import 'dotenv/config';
import { PrismaClient, Role, ClassroomPlan } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

const prisma = new PrismaClient();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  : null;

const DEFAULT_PASSWORD = 'password123';

type SeedUser = {
  loginId: string;
  name: string;
  role: Role;
  group?: string | null;
  classroomId?: string | null;
};

async function upsertPrismaUser({
  loginId,
  name,
  role,
  group,
  classroomId,
}: SeedUser) {
  return await prisma.user.upsert({
    where: { loginId },
    update: {
      name,
      role,
      group: group ?? null,
      classroomId: classroomId ?? null,
    },
    create: {
      loginId,
      name,
      role,
      group: group ?? null,
      classroomId: classroomId ?? null,
    },
  });
}

async function ensureSupabaseAuthUser(prismaUser: {
  id: string;
  loginId: string;
  name: string | null;
  role: Role;
}) {
  if (!supabaseAdmin) {
    console.warn('Supabase admin client not configured. Skipping Auth user creation.');
    return;
  }

  const email = `${prismaUser.loginId}@sullivan-internal.local`;
  const appMetadata = {
    role: prismaUser.role,
    loginId: prismaUser.loginId,
    name: prismaUser.name ?? '',
    prismaUserId: prismaUser.id,
  };
  const userMetadata = {
    isDefaultPassword: true,
  };

  const { error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: DEFAULT_PASSWORD,
    email_confirm: true,
    app_metadata: appMetadata,
    user_metadata: userMetadata,
  });

  if (!error) return;

  if (!error.message.includes('already')) {
    console.warn(`Supabase Auth creation failed for ${email}:`, error.message);
    return;
  }

  const { data, error: listError } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });

  if (listError) {
    console.warn(`Supabase listUsers failed for ${email}:`, listError.message);
    return;
  }

  const existing = data.users.find((user) => user.email === email);
  if (!existing) {
    console.warn(`Supabase user not found for ${email}.`);
    return;
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
    existing.id,
    {
      app_metadata: appMetadata,
      user_metadata: {
        ...(existing.user_metadata || {}),
        isDefaultPassword: true,
      },
    }
  );

  if (updateError) {
    console.warn(`Supabase Auth update failed for ${email}:`, updateError.message);
  }
}

async function seedUsers() {
  const classroom = await prisma.classroom.upsert({
    where: { name: 'デモ教室' },
    update: { groups: ['月曜', '水曜'], plan: ClassroomPlan.STANDARD },
    create: { name: 'デモ教室', groups: ['月曜', '水曜'], plan: ClassroomPlan.STANDARD },
  });

  const users: SeedUser[] = [
    {
      loginId: 'S0001',
      name: 'Test Student',
      role: Role.STUDENT,
      group: '月曜',
      classroomId: classroom.id,
    },
    {
      loginId: 'T0001',
      name: 'Test Teacher',
      role: Role.TEACHER,
      classroomId: classroom.id,
    },
    {
      loginId: 'H0001',
      name: 'Test Head Teacher',
      role: Role.HEAD_TEACHER,
      classroomId: classroom.id,
    },
    {
      loginId: 'A0001',
      name: 'Admin User',
      role: Role.ADMIN,
    },
  ];

  for (const user of users) {
    const prismaUser = await upsertPrismaUser(user);
    await ensureSupabaseAuthUser(prismaUser);
  }
}

type SeedProblem = {
  customId: string;
  question: string;
  answer: string;
  order: number;
  videoUrl?: string;
  acceptedAnswers?: string[];
};

type SeedCoreProblem = {
  name: string;
  masterNumber: number;
  order: number;
  problems: SeedProblem[];
};

type SeedSubject = {
  name: string;
  order: number;
  coreProblems: SeedCoreProblem[];
};

async function upsertCoreProblem(subjectId: string, coreProblem: SeedCoreProblem) {
  const existing = await prisma.coreProblem.findFirst({
    where: { subjectId, masterNumber: coreProblem.masterNumber },
  });

  if (existing) {
    return await prisma.coreProblem.update({
      where: { id: existing.id },
      data: {
        name: coreProblem.name,
        masterNumber: coreProblem.masterNumber,
        order: coreProblem.order,
      },
    });
  }

  return await prisma.coreProblem.create({
    data: {
      name: coreProblem.name,
      masterNumber: coreProblem.masterNumber,
      order: coreProblem.order,
      subjectId,
    },
  });
}

async function upsertProblem(subjectId: string, coreProblemId: string, problem: SeedProblem) {
  return await prisma.problem.upsert({
    where: {
      subjectId_customId: {
        subjectId,
        customId: problem.customId,
      },
    },
    update: {
      question: problem.question,
      answer: problem.answer,
      order: problem.order,
      videoUrl: problem.videoUrl,
      acceptedAnswers: problem.acceptedAnswers ?? [],
      subjectId,
      coreProblems: { set: [{ id: coreProblemId }] },
    },
    create: {
      subjectId,
      customId: problem.customId,
      question: problem.question,
      answer: problem.answer,
      order: problem.order,
      videoUrl: problem.videoUrl,
      acceptedAnswers: problem.acceptedAnswers ?? [],
      coreProblems: { connect: [{ id: coreProblemId }] },
    },
  });
}

async function seedCurriculum() {
  const subjects: SeedSubject[] = [
    {
      name: '英語',
      order: 1,
      coreProblems: [
        {
          name: 'be動詞の肯定文',
          masterNumber: 1,
          order: 1,
          problems: [
            { customId: 'E-1', question: 'I ( ) a student.', answer: 'am', order: 1 },
            { customId: 'E-2', question: 'You ( ) a teacher.', answer: 'are', order: 2 },
            { customId: 'E-3', question: 'He ( ) my friend.', answer: 'is', order: 3 },
          ],
        },
        {
          name: 'be動詞の否定文',
          masterNumber: 2,
          order: 2,
          problems: [
            { customId: 'E-4', question: 'I ( ) not a doctor.', answer: 'am', order: 1 },
            { customId: 'E-5', question: 'She ( ) not happy.', answer: 'is', order: 2 },
          ],
        },
        {
          name: '一般動詞の肯定文',
          masterNumber: 3,
          order: 3,
          problems: [
            { customId: 'E-6', question: 'I ( ) tennis.', answer: 'play', order: 1 },
            { customId: 'E-7', question: 'He ( ) soccer.', answer: 'plays', order: 2 },
          ],
        },
      ],
    },
    {
      name: '数学',
      order: 2,
      coreProblems: [
        {
          name: '一次方程式',
          masterNumber: 1,
          order: 1,
          problems: [
            { customId: 'M-1', question: 'x + 3 = 7 のとき x = ?', answer: '4', order: 1 },
            { customId: 'M-2', question: '2x = 10 のとき x = ?', answer: '5', order: 2 },
          ],
        },
      ],
    },
    {
      name: '国語',
      order: 3,
      coreProblems: [
        {
          name: '漢字の読み',
          masterNumber: 1,
          order: 1,
          problems: [
            { customId: 'J-1', question: '「挑戦」の読み方は？', answer: 'ちょうせん', order: 1 },
            { customId: 'J-2', question: '「努力」の読み方は？', answer: 'どりょく', order: 2 },
          ],
        },
      ],
    },
  ];

  for (const subject of subjects) {
    const subjectRecord = await prisma.subject.upsert({
      where: { name: subject.name },
      update: { order: subject.order },
      create: { name: subject.name, order: subject.order },
    });

    for (const coreProblem of subject.coreProblems) {
      const coreProblemRecord = await upsertCoreProblem(subjectRecord.id, coreProblem);

      for (const problem of coreProblem.problems) {
        await upsertProblem(subjectRecord.id, coreProblemRecord.id, problem);
      }
    }
  }
}

async function seedAchievements() {
  const achievements = [
    {
      slug: 'streak-3',
      name: '三日坊主卒業',
      description: '3日間連続で学習しました',
      icon: 'seedling',
      xpReward: 100,
    },
    {
      slug: 'streak-7',
      name: '1週間継続',
      description: '7日間連続で学習しました',
      icon: 'fire',
      xpReward: 300,
    },
    {
      slug: 'streak-14',
      name: '2週間継続',
      description: '14日間連続で学習しました',
      icon: 'fire-blue',
      xpReward: 500,
    },
    {
      slug: 'streak-30',
      name: '1ヶ月継続',
      description: '30日間連続で学習しました',
      icon: 'fire-gold',
      xpReward: 1000,
    },
    {
      slug: 'streak-100',
      name: '百日修行',
      description: '100日間連続で学習しました',
      icon: 'crown',
      xpReward: 5000,
    },
    {
      slug: 'streak-365',
      name: '1年間継続',
      description: '365日間連続で学習しました',
      icon: 'trophy',
      xpReward: 10000,
    },
    {
      slug: 'solve-10',
      name: 'はじめの一歩',
      description: '累計10問学習しました',
      icon: 'footprint',
      xpReward: 50,
    },
    {
      slug: 'solve-100',
      name: '努力家',
      description: '累計100問学習しました',
      icon: 'star-bronze',
      xpReward: 500,
    },
    {
      slug: 'solve-500',
      name: '知識の泉',
      description: '累計500問学習しました',
      icon: 'star-silver',
      xpReward: 2000,
    },
    {
      slug: 'solve-1000',
      name: 'マスターへの道',
      description: '累計1000問学習しました',
      icon: 'star-gold',
      xpReward: 5000,
    },
    {
      slug: 'solve-5000',
      name: '伝説の学習者',
      description: '累計5000問学習しました',
      icon: 'trophy',
      xpReward: 10000,
    },
    {
      slug: 'perfect-1',
      name: 'パーフェクト',
      description: '1回の学習で全問正解しました',
      icon: 'target',
      xpReward: 100,
    },
    {
      slug: 'perfect-10',
      name: 'パーフェクトマスター',
      description: '10回全問正解を達成しました',
      icon: 'bullseye',
      xpReward: 1000,
    },
    {
      slug: 'core-unlock-english',
      name: '英語マスター',
      description: '英語のすべての単元を解放しました',
      icon: 'book-open',
      xpReward: 3000,
    },
    {
      slug: 'core-unlock-math',
      name: '数学マスター',
      description: '数学のすべての単元を解放しました',
      icon: 'calculator',
      xpReward: 3000,
    },
    {
      slug: 'video-1',
      name: '初めての発見',
      description: '解説動画を初めて視聴しました',
      icon: 'play-circle',
      xpReward: 50,
    },
    {
      slug: 'video-10',
      name: '熱心な視聴者',
      description: '解説動画を10回視聴しました',
      icon: 'film',
      xpReward: 300,
    },
    {
      slug: 'video-50',
      name: '動画学習マスター',
      description: '解説動画を50回視聴しました',
      icon: 'video',
      xpReward: 1000,
    },
    {
      slug: 'video-100',
      name: '知識の探求者',
      description: '解説動画を100回視聴しました',
      icon: 'monitor-play',
      xpReward: 2000,
    },
    {
      slug: 'review-1',
      name: '復習の第一歩',
      description: '間違えた問題の解説動画を全て視聴しました（1回達成）',
      icon: 'check-circle',
      xpReward: 100,
    },
    {
      slug: 'review-10',
      name: '復習の習慣',
      description: '間違えた問題の解説動画を全て視聴しました（10回達成）',
      icon: 'clipboard-check',
      xpReward: 500,
    },
    {
      slug: 'review-50',
      name: '復習マスター',
      description: '間違えた問題の解説動画を全て視聴しました（50回達成）',
      icon: 'medal',
      xpReward: 2000,
    },
    {
      slug: 'review-100',
      name: '完璧主義',
      description: '間違えた問題の解説動画を全て視聴しました（100回達成）',
      icon: 'shield-check',
      xpReward: 5000,
    },
  ];

  for (const achievement of achievements) {
    await prisma.achievement.upsert({
      where: { slug: achievement.slug },
      update: achievement,
      create: achievement,
    });
  }
}

async function main() {
  console.log('Start seeding...');
  await seedUsers();
  await seedCurriculum();
  await seedAchievements();
  console.log('Seeding finished.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
