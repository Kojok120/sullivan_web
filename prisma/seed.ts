import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Role, ClassroomPlan } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { deriveLegacyFieldsFromStructuredData } from '../src/lib/structured-problem';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL が設定されていません');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: databaseUrl,
  }),
});

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

  const existing = await findSupabaseAuthUserByEmail(email);
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

async function findSupabaseAuthUserByEmail(email: string) {
  if (!supabaseAdmin) return null;

  const perPage = 200;
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      console.warn(`Supabase listUsers failed for ${email}:`, error.message);
      return null;
    }

    const matched = data.users.find((user) => user.email === email);
    if (matched) {
      return matched;
    }

    if (data.users.length < perPage) {
      return null;
    }
  }

  return null;
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
    {
      loginId: 'A9001',
      name: 'Dev Admin',
      role: Role.ADMIN,
    },
    {
      loginId: 'M0001',
      name: 'Material Author',
      role: Role.MATERIAL_AUTHOR,
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

function getLegacySeedCustomId(customId: string) {
  if (customId.startsWith('N-')) {
    return `J-${customId.slice(2)}`;
  }

  return null;
}

async function migrateSeedProblemCustomId(subjectId: string, customId: string) {
  const legacyCustomId = getLegacySeedCustomId(customId);
  if (!legacyCustomId) {
    return;
  }

  const existing = await prisma.problem.findUnique({
    where: {
      subjectId_customId: {
        subjectId,
        customId,
      },
    },
    select: { id: true },
  });

  if (existing) {
    return;
  }

  const legacy = await prisma.problem.findUnique({
    where: {
      subjectId_customId: {
        subjectId,
        customId: legacyCustomId,
      },
    },
    select: { id: true },
  });

  if (!legacy) {
    return;
  }

  await prisma.problem.update({
    where: { id: legacy.id },
    data: { customId },
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
            { customId: 'N-1', question: '「挑戦」の読み方は？', answer: 'ちょうせん', order: 1 },
            { customId: 'N-2', question: '「努力」の読み方は？', answer: 'どりょく', order: 2 },
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
        await migrateSeedProblemCustomId(subjectRecord.id, problem.customId);
        await upsertProblem(subjectRecord.id, coreProblemRecord.id, problem);
      }
    }
  }
}

