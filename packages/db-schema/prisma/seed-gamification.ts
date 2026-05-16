import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const achievements = [
        // Streaks (継続日数)
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

        // Solve Counts (累計問題数)
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

        // Perfect Streaks (全問正解) - New Category
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

        // Core Problem Unlocks (単元クリア)
        {
            slug: 'core-unlock-english',
            name: '英語マスター',
            description: '英語のすべての単元を解放しました',
            icon: 'book-open',
            xpReward: 3000
        },
        {
            slug: 'core-unlock-math',
            name: '数学マスター',
            description: '数学のすべての単元を解放しました',
            icon: 'calculator',
            xpReward: 3000
        },

        // Video Watch Counts (解説動画視聴)
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

        // Review Completion (復習完了)
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
        }
    ];

    console.log(`Seeding ${achievements.length} achievements...`);

    for (const achievement of achievements) {
        await prisma.achievement.upsert({
            where: { slug: achievement.slug },
            update: achievement,
            create: achievement,
        });
    }

    console.log('Seeded achievements successfully.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
