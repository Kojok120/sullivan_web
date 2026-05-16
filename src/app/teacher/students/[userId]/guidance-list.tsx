'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GuidanceRecord, GuidanceRecordStatus } from '@prisma/client';
import {
    Calendar,
    Loader2,
    MessageSquare,
    Mic,
    Pause,
    Play,
    Plus,
    SquarePen,
    Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

import { addGuidanceRecord, deleteGuidanceRecord } from './actions';
import { DateDisplay } from '@/components/ui/date-display';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
    getGuidanceAudioFileExtension,
    GuidanceRecordingFormat,
    isSupportedGuidanceAudioMimeType,
    MAX_GUIDANCE_AUDIO_AUTO_STOP_BYTES,
    MAX_GUIDANCE_AUDIO_SIZE_LIMIT_LABEL,
    normalizeGuidanceAudioMimeType,
    pickGuidanceRecordingFormat,
} from '@/lib/guidance-recording';
import { subscribeToUserRealtimeEvents } from '@/lib/realtime-events-client';

interface GuidanceListProps {
    userId: string;
    records: (GuidanceRecord & { teacher: { name: string | null } })[];
}

const MAX_RECORDING_MS = 60 * 60 * 1000;

type RecordingSessionState = {
    startedAtMs: number;
    accumulatedPausedMs: number;
    pausedAtMs: number | null;
};

