"use client";

import { LearningSession } from '@/lib/analytics';
import Link from 'next/link';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, BookOpen } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { useState } from 'react';
import { fetchMySessions, markSessionReviewed } from '@/app/actions';
import { DateDisplay } from '@/components/ui/date-display';
import { Badge } from "@/components/ui/badge";

export function SessionListClient({ initialSessions }: { initialSessions: LearningSession[] }) {
    const [sessions, setSessions] = useState<LearningSession[]>(initialSessions);
    const [offset, setOffset] = useState(initialSessions.length);
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);

    const loadMore = async () => {
        setLoading(true);
        try {
            const newSessions = await fetchMySessions(offset, 10);
            if (newSessions.length === 0) {
                setHasMore(false);
            } else {
                setSessions([...sessions, ...newSessions]);
                setOffset(offset + newSessions.length);
                if (newSessions.length < 10) {
                    setHasMore(false);
                }
            }
        } catch (error) {
            console.error("Failed to load sessions", error);
        } finally {
            setLoading(false);
        }
    };

    if (sessions.length === 0) {
        return <div className="text-muted-foreground text-sm">まだ学習履歴がありません</div>;
    }

    return (
        <div className="space-y-4">
            {sessions.map((session) => (
                <Link
                    key={session.groupId}
                    href={`/dashboard/history/${session.groupId}`}
                    onClick={() => {
                        // Optimistic update (optional, but good for UI responsiveness)
                        // Also trigger server action
                        markSessionReviewed(session.groupId);
                    }}
                >
                    <Card className={`hover:bg-accent/50 transition-colors cursor-pointer ${session.hasUnread ? 'border-primary/50 bg-primary/5' : ''}`}>
                        <CardHeader className="flex flex-row items-center justify-between p-4">
                            <div className="flex items-center space-x-4">
                                <div className="bg-primary/10 p-2 rounded-full relative">
                                    <BookOpen className="h-5 w-5 text-primary" />
                                    {session.hasUnread && (
                                        <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                                        </span>
                                    )}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <CardTitle className="text-base">
                                            {session.subjectName}
                                        </CardTitle>
                                        {session.hasUnread && (
                                            <Badge variant="destructive" className="text-[10px] h-5 px-1.5">NEW</Badge>
                                        )}
                                    </div>
                                    <div className="text-sm font-medium text-foreground/80 mt-0.5">
                                        {session.coreProblemName}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1">
                                        <DateDisplay date={session.date} showTime />
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

            {hasMore && (
                <div className="text-center pt-4">
                    <Button onClick={loadMore} disabled={loading} variant="outline" className="w-full md:w-auto">
                        {loading ? "読み込み中..." : "さらに読み込む"}
                    </Button>
                </div>
            )}
        </div>
    );
}
