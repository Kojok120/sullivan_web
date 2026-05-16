import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, CheckCircle } from 'lucide-react';

export default async function AchievementsPage() {
    const session = await getSession();
    if (!session) redirect('/login');
    const t = await getTranslations('Achievements');

    // Fetch all achievements
    const allAchievements = await prisma.achievement.findMany({
        where: { isHidden: false },
        orderBy: { xpReward: 'asc' }
    });

    // Fetch user's unlocked achievements
    const userAchievements = await prisma.userAchievement.findMany({
        where: { userId: session.userId },
        select: { achievementId: true, unlockedAt: true }
    });

    const unlockedIds = new Set(userAchievements.map(ua => ua.achievementId));
    const unlockedMap = new Map(userAchievements.map(ua => [ua.achievementId, ua.unlockedAt]));

    return (
        <div className="container mx-auto py-8 px-4">
            <h1 className="text-3xl font-bold mb-8 flex items-center gap-2">
                <Trophy className="h-8 w-8 text-yellow-500" />
                {t('title')}
            </h1>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {allAchievements.map((achievement) => {
                    const isUnlocked = unlockedIds.has(achievement.id);
                    const unlockedAt = unlockedMap.get(achievement.id);

                    return (
                        <Card key={achievement.id} className={`relative overflow-hidden ${isUnlocked ? 'border-yellow-200 bg-yellow-50/30' : 'opacity-70 grayscale bg-muted'}`}>
                            {isUnlocked && (
                                <div className="absolute top-2 right-2">
                                    <CheckCircle className="h-6 w-6 text-yellow-500" />
                                </div>
                            )}
                            <CardHeader className="pb-2">
                                <div className="flex justify-between items-start">
                                    <div className="p-2 rounded-full bg-background border">
                                        {/* Icon placeholder - in real app, map icon string to Lucide icon */}
                                        <Trophy className={`h-6 w-6 ${isUnlocked ? 'text-yellow-500' : 'text-muted-foreground'}`} />
                                    </div>
                                    <Badge variant={isUnlocked ? "default" : "outline"}>
                                        {achievement.xpReward} XP
                                    </Badge>
                                </div>
                                <CardTitle className="mt-4">{achievement.name}</CardTitle>
                                <CardDescription>{achievement.description}</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="text-xs text-muted-foreground mt-2">
                                    {isUnlocked && unlockedAt
                                        ? t('unlockedAt', { date: unlockedAt.toLocaleDateString() })
                                        : t('locked')}
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}