function formatElapsedTime(ms: number): string {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const hours = String(Math.floor(totalSec / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
    const seconds = String(totalSec % 60).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

function getGuidanceTypeBadgeClass(type: GuidanceRecord['type']) {
    if (type === 'INTERVIEW') {
        return 'bg-blue-50 text-blue-700 border-blue-200';
    }

    if (type === 'GUIDANCE') {
        return 'bg-green-50 text-green-700 border-green-200';
    }

    return 'bg-muted text-foreground border';
}

function getGuidanceStatusBadgeClass(status: GuidanceRecordStatus) {
    if (status === 'PENDING') {
        return 'bg-amber-50 text-amber-700 border-amber-200';
    }

    if (status === 'PROCESSING') {
        return 'bg-sky-50 text-sky-700 border-sky-200';
    }

    if (status === 'FAILED') {
        return 'bg-red-50 text-red-700 border-red-200';
    }

    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
}

export function GuidanceList({ userId, records }: GuidanceListProps) {
    const t = useTranslations('GuidanceList');
    const router = useRouter();

    const [isAdding, setIsAdding] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [recordingStatus, setRecordingStatus] = useState<'idle' | 'recording' | 'paused' | 'summarizing'>('idle');
    const [elapsedMs, setElapsedMs] = useState(0);
    const [supportedRecordingFormat, setSupportedRecordingFormat] = useState<GuidanceRecordingFormat | null>(null);
    const [hasResolvedRecordingSupport, setHasResolvedRecordingSupport] = useState(false);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const sessionRef = useRef<RecordingSessionState | null>(null);
    const recordingFormatRef = useRef<GuidanceRecordingFormat | null>(null);
    const recordedBytesRef = useRef(0);
    const isStoppingRecordingRef = useRef(false);
    const hasReachedSizeLimitRef = useRef(false);

    useEffect(() => {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            setSupportedRecordingFormat(null);
            setHasResolvedRecordingSupport(true);
            return;
        }
        if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
            setSupportedRecordingFormat(null);
            setHasResolvedRecordingSupport(true);
            return;
        }

        setSupportedRecordingFormat(
            pickGuidanceRecordingFormat((mimeType) => MediaRecorder.isTypeSupported(mimeType)),
        );
        setHasResolvedRecordingSupport(true);
    }, []);

    const getGuidanceTypeLabel = (type: GuidanceRecord['type']) => {
        if (type === 'INTERVIEW') return t('typeInterview');
        if (type === 'GUIDANCE') return t('typeGuidance');
        return t('typeOther');
    };

    const getGuidanceStatusLabel = (status: GuidanceRecordStatus) => {
        if (status === 'PENDING') return t('statusPending');
        if (status === 'PROCESSING') return t('statusProcessing');
        if (status === 'FAILED') return t('statusFailed');
        return t('statusCompleted');
    };

    const getGuidanceRecordBody = (record: GuidanceRecord) => {
        if (record.status === 'PENDING') {
            return t('bodyPending');
        }

        if (record.status === 'PROCESSING') {
            return t('bodyProcessing');
        }

        if (record.status === 'FAILED') {
            return record.summaryErrorMessage || t('bodyFailed');
        }

        return record.content;
    };

    const recordingButtonLabel = !hasResolvedRecordingSupport
        ? t('recordingChecking')
        : supportedRecordingFormat
            ? t('recordingStart')
            : t('openManualInput');

    function getCurrentElapsedMs(): number {
        if (!sessionRef.current) return 0;

        const now = Date.now();
        const baseElapsed = now - sessionRef.current.startedAtMs - sessionRef.current.accumulatedPausedMs;
        if (sessionRef.current.pausedAtMs) {
            return Math.max(0, baseElapsed - (now - sessionRef.current.pausedAtMs));
        }
        return Math.max(0, baseElapsed);
    }

    function clearTimer() {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    }

    function cleanupMediaResources() {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
        mediaRecorderRef.current = null;
        recordingFormatRef.current = null;
        sessionRef.current = null;
        chunksRef.current = [];
        recordedBytesRef.current = 0;
        isStoppingRecordingRef.current = false;
        hasReachedSizeLimitRef.current = false;
    }

    async function handleAdd(formData: FormData) {
        setIsSaving(true);
        const result = await addGuidanceRecord(userId, formData);
        setIsSaving(false);

        if (result.error) {
            toast.error(result.error);
        } else {
            toast.success(t('addSuccess'));
            setIsAdding(false);
            router.refresh();
        }
    }

    async function handleDelete(recordId: string) {
        if (!confirm(t('deleteConfirm'))) return;

        const result = await deleteGuidanceRecord(recordId, userId);
        if (result.error) {
            toast.error(result.error);
        } else {
            toast.success(t('deleteSuccess'));
            router.refresh();
        }
    }

    async function startRecording() {
        let stream: MediaStream | null = null;
        const preferredFormat = supportedRecordingFormat || null;
        if (!preferredFormat) {
            setIsAdding(true);
            toast.error(t('unsupportedRecordingToast'));
            return;
        }

        if (recordingStatus !== 'idle') {
            return;
        }

        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });
            streamRef.current = stream;

            const recorder = new MediaRecorder(stream, { mimeType: preferredFormat.mediaRecorderMimeType });
            const actualMimeType = normalizeGuidanceAudioMimeType(recorder.mimeType);
            const uploadMimeType = isSupportedGuidanceAudioMimeType(actualMimeType)
                ? actualMimeType
                : preferredFormat.uploadMimeType;

            chunksRef.current = [];
            recordedBytesRef.current = 0;
            isStoppingRecordingRef.current = false;
            hasReachedSizeLimitRef.current = false;
            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    chunksRef.current.push(event.data);
                    recordedBytesRef.current += event.data.size;

                    if (!isStoppingRecordingRef.current && !hasReachedSizeLimitRef.current && recordedBytesRef.current >= MAX_GUIDANCE_AUDIO_AUTO_STOP_BYTES) {
                        hasReachedSizeLimitRef.current = true;
                        clearTimer();
                        queueMicrotask(() => {
                            void stopAndSummarize('size');
                        });
                    }
                }
            };

            recorder.start(1000);
            mediaRecorderRef.current = recorder;
            recordingFormatRef.current = {
                mediaRecorderMimeType: recorder.mimeType || preferredFormat.mediaRecorderMimeType,
                uploadMimeType,
                fileExtension: getGuidanceAudioFileExtension(uploadMimeType),
            };
            sessionRef.current = {
                startedAtMs: Date.now(),
                accumulatedPausedMs: 0,
                pausedAtMs: null,
            };
            setElapsedMs(0);
            setRecordingStatus('recording');
        } catch (error) {
            console.error('[guidance-list] startRecording failed:', error);
            cleanupMediaResources();
            setRecordingStatus('idle');
            setIsAdding(true);
            toast.error(t('micFailed'));
        }
    }

    function togglePauseResumeRecording() {
        const recorder = mediaRecorderRef.current;
        if (!recorder || !sessionRef.current) {
            return;
        }

        if (recordingStatus === 'recording') {
            try {
                recorder.pause();
                sessionRef.current.pausedAtMs = Date.now();
                setRecordingStatus('paused');
            } catch (error) {
                console.error('[guidance-list] pause failed:', error);
                toast.error(t('pauseFailed'));
            }
            return;
        }

        if (recordingStatus === 'paused') {
            try {
                if (sessionRef.current.pausedAtMs) {
                    sessionRef.current.accumulatedPausedMs += Date.now() - sessionRef.current.pausedAtMs;
                    sessionRef.current.pausedAtMs = null;
                }
                recorder.resume();
                setRecordingStatus('recording');
            } catch (error) {
                console.error('[guidance-list] resume failed:', error);
                toast.error(t('resumeFailed'));
            }
        }
    }

    async function stopRecorderAndCollectBlob(): Promise<Blob> {
        const recorder = mediaRecorderRef.current;
        if (!recorder) {
            throw new Error('recorder not found');
        }

        return new Promise<Blob>((resolve, reject) => {
            recorder.onerror = () => {
                reject(new Error('recording error'));
            };

            recorder.onstop = () => {
                const uploadMimeType = recordingFormatRef.current?.uploadMimeType ?? 'audio/webm';
                const blob = new Blob(chunksRef.current, { type: uploadMimeType });
                resolve(blob);
            };

            if (recorder.state !== 'inactive') {
                recorder.requestData();
                recorder.stop();
            } else {
                const uploadMimeType = recordingFormatRef.current?.uploadMimeType ?? 'audio/webm';
                const blob = new Blob(chunksRef.current, { type: uploadMimeType });
                resolve(blob);
            }
        });
    }

    async function stopAndSummarize(limitReason: 'time' | 'size' | null = null) {
        if (recordingStatus === 'idle' || recordingStatus === 'summarizing') {
            return;
        }

        if (isStoppingRecordingRef.current) {
            return;
        }
        isStoppingRecordingRef.current = true;

        const session = sessionRef.current;
        if (!session) {
            toast.error(t('recordingStateFailed'));
            cleanupMediaResources();
            setRecordingStatus('idle');
            return;
        }

        const endedAtMs = Date.now();

        // 一時停止中に終了した場合も、停止時間を計測に反映する。
        if (session.pausedAtMs) {
            session.accumulatedPausedMs += endedAtMs - session.pausedAtMs;
            session.pausedAtMs = null;
        }

        setRecordingStatus('summarizing');
        clearTimer();

        try {
            const blob = await stopRecorderAndCollectBlob();
            if (blob.size === 0) {
                throw new Error('empty audio blob');
            }

            const recordingFormat = recordingFormatRef.current;
            if (!recordingFormat) {
                throw new Error('recording format not found');
            }

            const file = new File(
                [blob],
                `guidance-${Date.now()}.${recordingFormat.fileExtension}`,
                { type: recordingFormat.uploadMimeType },
            );
            const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tokyo';

            const formData = new FormData();
            formData.append('audio', file);
            formData.append('startedAtIso', new Date(session.startedAtMs).toISOString());
            formData.append('endedAtIso', new Date(endedAtMs).toISOString());
            formData.append('timeZone', timeZone);

            const response = await fetch(`/api/teacher/students/${userId}/guidance-summary`, {
                method: 'POST',
                body: formData,
            });
            const payload = (await response.json()) as {
                success?: boolean;
                queued?: boolean;
                error?: string;
                recordId?: string;
            };

            if (!response.ok || !payload.success || !payload.queued || !payload.recordId) {
                if (payload.recordId) {
                    router.refresh();
                }
                throw new Error(payload.error || t('summaryFailed'));
            }

            toast.success(
                limitReason === 'size'
                    ? t('summaryStartedSize', { size: MAX_GUIDANCE_AUDIO_SIZE_LIMIT_LABEL })
                    : limitReason === 'time'
                        ? t('summaryStartedTime')
                        : t('summaryStarted'),
            );
            router.refresh();
            setIsAdding(false);
            setElapsedMs(0);
            setRecordingStatus('idle');
        } catch (error) {
            console.error('[guidance-list] summarize failed:', error);
            toast.error(t('summaryFailedOpenManual'));
            setIsAdding(true);
            setRecordingStatus('idle');
        } finally {
            cleanupMediaResources();
        }
    }

    useEffect(() => {
        clearTimer();

        if (recordingStatus === 'recording' || recordingStatus === 'paused') {
            timerRef.current = setInterval(() => {
                const nextElapsed = getCurrentElapsedMs();
                setElapsedMs(nextElapsed);

                if (nextElapsed >= MAX_RECORDING_MS) {
                    clearTimer();
                    void stopAndSummarize('time');
                }
            }, 500);
        }

        return () => {
            clearTimer();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recordingStatus]);

    useEffect(() => {
        return () => {
            clearTimer();
            try {
                if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                    mediaRecorderRef.current.stop();
                }
            } catch {
                // no-op
            }
            cleanupMediaResources();
        };
    }, []);

    useEffect(() => {
        let unsubscribe = () => { };

        void (async () => {
            unsubscribe = await subscribeToUserRealtimeEvents({
                channelName: 'realtime-events:guidance-summary',
                onInsert: (record) => {
                    if (record.type !== 'guidance_summary_completed' && record.type !== 'guidance_summary_failed') {
                        return;
                    }

                    const payload = record.payload as { studentId?: string; message?: string | null } | undefined;
                    if (payload?.studentId !== userId) {
                        return;
                    }

                    if (record.type === 'guidance_summary_completed') {
                        toast.success(t('summaryCompleted'));
                    } else {
                        toast.error(t('summaryFailed'), {
                            description: payload?.message || t('summaryFailedDescription'),
                        });
                    }

                    router.refresh();
                },
            });
        })();

        return () => {
            unsubscribe();
        };
    }, [router, t, userId]);

    return (
        <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2">
                        <MessageSquare className="h-5 w-5" />
                        {t('title')}
                    </CardTitle>
                    <CardDescription>{t('description')}</CardDescription>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        size="icon"
                        variant="outline"
                        aria-label={t('newRecord')}
                        title={t('newRecord')}
                        onClick={() => setIsAdding((prev) => !prev)}
                        disabled={recordingStatus === 'summarizing'}
                    >
                        <span className="relative block h-4 w-4">
                            <Plus className="h-4 w-4" />
                            <SquarePen className="absolute -right-1 -bottom-1 h-3 w-3" />
                        </span>
                    </Button>

                    <Button
                        size="icon"
                        variant={recordingStatus === 'idle' ? 'outline' : 'default'}
                        aria-label={recordingButtonLabel}
                        title={recordingButtonLabel}
                        onClick={() => void startRecording()}
                        disabled={recordingStatus !== 'idle' || !hasResolvedRecordingSupport}
                    >
                        <Mic className="h-4 w-4" />
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="space-y-6 pt-4">
                {hasResolvedRecordingSupport && !supportedRecordingFormat ? (
                    <div className="rounded-lg border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
                        {t('unsupportedRecordingInline')}
                    </div>
                ) : null}

                {recordingStatus !== 'idle' ? (
                    <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm font-medium">
                                {recordingStatus === 'summarizing'
                                    ? t('summarizingStatus')
                                    : recordingStatus === 'paused'
                                        ? t('recordingPaused')
                                        : t('recording')}
                            </div>
                            <div className="font-mono text-sm">{formatElapsedTime(elapsedMs)}</div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            {recordingStatus === 'recording' || recordingStatus === 'paused' ? (
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="outline"
                                    aria-label={recordingStatus === 'recording' ? t('pause') : t('resume')}
                                    title={recordingStatus === 'recording' ? t('pause') : t('resume')}
                                    onClick={togglePauseResumeRecording}
                                >
                                    {recordingStatus === 'recording' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                                </Button>
                            ) : null}

                            <Button
                                type="button"
                                onClick={() => void stopAndSummarize()}
                                disabled={recordingStatus === 'summarizing'}
                            >
                                {recordingStatus === 'summarizing' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                {t('stopAndSummarize')}
                            </Button>
                        </div>

                        <p className="text-xs text-muted-foreground">
                            {t('recordingLimitNote', {
                                size: MAX_GUIDANCE_AUDIO_SIZE_LIMIT_LABEL,
                                minutes: 60,
                            })}
                        </p>
                    </div>
                ) : null}

                {isAdding && (
                    <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
                        <form action={handleAdd} className="space-y-4">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">{t('dateLabel')}</label>
                                    <Input
                                        type="date"
                                        name="date"
                                        required
                                        defaultValue={new Date().toISOString().split('T')[0]}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">{t('typeLabel')}</label>
                                    <Select name="type" defaultValue="GUIDANCE">
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="INTERVIEW">{t('typeInterview')}</SelectItem>
                                            <SelectItem value="GUIDANCE">{t('typeGuidance')}</SelectItem>
                                            <SelectItem value="OTHER">{t('typeOther')}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">{t('contentLabel')}</label>
                                <Textarea
                                    name="content"
                                    required
                                    placeholder={t('contentPlaceholder')}
                                    className="min-h-[100px]"
                                />
                            </div>
                            <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
                                <Button type="button" variant="ghost" size="sm" className="min-h-11 sm:min-h-10" onClick={() => setIsAdding(false)}>
                                    {t('cancel')}
                                </Button>
                                <Button type="submit" size="sm" className="min-h-11 sm:min-h-10" disabled={isSaving}>
                                    {isSaving ? t('saving') : t('save')}
                                </Button>
                            </div>
                        </form>
                    </div>
                )}

                <div className="space-y-4">
                    {records.length > 0 ? (
                        records.map((record) => (
                            <div key={record.id} className="flex flex-col space-y-2 border-b pb-4 last:border-0">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-xs px-2 py-0.5 rounded-full border ${getGuidanceTypeBadgeClass(record.type)}`}>
                                            {getGuidanceTypeLabel(record.type)}
                                        </span>
                                        {record.status !== 'COMPLETED' ? (
                                            <span className={`text-xs px-2 py-0.5 rounded-full border ${getGuidanceStatusBadgeClass(record.status)}`}>
                                                {getGuidanceStatusLabel(record.status)}
                                            </span>
                                        ) : null}
                                        <span className="text-sm font-medium flex items-center gap-1 text-muted-foreground">
                                            <Calendar className="h-3 w-3" />
                                            <DateDisplay date={record.date} />
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground">
                                            {t('teacherLabel')} {record.teacher.name || t('unknownTeacher')}
                                        </span>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                            onClick={() => void handleDelete(record.id)}
                                            aria-label={t('deleteRecord')}
                                            title={t('deleteRecord')}
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </div>
                                <div className={`whitespace-pre-wrap pl-1 text-sm ${record.status === 'FAILED' ? 'text-red-700' : ''}`}>
                                    {getGuidanceRecordBody(record)}
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="py-8 text-center text-sm text-muted-foreground">
                            {t('empty')}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
