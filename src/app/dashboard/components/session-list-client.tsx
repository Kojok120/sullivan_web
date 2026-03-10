"use client";

import { LearningSession } from '@/lib/analytics';
import Link from 'next/link';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, CheckCircle, AlertCircle, Filter } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { useRef, useState } from 'react';
import { fetchUserSessions } from '@/app/actions';
import { DateDisplay } from '@/components/ui/date-display';
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

type SessionListClientProps = {
    initialSessions: LearningSession[];
    userId: string;
    basePath: string;
};

export function SessionListClient({ initialSessions, userId, basePath }: SessionListClientProps) {
    // 初期表示は全件前提で受け取り、フィルタ変更時のみ再取得する。
    const [sessions, setSessions] = useState<LearningSession[]>(initialSessions);
    const [offset, setOffset] = useState(initialSessions.length);
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [showPendingVideoReviewOnly, setShowPendingVideoReviewOnly] = useState(false);
    const latestRequestIdRef = useRef(0);
    const latestFilterRef = useRef(false);

    const requestSessions = async ({
        onlyPendingVideoReview,
        nextOffset,
        append,
    }: {
        onlyPendingVideoReview: boolean;
        nextOffset: number;
        append: boolean;
    }) => {
        const requestId = latestRequestIdRef.current + 1;
        latestRequestIdRef.current = requestId;
        latestFilterRef.current = onlyPendingVideoReview;
        setLoading(true);
        try {
            const newSessions = await fetchUserSessions( nextOffset, 10, { onlyPendingVideoReview }, userId);

            if (
                requestId !== latestRequestIdRef.current
                || latestFilterRef.current !== onlyPendingVideoReview
            ) {
                return;
            }

            if (!append) {
                setSessions(newSessions);
                setOffset(newSessions.length);
                setHasMore(newSessions.length === 10);
                return;
            }

            if (newSessions.length === 0) {
                setHasMore(false);
                return;
            }

            setSessions((prev) => {
                const existingIds = new Set(prev.map(s => s.groupId));
                const filteredNew = newSessions.filter(s => !existingIds.has(s.groupId));
                return [...prev, ...filteredNew];
            });
            setOffset((prev) => prev + newSessions.length);
            if (newSessions.length < 10) {
                setHasMore(false);
            }
        } catch (error) {
            if (requestId === latestRequestIdRef.current) {
                console.error("Failed to load sessions", error);
            }
        } finally {
            if (requestId === latestRequestIdRef.current) {
                setLoading(false);
            }
        }
    };

    const handleFilterChange = (checked: boolean) => {
        setShowPendingVideoReviewOnly(checked);
        void requestSessions({
            onlyPendingVideoReview: checked,
            nextOffset: 0,
            append: false,
        });
    };

    const loadMore = async () => {
        void requestSessions({
            onlyPendingVideoReview: showPendingVideoReviewOnly,
            nextOffset: offset,
            append: true,
        });
    };

    if (sessions.length === 0 && !loading && !showPendingVideoReviewOnly) {
        return <div className="text-muted-foreground text-sm">まだ学習履歴がありません</div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-end space-x-2 pb-2">
                <Switch
                    id="pending-video-review-filter"
                    checked={showPendingVideoReviewOnly}
                    onCheckedChange={handleFilterChange}
                />
                <Label htmlFor="pending-video-review-filter" className="text-sm cursor-pointer flex items-center gap-1.5 font-medium text-muted-foreground">
                    <Filter className="h-4 w-4" />
                    解説動画未視聴のみ表示
                </Label>
            </div>

            {sessions.length === 0 && !loading && showPendingVideoReviewOnly && (
                <div className="text-muted-foreground text-sm py-8 text-center bg-gray-50 rounded-lg border border-dashed text-gray-400">
                    <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-400/50" />
                    解説動画未視聴のセッションはありません。<br />素晴らしい！
                </div>
            )}

            {sessions.map((session) => {
                const hasPendingVideoReview = session.unwatchedMistakeCount > 0;
                // 解説動画の未視聴がなければ完了扱いにする
                const isCompleted = !hasPendingVideoReview;

                return (
                    <Link
                        key={session.groupId}
                        href={`${basePath}/${session.groupId}`}
                    >
                        <Card className={`hover:bg-accent/50 transition-colors cursor-pointer border-2 
                            ${hasPendingVideoReview
                                ? 'border-red-500 bg-red-50 hover:bg-red-100' // 解説動画の未視聴が残っている状態
                                : 'border-blue-500 bg-blue-50 hover:bg-blue-100' // 復習完了または視聴済みの状態
                            }`}>
                            <CardHeader className="flex flex-row items-center justify-between p-4">
                                <div className="flex items-center space-x-4">
                                    <div className={`p-3 rounded-full relative ${hasPendingVideoReview ? 'bg-red-100' : 'bg-blue-100'}`}>
                                        {hasPendingVideoReview ? (
                                            <AlertCircle className="h-6 w-6 text-red-600" />
                                        ) : (
                                            <CheckCircle className="h-6 w-6 text-blue-600" />
                                        )}
                                        {/* カード全体の色で状態を表すため、個別バッジは置かない */}
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
                                        <div className="text-sm text-muted-foreground mt-1">
                                            <DateDisplay date={session.date} showTime />
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center space-x-4">
                                    <div className="text-right">
                                        <div className={`text-lg font-bold ${hasPendingVideoReview ? 'text-red-700' : 'text-blue-700'}`}>
                                            {session.correctCount} / {session.totalProblems} 問正解
                                        </div>
                                        {hasPendingVideoReview && (
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
