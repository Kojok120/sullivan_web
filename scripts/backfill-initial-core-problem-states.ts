import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { ensureInitialCoreProblemStates, getEntryCoreProblemIds } from '../src/lib/core-problem-entry-state';

const USER_BATCH_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        batches.push(items.slice(i, i + size));
    }
    return batches;
}

async function main() {
    const isDryRun = process.argv.includes('--dry-run');

    const students = await prisma.user.findMany({
        where: { role: 'STUDENT' },
        select: { id: true, loginId: true },
        orderBy: { createdAt: 'asc' },
    });

    const entryCoreProblemIds = await getEntryCoreProblemIds();

    console.log(`対象生徒数: ${students.length}`);
    console.log(`教科ごとの初回CoreProblem数: ${entryCoreProblemIds.length}`);
    console.log(`モード: ${isDryRun ? 'DRY-RUN' : 'APPLY'}`);

    if (students.length === 0 || entryCoreProblemIds.length === 0) {
        console.log('処理対象がないため終了します。');
        return;
    }

    const existingCountByUser = new Map<string, number>();
    const studentIdBatches = chunk(students.map((student) => student.id), USER_BATCH_SIZE);

    for (const batchIds of studentIdBatches) {
        const batchStates = await prisma.userCoreProblemState.findMany({
            where: {
                userId: { in: batchIds },
                coreProblemId: { in: entryCoreProblemIds },
            },
            select: {
                userId: true,
            },
        });

        for (const state of batchStates) {
            existingCountByUser.set(state.userId, (existingCountByUser.get(state.userId) ?? 0) + 1);
        }
    }

    const expectedPerUser = entryCoreProblemIds.length;
    const missingUsers = students.filter((student) => (existingCountByUser.get(student.id) ?? 0) < expectedPerUser);

    console.log(`不足状態ありの生徒数: ${missingUsers.length}`);

    if (isDryRun) {
        console.log('--- DRY-RUN 結果（先頭20件） ---');
        for (const student of missingUsers.slice(0, 20)) {
            const existing = existingCountByUser.get(student.id) ?? 0;
            const missing = expectedPerUser - existing;
            console.log(`${student.loginId}: existing=${existing}, missing=${missing}`);
        }
        if (missingUsers.length > 20) {
            console.log(`... ほか ${missingUsers.length - 20} 件`);
        }
        return;
    }

    let totalCreated = 0;
    for (const student of missingUsers) {
        const result = await ensureInitialCoreProblemStates(student.id);
        totalCreated += result.createdCount;
        console.log(`${student.loginId}: created=${result.createdCount}, target=${result.targetCount}`);
    }

    console.log('--- 完了 ---');
    console.log(`作成レコード数: ${totalCreated}`);
}

main()
    .catch((error) => {
        console.error('バックフィル処理に失敗しました:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