async function seedStructuredProblemSamples() {
  const publishedAt = new Date('2026-04-01T00:00:00Z');

  const samples = [
    {
      subject: { name: '数学', order: 2 },
      coreProblem: { name: '図形', masterNumber: 2, order: 2 },
      problem: {
        customId: 'M-101',
        masterNumber: 101,
        grade: '中2',
        problemType: 'GEOMETRY',
        authoringTool: 'GEOGEBRA',
        document: {
          version: 1,
          title: '三角形の面積',
          summary: '図の三角形ABCの面積を求める。',
          instructions: '必要なら計算も余白に書いてよい。',
          blocks: [
            { id: 'geo-1', type: 'paragraph', text: '底辺 8cm、高さ 5cm の三角形ABCの面積を求めなさい。' },
            { id: 'geo-2', type: 'svg', assetId: 'math-geometry-svg', caption: '図1' },
            { id: 'geo-3', type: 'answerLines', lines: 3 },
          ],
        },
        answerSpec: {
          correctAnswer: '20cm^2',
          acceptedAnswers: ['20', '20 cm^2', '20cm2'],
        },
        printConfig: {
          template: 'WORKSPACE',
          estimatedHeight: 'MEDIUM',
          answerMode: 'INLINE',
          answerLines: 3,
          showQrOnFirstPage: true,
        },
        assets: [
          {
            kind: 'SVG',
            fileName: 'triangle-area.svg',
            mimeType: 'image/svg+xml',
            inlineContent: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 220"><rect width="320" height="220" fill="#fff"/><path d="M40 180 L260 180 L120 40 Z" fill="none" stroke="#111827" stroke-width="3"/><line x1="120" y1="40" x2="120" y2="180" stroke="#ef4444" stroke-width="2" stroke-dasharray="6 4"/><text x="140" y="118" font-size="18" fill="#ef4444">5 cm</text><text x="136" y="202" font-size="18" fill="#111827">8 cm</text><text x="28" y="192" font-size="18" fill="#111827">A</text><text x="264" y="192" font-size="18" fill="#111827">B</text><text x="114" y="32" font-size="18" fill="#111827">C</text></svg>`,
          },
        ],
      },
    },
    {
      subject: { name: '数学', order: 2 },
      coreProblem: { name: '二次関数', masterNumber: 3, order: 3 },
      problem: {
        customId: 'M-102',
        masterNumber: 102,
        grade: '中3',
        problemType: 'GRAPH_DRAW',
        authoringTool: 'GEOGEBRA',
        document: {
          version: 1,
          title: '二次関数のグラフ',
          summary: '放物線の頂点と切片を読み取る。',
          instructions: 'グラフを見て答えなさい。',
          blocks: [
            { id: 'quad-1', type: 'paragraph', text: '二次関数 y = x^2 - 4x + 3 のグラフについて、頂点の座標を答えなさい。' },
            { id: 'quad-2', type: 'katexDisplay', latex: 'y = x^2 - 4x + 3' },
            { id: 'quad-3', type: 'graphAsset', assetId: 'math-quadratic-svg', caption: '図2' },
          ],
        },
        answerSpec: {
          correctAnswer: '(2, -1)',
          acceptedAnswers: ['(2,-1)', 'x=2,y=-1'],
        },
        printConfig: {
          template: 'GRAPH',
          estimatedHeight: 'LARGE',
          answerMode: 'INLINE',
          answerLines: 2,
          showQrOnFirstPage: true,
        },
        assets: [
          {
            kind: 'SVG',
            fileName: 'quadratic-graph.svg',
            mimeType: 'image/svg+xml',
            inlineContent: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240"><rect width="320" height="240" fill="#fff"/><g stroke="#d1d5db" stroke-width="1">${Array.from({length: 11}).map((_,i)=>`<line x1="${20+i*28}" y1="20" x2="${20+i*28}" y2="220"/><line x1="20" y1="${20+i*20}" x2="300" y2="${20+i*20}"/>`).join('')}</g><line x1="20" y1="120" x2="300" y2="120" stroke="#111827" stroke-width="2"/><line x1="160" y1="20" x2="160" y2="220" stroke="#111827" stroke-width="2"/><path d="M76 180 C120 80 132 60 160 60 C188 60 200 80 244 180" fill="none" stroke="#2563eb" stroke-width="3"/><circle cx="160" cy="60" r="4" fill="#ef4444"/><text x="170" y="56" font-size="16" fill="#ef4444">(2,-1)</text></svg>`,
          },
        ],
      },
    },
    {
      subject: { name: '理科', order: 4 },
      coreProblem: { name: '電流と回路', masterNumber: 1, order: 1 },
      problem: {
        customId: 'S-101',
        masterNumber: 101,
        grade: '中2',
        problemType: 'SHORT_TEXT',
        authoringTool: 'SVG',
        document: {
          version: 1,
          title: '回路図の読み取り',
          summary: '並列回路と直列回路の違いを読み取る。',
          instructions: '図を見て答えなさい。',
          blocks: [
            { id: 'circuit-1', type: 'paragraph', text: '図の回路で、スイッチを入れたときに豆電球AとBはどのように点灯するか。「直列」または「並列」で答えなさい。' },
            { id: 'circuit-2', type: 'svg', assetId: 'science-circuit-svg', caption: '図3' },
          ],
        },
        answerSpec: {
          correctAnswer: '並列',
          acceptedAnswers: [],
        },
        printConfig: {
          template: 'STANDARD',
          estimatedHeight: 'MEDIUM',
          answerMode: 'INLINE',
          answerLines: 2,
          showQrOnFirstPage: true,
        },
        assets: [
          {
            kind: 'SVG',
            fileName: 'circuit.svg',
            mimeType: 'image/svg+xml',
            inlineContent: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><rect width="320" height="200" fill="#fff"/><path d="M30 100 H90 V50 H230 V100 H290" fill="none" stroke="#111827" stroke-width="3"/><path d="M90 100 V150 H230 V100" fill="none" stroke="#111827" stroke-width="3"/><circle cx="120" cy="50" r="18" fill="none" stroke="#111827" stroke-width="3"/><circle cx="200" cy="150" r="18" fill="none" stroke="#111827" stroke-width="3"/><text x="114" y="56" font-size="16">A</text><text x="194" y="156" font-size="16">B</text><rect x="145" y="36" width="30" height="28" fill="none" stroke="#111827" stroke-width="3"/><line x1="30" y1="88" x2="30" y2="112" stroke="#111827" stroke-width="3"/><line x1="290" y1="88" x2="290" y2="112" stroke="#111827" stroke-width="3"/></svg>`,
          },
        ],
      },
    },
    {
      subject: { name: '理科', order: 4 },
      coreProblem: { name: '実験とグラフ', masterNumber: 2, order: 2 },
      problem: {
        customId: 'S-102',
        masterNumber: 102,
        grade: '中1',
        problemType: 'GRAPH_DRAW',
        authoringTool: 'SVG',
        document: {
          version: 1,
          title: '実験グラフの読解',
          summary: '温度変化のグラフから読み取る。',
          instructions: 'グラフを見て答えなさい。',
          blocks: [
            { id: 'exp-1', type: 'paragraph', text: '水を加熱したときの温度変化を表すグラフで、沸騰が始まったのは何分後か答えなさい。' },
            { id: 'exp-2', type: 'graphAsset', assetId: 'science-graph-svg', caption: '図4' },
          ],
        },
        answerSpec: {
          correctAnswer: '6',
          acceptedAnswers: ['6分'],
        },
        printConfig: {
          template: 'GRAPH',
          estimatedHeight: 'LARGE',
          answerMode: 'INLINE',
          answerLines: 2,
          showQrOnFirstPage: true,
        },
        assets: [
          {
            kind: 'SVG',
            fileName: 'experiment-graph.svg',
            mimeType: 'image/svg+xml',
            inlineContent: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 220"><rect width="320" height="220" fill="#fff"/><g stroke="#d1d5db" stroke-width="1">${Array.from({length: 11}).map((_,i)=>`<line x1="${40+i*24}" y1="20" x2="${40+i*24}" y2="190"/><line x1="40" y1="${20+i*17}" x2="280" y2="${20+i*17}"/>`).join('')}</g><line x1="40" y1="190" x2="280" y2="190" stroke="#111827" stroke-width="2"/><line x1="40" y1="190" x2="40" y2="20" stroke="#111827" stroke-width="2"/><path d="M40 180 L88 150 L136 118 L184 70 L232 70 L280 70" fill="none" stroke="#dc2626" stroke-width="3"/><text x="246" y="62" font-size="14" fill="#dc2626">沸騰</text><text x="265" y="206" font-size="14">分</text><text x="16" y="22" font-size="14">℃</text></svg>`,
          },
        ],
      },
    },
    {
      subject: { name: '理科', order: 4 },
      coreProblem: { name: '考察', masterNumber: 3, order: 3 },
      problem: {
        customId: 'S-103',
        masterNumber: 103,
        grade: '中3',
        problemType: 'SHORT_TEXT',
        authoringTool: 'MANUAL',
        document: {
          version: 1,
          title: '蒸散の考察',
          summary: '植物の蒸散の役割を説明する。',
          instructions: '2〜3文で簡潔に説明しなさい。',
          blocks: [
            { id: 'essay-1', type: 'paragraph', text: '植物が蒸散を行う理由を、体内の水の移動という観点から説明しなさい。' },
            { id: 'essay-2', type: 'answerLines', lines: 6 },
          ],
        },
        answerSpec: {
          correctAnswer: '蒸散によって葉から水が失われると、根から水を吸い上げる力がはたらき、体内で水や無機養分が運ばれやすくなる。',
          acceptedAnswers: [],
        },
        printConfig: {
          template: 'EXPLANATION',
          estimatedHeight: 'LARGE',
          answerMode: 'INLINE',
          answerLines: 6,
          showQrOnFirstPage: true,
        },
        assets: [],
      },
    },
  ];

  for (const sample of samples) {
    const subject = await prisma.subject.upsert({
      where: { name: sample.subject.name },
      update: { order: sample.subject.order },
      create: { name: sample.subject.name, order: sample.subject.order },
    });

    const coreProblem = await upsertCoreProblem(subject.id, {
      ...sample.coreProblem,
      problems: [],
    });

    const legacy = deriveLegacyFieldsFromStructuredData({
      document: sample.problem.document as never,
      answerSpec: sample.problem.answerSpec as never,
    });

    const problem = await prisma.problem.upsert({
      where: {
        subjectId_customId: {
          subjectId: subject.id,
          customId: sample.problem.customId,
        },
      },
      update: {
        question: legacy.question,
        answer: legacy.answer,
        acceptedAnswers: legacy.acceptedAnswers,
        grade: sample.problem.grade,
        masterNumber: sample.problem.masterNumber,
        subjectId: subject.id,
        problemType: sample.problem.problemType as never,
        contentFormat: 'STRUCTURED_V1' as never,
        status: 'PUBLISHED' as never,
        hasStructuredContent: true,
        coreProblems: { set: [{ id: coreProblem.id }] },
      },
      create: {
        subjectId: subject.id,
        customId: sample.problem.customId,
        question: legacy.question,
        answer: legacy.answer,
        acceptedAnswers: legacy.acceptedAnswers,
        grade: sample.problem.grade,
        masterNumber: sample.problem.masterNumber,
        order: sample.problem.masterNumber,
        problemType: sample.problem.problemType as never,
        contentFormat: 'STRUCTURED_V1' as never,
        status: 'PUBLISHED' as never,
        hasStructuredContent: true,
        coreProblems: { connect: [{ id: coreProblem.id }] },
      },
    });

    const revision = await prisma.problemRevision.upsert({
      where: {
        problemId_revisionNumber: {
          problemId: problem.id,
          revisionNumber: 1,
        },
      },
      update: {
        status: 'PUBLISHED',
        structuredContent: sample.problem.document as never,
        answerSpec: sample.problem.answerSpec as never,
        printConfig: sample.problem.printConfig as never,
        authoringTool: sample.problem.authoringTool as never,
        publishedAt,
        assets: {
          deleteMany: {},
          create: sample.problem.assets.map((asset) => ({
            kind: asset.kind as never,
            fileName: asset.fileName,
            mimeType: asset.mimeType,
            inlineContent: asset.inlineContent,
            sourceTool: sample.problem.authoringTool as never,
          })),
        },
      },
      create: {
        problemId: problem.id,
        revisionNumber: 1,
        status: 'PUBLISHED',
        structuredContent: sample.problem.document as never,
        answerSpec: sample.problem.answerSpec as never,
        printConfig: sample.problem.printConfig as never,
        authoringTool: sample.problem.authoringTool as never,
        publishedAt,
        assets: {
          create: sample.problem.assets.map((asset) => ({
            kind: asset.kind as never,
            fileName: asset.fileName,
            mimeType: asset.mimeType,
            inlineContent: asset.inlineContent,
            sourceTool: sample.problem.authoringTool as never,
          })),
        },
      },
    });

    await prisma.problem.update({
      where: { id: problem.id },
      data: { publishedRevisionId: revision.id },
    });
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
  await seedStructuredProblemSamples();
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
