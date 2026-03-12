'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Minus, Plus, Printer } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { FullScreenVideoPlayer } from '@/components/full-screen-video-player';
import { appendCacheBust } from '@/components/print/cache-bust';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { markLectureAsWatched } from '@/lib/api/lecture-watched-client';
import type { LectureVideo } from '@/lib/lecture-videos';
import { getSubjectConfig } from '@/lib/subject-config';
import { cn } from '@/lib/utils';
import { getEmbedUrl } from '@/lib/youtube';

interface PrintSubject {
    subjectId: string;
    subjectName: string;
    // progressPercentage は表示ロジックでは未使用だが、上位互換のため許容する
    progressPercentage?: number;
}

interface PrintSelectorProps {
    subjects: PrintSubject[];
}

type PrintGateResponse = {
    blocked: boolean;
    coreProblemId?: string;
    coreProblemName?: string;
    lectureVideos?: LectureVideo[];
};

type GateModalState = {
    coreProblemId?: string;
    coreProblemName?: string;
    subjectId: string;
    sets: number;
    lectureVideos: LectureVideo[];
};

export function PrintSelector({ subjects }: PrintSelectorProps) {
    const router = useRouter();
    const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
    const [sets, setSets] = useState(1);
    const [isCheckingGate, setIsCheckingGate] = useState(false);
    const [gateModal, setGateModal] = useState<GateModalState | null>(null);
    const [gateErrorMessage, setGateErrorMessage] = useState<string | null>(null);
    const [gateWatchErrorMessage, setGateWatchErrorMessage] = useState<string | null>(null);
    const [isGateVideoOpen, setIsGateVideoOpen] = useState(false);
    const [isSubmittingWatch, setIsSubmittingWatch] = useState(false);
    const printControlRef = useRef<HTMLDivElement | null>(null);
    const watchedVideoIndicesRef = useRef<Set<number>>(new Set());
    const isInteractionLocked = isCheckingGate || isSubmittingWatch;

    const getSubjectStyle = (name: string) => {
        const config = getSubjectConfig(name);
        return { color: config.bgColor, label: config.letter, full: config.fullName };
    };

    const incrementSets = () => {
        if (isInteractionLocked) return;
        setSets((prev) => Math.min(prev + 1, 10));
    };

    const decrementSets = () => {
        if (isInteractionLocked) return;
        setSets((prev) => Math.max(prev - 1, 1));
    };

    const resetGatePlaybackState = () => {
        setIsGateVideoOpen(false);
        setIsSubmittingWatch(false);
        setGateWatchErrorMessage(null);
        watchedVideoIndicesRef.current = new Set();
    };

    const closeGateModal = (force = false) => {
        if (isSubmittingWatch && !force) return;
        setGateModal(null);
        resetGatePlaybackState();
    };

    const handleSubjectClick = (id: string) => {
        if (isInteractionLocked) return;
        setGateErrorMessage(null);
        if (selectedSubjectId === id) {
            incrementSets();
        } else {
            setSelectedSubjectId(id);
            setSets(1);
        }
    };

    const handlePrint = async () => {
        if (!selectedSubjectId || isCheckingGate || isSubmittingWatch) return;

        const params = new URLSearchParams({
            subjectId: selectedSubjectId,
            sets: String(sets),
            gateChecked: '1',
        });
        const printUrl = appendCacheBust(`/dashboard/print?${params.toString()}`);
        const previewTab = window.open('', '_blank');
        setIsCheckingGate(true);
        setGateErrorMessage(null);
        try {
            const response = await fetch(`/api/print-gate?subjectId=${encodeURIComponent(selectedSubjectId)}`, {
                method: 'GET',
                cache: 'no-store',
            });

            if (!response.ok) {
                if (previewTab && !previewTab.closed) {
                    previewTab.close();
                }
                console.error(`印刷ゲート判定に失敗しました: ${response.status}`);
                setGateErrorMessage('印刷可否の確認に失敗しました。通信状態を確認して、もう一度お試しください。');
                return;
            }

            const gate = (await response.json()) as PrintGateResponse;
            if (gate.blocked) {
                if (previewTab && !previewTab.closed) {
                    previewTab.close();
                }
                resetGatePlaybackState();
                setGateModal({
                    coreProblemId: gate.coreProblemId,
                    coreProblemName: gate.coreProblemName,
                    subjectId: selectedSubjectId,
                    sets,
                    lectureVideos: gate.lectureVideos ?? [],
                });
                return;
            }

            if (previewTab && !previewTab.closed) {
                previewTab.location.href = printUrl;
            } else {
                window.open(printUrl, '_blank');
            }
        } catch (error) {
            if (previewTab && !previewTab.closed) {
                previewTab.close();
            }
            console.error('印刷ゲート判定中に例外が発生しました:', error);
            setGateErrorMessage('印刷可否の確認中にエラーが発生しました。時間をおいて再試行してください。');
        } finally {
            setIsCheckingGate(false);
        }
    };

    const handleOpenGateVideo = () => {
        if (!gateModal?.lectureVideos.length || isSubmittingWatch) return;
        setGateWatchErrorMessage(null);
        watchedVideoIndicesRef.current = new Set();
        setIsGateVideoOpen(true);
    };

    const handleGateVideoClose = () => {
        if (isSubmittingWatch) return;
        setIsGateVideoOpen(false);
        watchedVideoIndicesRef.current = new Set();
    };

    const handleGateVideoEnd = async (
        _video: { title: string; url: string },
        index: number,
        watchedDurationSeconds?: number,
        videoDurationSeconds?: number,
    ) => {
        if (!gateModal) return;

        if (watchedVideoIndicesRef.current.has(index)) {
            return;
        }

        watchedVideoIndicesRef.current.add(index);

        if (watchedVideoIndicesRef.current.size < gateModal.lectureVideos.length || isSubmittingWatch) {
            return;
        }

        if (!gateModal.coreProblemId) {
            setIsGateVideoOpen(false);
            watchedVideoIndicesRef.current = new Set();
            setGateWatchErrorMessage('講義動画の視聴状態を保存できませんでした。時間をおいて再度お試しください。');
            return;
        }

        setIsSubmittingWatch(true);
        setGateWatchErrorMessage(null);

        try {
            const success = await markLectureAsWatched({
                coreProblemId: gateModal.coreProblemId,
                watchedDurationSeconds,
                videoDurationSeconds,
            });

            if (!success) {
                setIsGateVideoOpen(false);
                watchedVideoIndicesRef.current = new Set();
                setGateWatchErrorMessage('視聴状態の保存に失敗しました。もう一度最初から視聴してください。');
                return;
            }

            closeGateModal(true);
            router.refresh();
        } catch (error) {
            console.error('講義動画の視聴状態保存に失敗しました:', error);
            setIsGateVideoOpen(false);
            watchedVideoIndicesRef.current = new Set();
            setGateWatchErrorMessage('視聴状態の保存に失敗しました。もう一度最初から視聴してください。');
        } finally {
            setIsSubmittingWatch(false);
        }
    };

    useEffect(() => {
        if (!selectedSubjectId || gateModal) return;

        const handlePointerDownOutside = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Element)) return;

            if (printControlRef.current?.contains(target)) return;
            if (target.closest('[data-print-subject-card="true"]')) return;

            setSelectedSubjectId(null);
            setGateErrorMessage(null);
        };

        document.addEventListener('pointerdown', handlePointerDownOutside);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDownOutside);
        };
    }, [gateModal, selectedSubjectId]);

    const previewVideo = gateModal?.lectureVideos[0];
    const previewUrl = previewVideo ? getEmbedUrl(previewVideo.url) : null;
    const canOpenGateVideo = Boolean(gateModal?.coreProblemId && gateModal.lectureVideos.length > 0);

    return (
        <>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-6 mb-8">
                {subjects.map((subject) => {
                    const style = getSubjectStyle(subject.subjectName);
                    const isSelected = selectedSubjectId === subject.subjectId;

                    return (
                        <motion.div
                            key={subject.subjectId}
                            layout
                            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                            className="relative"
                            data-print-subject-card="true"
                        >
                            <Button
                                type="button"
                                variant="ghost"
                                disabled={isInteractionLocked}
                                className={cn(
                                    'relative flex h-full min-h-[160px] w-full flex-col overflow-hidden rounded-xl border-none p-0 shadow-md transition-all duration-300',
                                    'disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-80',
                                    isInteractionLocked ? 'cursor-not-allowed opacity-80' : 'cursor-pointer',
                                    isSelected ? 'shadow-xl scale-105 ring-2 ring-offset-2 ring-gray-800' : 'hover:scale-105 hover:shadow-lg'
                                )}
                                onClick={() => handleSubjectClick(subject.subjectId)}
                            >
                                <span className={cn('flex min-h-[160px] w-full flex-1 flex-col items-center justify-center p-6', style.color)}>
                                    <span className="text-6xl font-black text-white mb-2 select-none">{style.label}</span>
                                    <span className="text-white/90 font-medium tracking-wider select-none">{style.full}</span>
                                </span>

                                {selectedSubjectId && !isSelected && (
                                    <span aria-hidden="true" className="absolute inset-0 z-10 bg-white/60" />
                                )}
                            </Button>

                            <AnimatePresence>
                                {isSelected && (
                                    <motion.div
                                        ref={printControlRef}
                                        data-print-selector-controls="true"
                                        initial={{ opacity: 0, y: -20, height: 0 }}
                                        animate={{ opacity: 1, y: 0, height: 'auto' }}
                                        exit={{ opacity: 0, y: -20, height: 0 }}
                                        className="absolute top-full left-0 right-0 mt-4 z-20"
                                    >
                                        <Card className="bg-white shadow-xl border-2 border-gray-100">
                                            <CardContent className="p-4 space-y-4">
                                                <div className="flex items-center justify-between bg-gray-50 rounded-lg p-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            decrementSets();
                                                        }}
                                                        disabled={isInteractionLocked || sets <= 1}
                                                        className="h-8 w-8 hover:bg-white hover:shadow-sm"
                                                    >
                                                        <Minus className="h-4 w-4" />
                                                    </Button>
                                                    <div className="flex flex-col items-center">
                                                        <span className="text-2xl font-bold font-mono">{sets}</span>
                                                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Sets</span>
                                                    </div>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            incrementSets();
                                                        }}
                                                        disabled={isInteractionLocked || sets >= 10}
                                                        className="h-8 w-8 hover:bg-white hover:shadow-sm"
                                                    >
                                                        <Plus className="h-4 w-4" />
                                                    </Button>
                                                </div>

                                                <Button
                                                    className="w-full font-bold text-lg h-12 gap-2 shadow-sm hover:shadow-md transition-all active:scale-95"
                                                    size="lg"
                                                    disabled={isInteractionLocked}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        void handlePrint();
                                                    }}
                                                >
                                                    <Printer className="w-5 h-5" />
                                                    {isCheckingGate ? '確認中...' : '印刷する'}
                                                </Button>
                                                <p className="text-xs text-center text-muted-foreground">
                                                    {sets * 10}問 / {sets}セット
                                                </p>
                                                {gateErrorMessage && (
                                                    <p className="text-xs text-center text-red-600">
                                                        {gateErrorMessage}
                                                    </p>
                                                )}
                                            </CardContent>
                                        </Card>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    );
                })}
            </div>

            <Dialog
                open={!!gateModal}
                onOpenChange={(open) => {
                    if (!open) {
                        closeGateModal();
                    }
                }}
            >
                <DialogContent className="sm:max-w-4xl">
                    <DialogHeader className="space-y-3">
                        <DialogTitle>
                            {gateModal?.coreProblemName
                                ? `「${gateModal.coreProblemName}」がアンロックされました`
                                : '新しい単元がアンロックされました'}
                        </DialogTitle>
                        <DialogDescription>
                            {gateModal?.coreProblemName
                                ? `次の問題を印刷する前に「${gateModal.coreProblemName}」の講義動画を視聴してください。`
                                : '次の問題を印刷する前に講義動画を視聴してください。'}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(260px,1fr)]">
                        <div className="space-y-3">
                            <div
                                className={cn(
                                    'relative aspect-video w-full overflow-hidden rounded-xl border bg-black',
                                    !canOpenGateVideo && 'opacity-80'
                                )}
                            >
                                {previewUrl ? (
                                    <iframe
                                        src={previewUrl}
                                        title={`${gateModal?.coreProblemName ?? '講義動画'} のプレビュー`}
                                        className="h-full w-full pointer-events-none"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                        allowFullScreen
                                    />
                                ) : (
                                    <div className="flex h-full items-center justify-center bg-slate-950 px-6 text-center text-sm text-slate-200">
                                        この講義動画のプレビューを読み込めませんでした。
                                    </div>
                                )}
                                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-black/25" />
                                <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4 text-white">
                                    <p className="text-sm font-semibold">{previewVideo?.title || gateModal?.coreProblemName || '講義動画'}</p>
                                    <p className="text-xs text-white/80">
                                        {canOpenGateVideo ? 'このプレビューを押すと全画面で再生します。' : 'この講義動画は再生できません。'}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    aria-label={`${gateModal?.coreProblemName ?? '講義動画'} の講義動画プレビューを再生`}
                                    onClick={handleOpenGateVideo}
                                    disabled={!canOpenGateVideo}
                                    className={cn(
                                        'absolute inset-0 z-10 rounded-xl ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 disabled:cursor-default',
                                        canOpenGateVideo ? 'cursor-pointer hover:ring-2 hover:ring-primary/70' : 'cursor-default'
                                    )}
                                >
                                    <span className="sr-only">
                                        {canOpenGateVideo ? 'プレビューを押して全画面で再生する' : '講義動画を再生できない'}
                                    </span>
                                </button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                視聴が終わるとトップ画面に戻ります。講義動画を見終わった後、同じトップ画面から再度「印刷する」を押してください。
                            </p>
                        </div>

                        <div className="space-y-4 rounded-xl border bg-slate-50 p-4">
                            <div className="space-y-2">
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Core Problem</p>
                                <p className="text-lg font-semibold text-slate-900">{gateModal?.coreProblemName ?? '講義動画'}</p>
                            </div>
                            <div className="flex items-center justify-between rounded-lg bg-white px-4 py-3">
                                <span className="text-sm text-slate-600">動画本数</span>
                                <span className="text-lg font-semibold text-slate-900">{gateModal?.lectureVideos.length ?? 0}本</span>
                            </div>
                            <div className="space-y-2 rounded-lg bg-white px-4 py-3 text-sm text-slate-600">
                                <p>1. 左のプレビューを押して講義動画を全画面で視聴します。</p>
                                <p>2. 視聴が終わったらトップ画面で再度「印刷する」を押します。</p>
                            </div>
                            {!canOpenGateVideo && (
                                <p className="text-sm text-red-600">
                                    講義動画情報を取得できませんでした。時間をおいて再度お試しください。
                                </p>
                            )}
                            {gateWatchErrorMessage && (
                                <p className="text-sm text-red-600">
                                    {gateWatchErrorMessage}
                                </p>
                            )}
                        </div>
                    </div>

                    <DialogFooter className="gap-2 sm:justify-between">
                        <Button type="button" variant="outline" onClick={() => closeGateModal()} disabled={isSubmittingWatch}>
                            閉じる
                        </Button>
                        {isSubmittingWatch ? (
                            <p className="text-sm text-muted-foreground">視聴状態を保存中...</p>
                        ) : null}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {gateModal && (
                <FullScreenVideoPlayer
                    isOpen={isGateVideoOpen}
                    onClose={handleGateVideoClose}
                    initialIndex={0}
                    playlist={gateModal.lectureVideos.map((video, index) => ({
                        title: video.title || `${gateModal.coreProblemName || '講義動画'} ${index + 1}`,
                        url: video.url,
                    }))}
                    onVideoEnd={handleGateVideoEnd}
                    autoCloseOnLastVideoEnd={false}
                />
            )}
        </>
    );
}
