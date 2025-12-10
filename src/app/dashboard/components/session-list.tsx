
import { getLearningSessions } from '@/lib/analytics';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ArrowRight, BookOpen } from 'lucide-react';

export async function SessionList({ userId }: { userId: string }) {
    const sessions = await getLearningSessions(userId, 5); // Latest 5

    if (sessions.length === 0) {
        return <div className="text-muted-foreground text-sm">まだ学習履歴がありません</div>;
    }

    return (
        <div className="space-y-4">
            {sessions.map((session) => (
                <Link key={session.groupId} href={`/dashboard/history/${session.groupId}`}>
                    <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                        <CardHeader className="flex flex-row items-center justify-between p-4">
                            <div className="flex items-center space-x-4">
                                <div className="bg-primary/10 p-2 rounded-full">
                                    <BookOpen className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                    <CardTitle className="text-base">
                                        {session.subjectName}
                                    </CardTitle>
                                    <div className="text-sm text-muted-foreground">
                                        {session.date.toLocaleDateString('ja-JP')} • {session.date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center space-x-4">
                                <div className="text-right">
                                    <div className="text-sm font-medium">
                                        {session.correctCount} / {session.totalProblems} 問正解
                                    </div>
                                </div>
                                <ArrowRight className="h-5 w-5 text-muted-foreground" />
                            </div>
                        </CardHeader>
                    </Card>
                </Link>
            ))}
        </div>
    );
}
