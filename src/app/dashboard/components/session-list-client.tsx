"use client";

import { LearningSession } from '@/lib/analytics';
import Link from 'next/link';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, BookOpen } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { useState } from 'react';
import { fetchMySessions } from '@/app/actions';

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
                                        {new Date(session.date).toLocaleDateString('ja-JP')} • {new Date(session.date).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
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
