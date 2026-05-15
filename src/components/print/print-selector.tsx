'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Minus, Plus, Printer } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

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
import { getPreferredPrintView } from '@/lib/print-view';
import { getSubjectConfig } from '@/lib/subject-config';
import { cn } from '@/lib/utils';
import { getEmbedUrl, getYouTubeId } from '@/lib/youtube';

const LazyFullScreenVideoPlayer = dynamic(
    () => import('@/components/full-screen-video-player').then((module) => module.FullScreenVideoPlayer),
    { ssr: false },
);

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
    const t = useTranslations('PrintSelector');
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

        const pageParams = new URLSearchParams({
            subjectId: selectedSubjectId,
            sets: String(sets),
            gateChecked: '1',
            view: getPreferredPrintView(),
        });
        const printPageUrl = appendCacheBust(`/dashboard/print?${pageParams.toString()}`);
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
                setGateErrorMessage(t('gateCheckFailed'));
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
                previewTab.location.href = printPageUrl;
            } else {
                window.open(printPageUrl, '_blank');
            }
        } catch (error) {
            if (previewTab && !previewTab.closed) {
                previewTab.close();
            }
            console.error('印刷ゲート判定中に例外が発生しました:', error);
            setGateErrorMessage(t('gateCheckUnexpectedError'));
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
            setGateWatchErrorMessage(t('watchStateMissing'));
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
                setGateWatchErrorMessage(t('watchStateSaveFailed'));
                return;
            }

            closeGateModal(true);
            router.refresh();
        } catch (error) {
            console.error('講義動画の視聴状態保存に失敗しました:', error);
            setIsGateVideoOpen(false);
            watchedVideoIndicesRef.current = new Set();
            setGateWatchErrorMessage(t('watchStateSaveFailed'));
        } finally {
            setIsSubmittingWatch(false);
        }
    };

    useEffect(() => {
        if (!selectedSubjectId || gateModal || isInteractionLocked) return;

        const handlePointerDownOutside = (event: PointerEvent) => {
            if (isInteractionLocked) return;

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
    }, [gateModal, isInteractionLocked, selectedSubjectId]);

    const previewVideo = gateModal?.lectureVideos[0];
    const hasGateVideos = (gateModal?.lectureVideos.length ?? 0) > 0;
    const hasTrackableGateVideos = hasGateVideos
        && (gateModal?.lectureVideos.every((video) => Boolean(getYouTubeId(video.url))) ?? false);
    const previewUrl = previewVideo && hasTrackableGateVideos
        ? getEmbedUrl(previewVideo.url)
        : null;
    const canOpenGateVideo = Boolean(gateModal?.coreProblemId && hasTrackableGateVideos);
    const gateVideoSupportMessage = !hasGateVideos
        ? t('videoInfoMissing')
        : !hasTrackableGateVideos
            ? t('unsupportedVideoUrl')
            : !gateModal?.coreProblemId
                ? t('videoInfoMissing')
                : null;

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
                                    'relative flex h-full min-h-[160px] w-full flex-col overflow-hidden rounded-lg border-none p-0 transition-all duration-300',
                                    'disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-80',
                                    isInteractionLocked ? 'cursor-not-allowed opacity-80' : 'cursor-pointer',
                                    isSelected ? 'scale-105 ring-2 ring-offset-2 ring-foreground' : 'hover:scale-105'
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
                                        <Card className="bg-white border-2 border">
                                            <CardContent className="p-4 space-y-4">
                                                <div className="flex items-center justify-between bg-muted rounded-lg p-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        aria-label={t('decrementSets')}
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            decrementSets();
                                                        }}
                                                        disabled={isInteractionLocked || sets <= 1}
                                                        className="h-8 w-8 hover:bg-white"
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
                                                        aria-label={t('incrementSets')}
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            incrementSets();
                                                        }}
                                                        disabled={isInteractionLocked || sets >= 10}
                                                        className="h-8 w-8 hover:bg-white"
                                                    >
                                                        <Plus className="h-4 w-4" />
                                                    </Button>
                                                </div>

                                                <Button
                                                    className="w-full font-bold text-lg h-12 gap-2 transition-all active:scale-95"
                                                    size="lg"
                                                    disabled={isInteractionLocked}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        void handlePrint();
                                                    }}
                                                >
                                                    <Printer className="w-5 h-5" />
                                                    {isCheckingGate ? t('checking') : t('print')}
                                                </Button>
                                                <p className="text-xs text-center text-muted-foreground">
                                                    {t('setsSummary', { problems: sets * 10, sets })}
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
                                ? t('unlockedTitleWithName', { coreProblemName: gateModal.coreProblemName })
                                : t('unlockedTitle')}
                        </DialogTitle>
                        <DialogDescription>
                            {gateModal?.coreProblemName
                                ? t('unlockedDescriptionWithName', { coreProblemName: gateModal.coreProblemName })
                                : t('unlockedDescription')}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(260px,1fr)]">
                        <div className="space-y-3">
                            <div
                                className={cn(
                                    'relative aspect-video w-full overflow-hidden rounded-lg border bg-black',
                                    !canOpenGateVideo && 'opacity-80'
                                )}
                            >
                                {previewUrl ? (
                                    <iframe
                                        src={previewUrl}
                                        title={t('previewTitle', { coreProblemName: gateModal?.coreProblemName ?? t('lectureVideo') })}
                                        className="h-full w-full pointer-events-none"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                        allowFullScreen
                                    />
                                ) : (
                                    <div className="flex h-full items-center justify-center bg-slate-950 px-6 text-center text-sm text-slate-200">
                                        {gateVideoSupportMessage ?? t('previewLoadFailed')}
                                    </div>
                                )}
                                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-black/25" />
                                <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4 text-white">
                                    <p className="text-sm font-semibold">{previewVideo?.title || gateModal?.coreProblemName || t('lectureVideo')}</p>
                                    <p className="text-xs text-white/80">
                                        {canOpenGateVideo
                                            ? t('previewPlayable')
                                            : gateVideoSupportMessage ?? t('videoCannotPlay')}
                                    </p>
                                </div>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    aria-label={t('playPreviewLabel', { coreProblemName: gateModal?.coreProblemName ?? t('lectureVideo') })}
                                    onClick={handleOpenGateVideo}
                                    disabled={!canOpenGateVideo}
                                    className={cn(
                                        'absolute inset-0 z-10 h-full w-full rounded-lg border-0 bg-transparent p-0 appearance-none ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 disabled:cursor-default',
                                        canOpenGateVideo ? 'cursor-pointer hover:ring-2 hover:ring-primary/70' : 'cursor-default'
                                    )}
                                >
                                    <span className="sr-only">
                                        {canOpenGateVideo ? t('playPreviewSr') : t('cannotPlaySr')}
                                    </span>
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {t('watchInstruction')}
                            </p>
                        </div>

                        <div className="space-y-4 rounded-lg border bg-muted p-4">
                            <div className="space-y-2">
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Core Problem</p>
                                <p className="text-lg font-semibold text-foreground">{gateModal?.coreProblemName ?? t('lectureVideo')}</p>
                            </div>
                            <div className="flex items-center justify-between rounded-lg bg-white px-4 py-3">
                                <span className="text-sm text-muted-foreground">{t('videoCount')}</span>
                                <span className="text-lg font-semibold text-foreground">{t('videoCountValue', { count: gateModal?.lectureVideos.length ?? 0 })}</span>
                            </div>
                            <div className="space-y-2 rounded-lg bg-white px-4 py-3 text-sm text-slate-600">
                                <p>{t('stepWatch')}</p>
                                <p>{t('stepRetryPrint')}</p>
                            </div>
                            {!canOpenGateVideo && (
                                <p className="text-sm text-red-600">
                                    {gateVideoSupportMessage}
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
                            {t('close')}
                        </Button>
                        {isSubmittingWatch ? (
                            <p className="text-sm text-muted-foreground">{t('savingWatchState')}</p>
                        ) : null}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {gateModal && isGateVideoOpen ? (
                <LazyFullScreenVideoPlayer
                    isOpen={isGateVideoOpen}
                    onClose={handleGateVideoClose}
                    initialIndex={0}
                    playlist={gateModal.lectureVideos.map((video, index) => ({
                        title: video.title || t('fallbackVideoTitle', {
                            coreProblemName: gateModal.coreProblemName || t('lectureVideo'),
                            index: index + 1,
                        }),
                        url: video.url,
                    }))}
                    onVideoEnd={handleGateVideoEnd}
                    autoCloseOnLastVideoEnd={false}
                    requiresTrackedCompletion
                />
            ) : null}
        </>
    );
}
