"use client";

import { LearningSession } from '@/lib/analytics';
import Link from 'next/link';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, CheckCircle, AlertCircle, Filter } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { useState, useCallback } from 'react';
import { fetchMySessions, markSessionReviewed } from '@/app/actions';
import { DateDisplay } from '@/components/ui/date-display';
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export function SessionListClient({ initialSessions }: { initialSessions: LearningSession[] }) {
    // Initial sessions are unfiltered.
    // If we want to filter from start, we might need to fetch again, 
    // but the default is usually "All".
    const [sessions, setSessions] = useState<LearningSession[]>(initialSessions);
    const [offset, setOffset] = useState(initialSessions.length);
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [showUnreviewedOnly, setShowUnreviewedOnly] = useState(false);

    // Function to reload sessions based on filter
    const reloadSessions = useCallback(async (filterUnreviewed: boolean) => {
        setLoading(true);
        try {
            // Reset offset and fetch first batch
            const newSessions = await fetchMySessions(0, 10, { onlyUnreviewed: filterUnreviewed });
            setSessions(newSessions);
            setOffset(newSessions.length);
            setHasMore(newSessions.length === 10);
        } catch (error) {
            console.error("Failed to load sessions", error);
        } finally {
            setLoading(false);
        }
    }, []);

    const handleFilterChange = (checked: boolean) => {
        setShowUnreviewedOnly(checked);
        reloadSessions(checked);
    };

    const loadMore = async () => {
        setLoading(true);
        try {
            const newSessions = await fetchMySessions(offset, 10, { onlyUnreviewed: showUnreviewedOnly });
            if (newSessions.length === 0) {
                setHasMore(false);
            } else {
                setSessions((prev) => {
                    const existingIds = new Set(prev.map(s => s.groupId));
                    const filteredNew = newSessions.filter(s => !existingIds.has(s.groupId));
                    return [...prev, ...filteredNew];
                });
                setOffset((prev) => prev + newSessions.length);
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

    if (sessions.length === 0 && !loading && !showUnreviewedOnly) {
        return <div className="text-muted-foreground text-sm">まだ学習履歴がありません</div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-end space-x-2 pb-2">
                <Switch
                    id="unreviewed-filter"
                    checked={showUnreviewedOnly}
                    onCheckedChange={handleFilterChange}
                />
                <Label htmlFor="unreviewed-filter" className="text-sm cursor-pointer flex items-center gap-1.5 font-medium text-muted-foreground">
                    <Filter className="h-4 w-4" />
                    未復習のみ表示
                </Label>
            </div>

            {sessions.length === 0 && !loading && showUnreviewedOnly && (
                <div className="text-muted-foreground text-sm py-8 text-center bg-gray-50 rounded-lg border border-dashed text-gray-400">
                    <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-400/50" />
                    未復習のセッションはありません。<br />素晴らしい！
                </div>
            )}

            {sessions.map((session) => {
                const unreviewedMistakes = session.unwatchedMistakeCount > 0;
                // Blue/Check condition: No unreviewed mistakes (either perfect or all videos watched)
                const isCompleted = !unreviewedMistakes;

                return (
                    <Link
                        key={session.groupId}
                        href={`/dashboard/history/${session.groupId}`}
                        onClick={() => {
                            // Only mark as reviewed if it's a simple "read" check, 
                            // but for video watching, the status update happens when video is watched.
                            // However, we still might want to track "clicked to view details"
                            markSessionReviewed(session.groupId);
                        }}
                    >
                        <Card className={`hover:bg-accent/50 transition-colors cursor-pointer border-2 
                            ${unreviewedMistakes
                                ? 'border-red-500 bg-red-50 hover:bg-red-100' // Red for unreviewed mistakes
                                : 'border-blue-500 bg-blue-50 hover:bg-blue-100' // Blue for completed/reviewed
                            }`}>
                            <CardHeader className="flex flex-row items-center justify-between p-4">
                                <div className="flex items-center space-x-4">
                                    <div className={`p-3 rounded-full relative ${unreviewedMistakes ? 'bg-red-100' : 'bg-blue-100'}`}>
                                        {unreviewedMistakes ? (
                                            <AlertCircle className="h-6 w-6 text-red-600" />
                                        ) : (
                                            <CheckCircle className="h-6 w-6 text-blue-600" />
                                        )}
                                        {/* Status Badge/Indicator logic can be simplified since the whole card is colored now */}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <CardTitle className="text-lg">
                                                {session.subjectName}
                                            </CardTitle>
                                            {session.hasUnread && (
                                                <Badge className="bg-orange-500 hover:bg-orange-600 text-[10px] h-5 px-1.5">NEW</Badge>
                                            )}
                                        </div>
                                        <div className="text-md font-medium text-foreground/90 mt-0.5">
                                            {session.coreProblemName}
                                        </div>
                                        <div className="text-sm text-muted-foreground mt-1">
                                            <DateDisplay date={session.date} showTime />
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center space-x-4">
                                    <div className="text-right">
                                        <div className={`text-lg font-bold ${unreviewedMistakes ? 'text-red-700' : 'text-blue-700'}`}>
                                            {session.correctCount} / {session.totalProblems} 問正解
                                        </div>
                                        {unreviewedMistakes && (
                                            <div className="text-xs text-red-600 font-bold">
                                                解説動画未視聴: {session.unwatchedMistakeCount}
                                            </div>
                                        )}
                                        {isCompleted && session.correctCount < session.totalProblems && (
                                            <div className="text-xs text-blue-600 font-bold">
                                                復習完了！
                                            </div>
                                        )}
                                        {isCompleted && session.correctCount === session.totalProblems && (
                                            <div className="text-xs text-blue-600 font-bold">
                                                全問正解！
                                            </div>
                                        )}
                                    </div>
                                    <ArrowRight className="h-5 w-5 text-muted-foreground" />
                                </div>
                            </CardHeader>
                        </Card>
                    </Link>
                );
            })}

            {hasMore && sessions.length > 0 && (
                <div className="text-center pt-4">
                    <Button onClick={loadMore} disabled={loading} variant="outline" className="w-full md:w-auto">
                        {loading ? "読み込み中..." : "さらに読み込む"}
                    </Button>
                </div>
            )}
        </div>
    );
}
