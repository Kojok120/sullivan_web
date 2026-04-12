'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
    buildDefaultStructuredDraft,
    normalizeAnswerSpecForAuthoring,
    parseStructuredDocument,
    type AnswerSpec,
    type PrintConfig,
    type ProblemBlock,
    type StructuredProblemDocument,
} from '@/lib/structured-problem';
import {
    getAssetKindLabel,
} from '@/lib/problem-ui';
import {
    isAiFigureGenerationSupported,
    parseProblemFigureGenerationContext,
    renderSvgSceneSpec,
    type ProblemFigureSceneSpec,
} from '@/lib/problem-figure-scene';
import type { RenderableProblemAsset, RenderableProblemWithRelations } from '@/app/admin/problems/types';
import {
    createProblemDraft,
    generateProblemFigureDraft,
    previewProblemPrint,
    publishProblemRevision,
    syncProblemAuthoringArtifacts,
    uploadProblemAsset,
} from '@/app/admin/problems/actions';
import {
    CoreProblemSelector,
    type ProblemEditorCoreProblemOption,
    type ProblemEditorSubjectOption,
    type SelectedCoreProblem,
} from '@/app/admin/problems/components/core-problem-selector';
import { ProblemBodyCardEditorShared } from '@/app/admin/problems/components/problem-body-card-editor-shared';
import { type VendorSceneApplyPayload, type VendorSyncPayload } from '@/app/admin/problems/problem-authoring-embed';
import {
    appendProblemBodyCard,
    deleteProblemBodySegment,
    deriveProblemTypeFromDocument,
    getProblemBodyCardAuthoringTool,
    hasEmptyProblemBodyCard,
    isVisualAttachmentKind,
    moveProblemBodySegment,
    parseProblemBodySegments,
    updateProblemBodyCard,
} from '@/lib/problem-editor-model';

type ProblemAuthorEditorProps = {
    problem: RenderableProblemWithRelations | null;
    subjects: ProblemEditorSubjectOption[];
    coreProblems: ProblemEditorCoreProblemOption[];
    routeBase?: string;
    initialSubjectId?: string | null;
};

type EditorState = {
    problemId: string;
    revisionId: string;
    subjectId: string | null;
    problemType: string;
    grade: string;
    videoUrl: string;
    coreProblems: SelectedCoreProblem[];
    authoringTool: string;
    document: StructuredProblemDocument;
    answerSpec: AnswerSpec;
    printConfig: PrintConfig;
    generationExtraPrompt: string;
    authoringStateText: string;
};

function normalizeAuthoringTool(authoringTool?: string | null) {
    return authoringTool ?? 'MANUAL';
}

function getCardUploadAssetSpec(file: File): { assetKind: 'IMAGE' | 'SVG'; attachmentBlockType: 'image' | 'svg' } | null {
    const normalizedName = file.name.toLowerCase();

    if (file.type === 'image/svg+xml' || normalizedName.endsWith('.svg')) {
        return { assetKind: 'SVG', attachmentBlockType: 'svg' };
    }

    if (
        file.type === 'image/png'
        || file.type === 'image/jpeg'
        || normalizedName.endsWith('.png')
        || normalizedName.endsWith('.jpg')
        || normalizedName.endsWith('.jpeg')
    ) {
        return { assetKind: 'IMAGE', attachmentBlockType: 'image' };
    }

    return null;
}

function buildInitialState(problem: RenderableProblemWithRelations | null, initialSubjectId?: string | null): EditorState {
    const base = buildDefaultStructuredDraft(problem?.problemType ?? 'SHORT_TEXT');
    const draftRevision = problem?.revisions.find((revision) => revision.status === 'DRAFT') ?? problem?.publishedRevision ?? null;
    const structuredContent = draftRevision?.structuredContent
        ? parseStructuredDocument(draftRevision.structuredContent)
        : base.document;
    const answerSpec = normalizeAnswerSpecForAuthoring((draftRevision?.answerSpec as AnswerSpec | null) ?? base.answerSpec);
    const printConfig = (draftRevision?.printConfig as PrintConfig | null) ?? base.printConfig;
    const generationContext = parseProblemFigureGenerationContext(draftRevision?.generationContext);
    const initialProblemType = problem?.problemType ?? 'SHORT_TEXT';
    const normalizedAuthoringTool = normalizeAuthoringTool(draftRevision?.authoringTool);

    return {
        problemId: problem?.id ?? '',
        revisionId: draftRevision?.id ?? '',
        subjectId: problem?.subjectId ?? problem?.coreProblems[0]?.subjectId ?? initialSubjectId ?? null,
        problemType: initialProblemType,
        grade: problem?.grade ?? '',
        videoUrl: problem?.videoUrl ?? '',
        coreProblems: (problem?.coreProblems ?? []) as SelectedCoreProblem[],
        authoringTool: normalizedAuthoringTool,
        document: structuredContent,
        answerSpec,
        printConfig,
        generationExtraPrompt: generationContext?.extraPrompt ?? '',
        authoringStateText: draftRevision?.authoringState ? JSON.stringify(draftRevision.authoringState, null, 2) : '',
    };
}

function validateEditorState(state: Pick<EditorState, 'subjectId' | 'coreProblems'>) {
    if (!state.subjectId) {
        return '科目を選択してください';
    }

    if (state.coreProblems.length === 0) {
        return '単元を選択してください';
    }

    if (state.coreProblems.some((coreProblem) => coreProblem.subjectId && coreProblem.subjectId !== state.subjectId)) {
        return '選択した科目と異なる単元が含まれています';
    }

    return null;
}

export function ProblemAuthorEditorClient({
    problem,
    subjects,
    coreProblems,
    routeBase = '/materials/problems',
    initialSubjectId = null,
}: ProblemAuthorEditorProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [isGenerating, startGenerationTransition] = useTransition();
    const [state, setState] = useState(() => buildInitialState(problem, initialSubjectId));
    const [generationDiagnostic, setGenerationDiagnostic] = useState<string | null>(null);
    const vendorSyncHandlerRef = useRef<(() => Promise<VendorSyncPayload>) | null>(null);
    const vendorSceneApplyHandlerRef = useRef<((payload: VendorSceneApplyPayload) => Promise<void>) | null>(null);
    const [activeVisualCardId, setActiveVisualCardId] = useState<string | null>(null);
    const [uploadingCardId, setUploadingCardId] = useState<string | null>(null);
    const [isVendorToolReady, setIsVendorToolReady] = useState(false);

    const activeRevision = useMemo(() => {
        if (!problem) return null;
        return problem.revisions.find((revision) => revision.id === state.revisionId)
            ?? problem.revisions.find((revision) => revision.status === 'DRAFT')
            ?? problem.publishedRevision
            ?? null;
    }, [problem, state.revisionId]);
    const assetOptions = activeRevision?.assets ?? problem?.publishedRevision?.assets ?? [];
    const bodySegments = useMemo(() => parseProblemBodySegments(state.document.blocks), [state.document.blocks]);
    const bodyCards = useMemo(
        () => bodySegments.flatMap((segment) => segment.kind === 'card' ? [segment.card] : []),
        [bodySegments],
    );
    const effectiveProblemType = useMemo(
        () => deriveProblemTypeFromDocument(state.document, state.problemType),
        [state.document, state.problemType],
    );
    const syncedAnswerSpec = useMemo(
        () => normalizeAnswerSpecForAuthoring(state.answerSpec),
        [state.answerSpec],
    );
    const visualCards = useMemo(
        () => bodyCards.filter((card) => isVisualAttachmentKind(card.attachmentKind)),
        [bodyCards],
    );
    const currentSubjectName = useMemo(
        () => subjects.find((subject) => subject.id === state.subjectId)?.name ?? state.coreProblems[0]?.subject?.name ?? null,
        [subjects, state.subjectId, state.coreProblems],
    );
    const resolvedActiveVisualCardId = activeVisualCardId && visualCards.some((card) => card.id === activeVisualCardId)
        ? activeVisualCardId
        : visualCards[0]?.id ?? null;
    const activeVisualCard = visualCards.find((card) => card.id === resolvedActiveVisualCardId) ?? null;
    const activeVisualAuthoringTool = getProblemBodyCardAuthoringTool(activeVisualCard, state.authoringTool);
    const effectiveAuthoringTool = activeVisualAuthoringTool ?? state.authoringTool;
    const supportsAiFigureGeneration = isAiFigureGenerationSupported(effectiveProblemType);

    useEffect(() => {
        if (!activeVisualAuthoringTool) {
            setIsVendorToolReady(false);
        }
    }, [activeVisualAuthoringTool]);

    const handleCardAssetUpload = async (
        cardId: string,
        file: File,
    ) => {
        const uploadSpec = getCardUploadAssetSpec(file);
        if (!uploadSpec) {
            toast.error('アップロードできるのは SVG / PNG / JPG / JPEG のみです');
            return;
        }

        if (!state.problemId || !state.revisionId) {
            toast.error('先に下書きを保存してください');
            return;
        }

        setUploadingCardId(cardId);
        try {
            const formData = new FormData();
            formData.set('problemId', state.problemId);
            formData.set('revisionId', state.revisionId);
            formData.set('kind', uploadSpec.assetKind);
            formData.set('sourceTool', 'UPLOAD');
            formData.set('file', file);

            const result = await uploadProblemAsset(formData);
            if (!result.success || !result.asset) {
                toast.error(result.error || '図版のアップロードに失敗しました');
                return;
            }

            setState((current) => ({
                ...current,
                document: updateProblemBodyCard(current.document, cardId, (card) => ({
                    ...card,
                    attachmentKind: 'upload',
                    attachmentBlockType: uploadSpec.attachmentBlockType,
                    assetId: result.asset?.id ?? '',
                })),
            }));
            toast.success('図版をアップロードしました');
            router.refresh();
        } finally {
            setUploadingCardId(null);
        }
    };

    const handleSave = () => {
        startTransition(async () => {
            const persisted = await persistDraftState({ showSuccessToast: true });
            if (!persisted) {
                return;
            }
        });
    };

    const persistDraftState = async ({ showSuccessToast }: { showSuccessToast: boolean }) => {
        try {
            const validationError = validateEditorState(state);
            if (validationError) {
                toast.error(validationError);
                return null;
            }

            if (hasEmptyProblemBodyCard(bodyCards)) {
                toast.error('空の問題文カードがあります。本文を入力するか削除してください');
                return null;
            }

            let authoringState = state.authoringStateText.trim() ? JSON.parse(state.authoringStateText) : undefined;
            let vendorPayload: VendorSyncPayload | null = null;
            let workingDocument = state.document;
            const normalizedAnswerSpec = normalizeAnswerSpecForAuthoring(state.answerSpec);

            if (activeVisualCard && activeVisualAuthoringTool === 'GEOGEBRA') {
                if (!vendorSyncHandlerRef.current) {
                    toast.error('図形エディタの準備ができていません');
                    return null;
                }

                vendorPayload = await vendorSyncHandlerRef.current();
                authoringState = vendorPayload.authoringState;
            }

            let result = await createProblemDraft({
                problemId: state.problemId || undefined,
                problemType: effectiveProblemType,
                grade: state.grade || undefined,
                videoUrl: state.videoUrl || undefined,
                coreProblemIds: state.coreProblems.map((coreProblem) => coreProblem.id),
                authoringTool: effectiveAuthoringTool as never,
                authoringState,
                document: workingDocument,
                answerSpec: normalizedAnswerSpec,
                printConfig: state.printConfig,
            });

            if (!result.success) {
                toast.error(result.error || '保存に失敗しました');
                return null;
            }

            let problemId = result.problemId || state.problemId;
            let revisionId = result.revisionId || state.revisionId;

            if (vendorPayload && problemId && revisionId && activeVisualCard && activeVisualAuthoringTool === 'GEOGEBRA') {
                const syncResult = await syncProblemAuthoringArtifacts({
                    problemId,
                    revisionId,
                    authoringTool: 'GEOGEBRA',
                    authoringState: vendorPayload.authoringState,
                    svgContent: vendorPayload.svgContent,
                });

                if (!syncResult.success) {
                    toast.error(syncResult.error || '図の保存に失敗しました');
                    return null;
                }

                const svgAssetId = syncResult.svgAsset?.id;
                if (svgAssetId) {
                    const nextDocument = updateProblemBodyCard(
                        workingDocument,
                        activeVisualCard.id,
                        (card) => ({
                            ...card,
                            attachmentKind: card.attachmentKind,
                            assetId: svgAssetId,
                        }),
                    );

                    if (JSON.stringify(nextDocument) !== JSON.stringify(workingDocument)) {
                        workingDocument = nextDocument;
                        result = await createProblemDraft({
                            problemId,
                            problemType: effectiveProblemType,
                            grade: state.grade || undefined,
                            videoUrl: state.videoUrl || undefined,
                            coreProblemIds: state.coreProblems.map((coreProblem) => coreProblem.id),
                            authoringTool: effectiveAuthoringTool as never,
                            authoringState: vendorPayload.authoringState,
                            document: workingDocument,
                            answerSpec: normalizedAnswerSpec,
                            printConfig: state.printConfig,
                        });

                        if (!result.success) {
                            toast.error(result.error || '図の反映後の保存に失敗しました');
                            return null;
                        }

                        problemId = result.problemId || problemId;
                        revisionId = result.revisionId || revisionId;
                    }
                }
            }

            if (showSuccessToast) {
                toast.success('下書きを保存しました');
            }

            setState((current) => ({
                ...current,
                problemId,
                revisionId,
                problemType: effectiveProblemType,
                answerSpec: normalizedAnswerSpec,
                document: workingDocument,
                authoringStateText: authoringState ? JSON.stringify(authoringState, null, 2) : '',
                authoringTool: effectiveAuthoringTool,
            }));

            if (!state.problemId && problemId) {
                router.push(`${routeBase}/${problemId}`);
            } else {
                router.refresh();
            }

            return {
                problemId,
                revisionId,
            };
        } catch (error) {
            toast.error(error instanceof Error ? error.message : '保存に失敗しました');
            return null;
        }
    };

    const handlePublish = () => {
        if (!state.problemId) {
            toast.error('先に下書きを保存してください');
            return;
        }

        startTransition(async () => {
            const result = await publishProblemRevision(state.problemId);
            if (result.success) {
                toast.success('公開しました');
                router.refresh();
            } else {
                toast.error(result.error || '公開に失敗しました');
            }
        });
    };

    const handlePreview = async () => {
        const persisted = await persistDraftState({ showSuccessToast: false });
        if (!persisted) {
            return;
        }

        const result = await previewProblemPrint({
            problemId: persisted.problemId,
            revisionId: persisted.revisionId || undefined,
        });

        window.open(result.url, '_blank', 'noopener,noreferrer');
    };

    const handleGenerateFigure = () => {
        if (!state.problemId) {
            toast.error('先に下書きを保存してください');
            return;
        }

        if (!activeVisualCard || !supportsAiFigureGeneration) {
            toast.error('AIで図を作れるのは「図形」「関数・グラフ」のみです');
            return;
        }

        const sourceProblemText = activeVisualCard.text.trim();
        const targetTool = getProblemBodyCardAuthoringTool(activeVisualCard, state.authoringTool);
        if (!sourceProblemText) {
            toast.error('このカードの本文を入力してください');
            return;
        }

        if (!targetTool) {
            toast.error('グラフまたは図形カードを選択してください');
            return;
        }

        if (targetTool === 'GEOGEBRA' && !isVendorToolReady) {
            toast.error('GeoGebra エディタの準備ができるまで少し待ってください');
            return;
        }

        startGenerationTransition(async () => {
            try {
                setGenerationDiagnostic(null);
                const result = await generateProblemFigureDraft({
                    problemId: state.problemId,
                    revisionId: state.revisionId || undefined,
                    sourceProblemText,
                    extraPrompt: state.generationExtraPrompt,
                    targetTool,
                });

                if (!result.success) {
                    setGenerationDiagnostic(result.error || 'AI 図版生成に失敗しました');
                    toast.error(result.error || 'AI 図版生成に失敗しました');
                    return;
                }

                let nextDocument = state.document;
                let nextAuthoringStateText = '';
                const sceneSpec = result.sceneSpec as ProblemFigureSceneSpec;

                if (result.targetTool === 'SVG') {
                    const svgContent = renderSvgSceneSpec(sceneSpec as Extract<ProblemFigureSceneSpec, { kind: 'svg' }>);
                    const syncResult = await syncProblemAuthoringArtifacts({
                        problemId: result.problemId,
                        revisionId: result.revisionId,
                        authoringTool: 'SVG',
                        authoringState: undefined,
                        svgContent,
                    });

                    if (!syncResult.success) {
                        setGenerationDiagnostic(syncResult.error || 'SVG の保存に失敗しました');
                        toast.error(syncResult.error || 'SVG の保存に失敗しました');
                        return;
                    }

                    const svgAssetId = syncResult.svgAsset?.id;
                    if (svgAssetId) {
                        nextDocument = updateProblemBodyCard(nextDocument, activeVisualCard.id, (card) => ({
                            ...card,
                            attachmentKind: card.attachmentKind,
                            assetId: svgAssetId,
                        }));
                    }
                } else {
                    if (!vendorSceneApplyHandlerRef.current || !vendorSyncHandlerRef.current) {
                        setGenerationDiagnostic('図形エディタの準備ができていません');
                        toast.error('図形エディタの準備ができていません');
                        return;
                    }

                    await vendorSceneApplyHandlerRef.current({
                        tool: result.targetTool,
                        sceneSpec,
                    } as VendorSceneApplyPayload);

                    const vendorPayload = await vendorSyncHandlerRef.current();
                    nextAuthoringStateText = JSON.stringify(vendorPayload.authoringState, null, 2);

                    const syncResult = await syncProblemAuthoringArtifacts({
                        problemId: result.problemId,
                        revisionId: result.revisionId,
                        authoringTool: result.targetTool,
                        authoringState: vendorPayload.authoringState,
                        svgContent: vendorPayload.svgContent,
                    });

                    if (!syncResult.success) {
                        setGenerationDiagnostic(syncResult.error || '図の保存に失敗しました');
                        toast.error(syncResult.error || '図の保存に失敗しました');
                        return;
                    }

                    const svgAssetId = syncResult.svgAsset?.id;
                    if (svgAssetId) {
                        nextDocument = updateProblemBodyCard(nextDocument, activeVisualCard.id, (card) => ({
                            ...card,
                            attachmentKind: card.attachmentKind,
                            assetId: svgAssetId,
                        }));
                    }
                }

                const saveResult = await createProblemDraft({
                    problemId: result.problemId,
                    problemType: deriveProblemTypeFromDocument(nextDocument, state.problemType),
                    grade: state.grade || undefined,
                    videoUrl: state.videoUrl || undefined,
                    coreProblemIds: state.coreProblems.map((coreProblem) => coreProblem.id),
                    authoringTool: result.targetTool === 'SVG' ? 'SVG' as never : result.targetTool as never,
                    authoringState: result.targetTool === 'SVG' ? undefined : JSON.parse(nextAuthoringStateText),
                    document: nextDocument,
                    answerSpec: normalizeAnswerSpecForAuthoring(state.answerSpec),
                    printConfig: state.printConfig,
                });

                if (!saveResult.success) {
                    setGenerationDiagnostic(saveResult.error || '生成結果の保存に失敗しました');
                    toast.error(saveResult.error || '生成結果の保存に失敗しました');
                    return;
                }

                setState((current) => ({
                    ...current,
                    problemId: saveResult.problemId || result.problemId,
                    revisionId: saveResult.revisionId || result.revisionId,
                    problemType: deriveProblemTypeFromDocument(nextDocument, current.problemType),
                    answerSpec: normalizeAnswerSpecForAuthoring(current.answerSpec),
                    document: nextDocument,
                    authoringStateText: nextAuthoringStateText,
                    authoringTool: result.targetTool,
                }));
                toast.success('AI で作成した図を下書きに反映しました');
                router.refresh();
            } catch (error) {
                const message = error instanceof Error ? error.message : 'AI 図版生成に失敗しました';
                setGenerationDiagnostic(message);
                toast.error(message);
            }
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl font-bold">{problem ? '問題を編集' : '新しい問題を作成'}</h1>
                    <p className="text-sm text-muted-foreground">
                        問題文、解答、図形・グラフをまとめて設定できます。
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" asChild>
                        <Link href={routeBase}>一覧へ戻る</Link>
                    </Button>
                    <Button variant="outline" onClick={handlePreview} disabled={isPending || !state.problemId}>
                        プレビュー
                    </Button>
                    <Button variant="outline" onClick={handleSave} disabled={isPending}>
                        下書き保存
                    </Button>
                    <Button onClick={handlePublish} disabled={isPending || !state.problemId}>
                        公開
                    </Button>
                </div>
            </div>

            <Tabs defaultValue="basic" className="space-y-4">
                <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0">
                    <TabsTrigger value="basic">基本情報</TabsTrigger>
                    <TabsTrigger value="body">問題文</TabsTrigger>
                    <TabsTrigger value="answer">答え</TabsTrigger>
                </TabsList>

                <TabsContent value="basic">
                    <Card>
                        <CardHeader>
                            <CardTitle>基本設定</CardTitle>
                            <CardDescription>科目、学年、動画、単元を設定します。</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-3">
                                <div className="space-y-2">
                                    <Label>科目</Label>
                                    <Select
                                        value={state.subjectId ?? undefined}
                                        onValueChange={(value) => setState((current) => ({
                                            ...current,
                                            subjectId: value,
                                            coreProblems: current.subjectId === value ? current.coreProblems : [],
                                        }))}
                                    >
                                        <SelectTrigger><SelectValue placeholder="科目を選択" /></SelectTrigger>
                                        <SelectContent>
                                            {subjects.map((subject) => (
                                                <SelectItem key={subject.id} value={subject.id}>{subject.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>学年</Label>
                                    <Input value={state.grade} onChange={(event) => setState((current) => ({ ...current, grade: event.target.value }))} placeholder="中2" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>解説動画 URL</Label>
                                <Input
                                    value={state.videoUrl}
                                    onChange={(event) => setState((current) => ({ ...current, videoUrl: event.target.value }))}
                                    placeholder="https://..."
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>単元</Label>
                                <CoreProblemSelector
                                    selected={state.coreProblems}
                                    onChange={(next) => setState((current) => ({
                                        ...current,
                                        coreProblems: next,
                                        subjectId: next[0]?.subjectId ?? current.subjectId,
                                    }))}
                                    active
                                    subjectId={state.subjectId}
                                    subjects={subjects}
                                    coreProblems={coreProblems}
                                />
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="body">
                    <Card>
                        <CardHeader>
                            <CardTitle>問題文</CardTitle>
                            <CardDescription>問題文カードを積み上げて編集します。科目によって本文確認や図版操作の内容が変わります。</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-4">
                                {bodySegments.map((segment, index) => (
                                    <Card key={segment.kind === 'card' ? segment.card.id : segment.block.id} className="border-dashed shadow-none">
                                        <CardHeader>
                                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                                <CardTitle className="text-base">
                                                    {segment.kind === 'card' ? `${index + 1}. 問題文カード` : `${index + 1}. 旧仕様ブロック`}
                                                </CardTitle>
                                                <div className="flex gap-2">
                                                    <Button type="button" variant="outline" size="icon" onClick={() => setState((current) => ({
                                                        ...current,
                                                        document: moveProblemBodySegment(current.document, index, -1),
                                                    }))}>
                                                        <ChevronUp className="h-4 w-4" />
                                                    </Button>
                                                    <Button type="button" variant="outline" size="icon" onClick={() => setState((current) => ({
                                                        ...current,
                                                        document: moveProblemBodySegment(current.document, index, 1),
                                                    }))}>
                                                        <ChevronDown className="h-4 w-4" />
                                                    </Button>
                                                    <Button type="button" variant="outline" size="icon" onClick={() => setState((current) => ({
                                                        ...current,
                                                        document: deleteProblemBodySegment(current.document, index),
                                                    }))}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </CardHeader>
                                        <CardContent>
                                            {segment.kind === 'card' ? (
                                                <ProblemBodyCardEditorShared
                                                    variant="author"
                                                    subjectName={currentSubjectName}
                                                    card={segment.card}
                                                    isActiveVisualCard={segment.card.id === resolvedActiveVisualCardId}
                                                    problemId={state.problemId}
                                                    revisionId={state.revisionId}
                                                    isUploadingAsset={uploadingCardId === segment.card.id}
                                                    authoringStateText={state.authoringStateText}
                                                    generationExtraPrompt={state.generationExtraPrompt}
                                                    generationDiagnostic={generationDiagnostic}
                                                    isPending={isPending}
                                                    isGenerating={isGenerating}
                                                    isAuthoringToolReady={isVendorToolReady}
                                                    supportsAiFigureGeneration={supportsAiFigureGeneration}
                                                    onActivateVisualCard={() => setActiveVisualCardId(segment.card.id)}
                                                    onCardChange={(updater) => setState((current) => {
                                                        const nextDocument = updateProblemBodyCard(current.document, segment.card.id, updater);
                                                        return {
                                                            ...current,
                                                            document: nextDocument,
                                                        };
                                                    })}
                                                    onUploadAsset={(file) => handleCardAssetUpload(segment.card.id, file)}
                                                    onAuthoringStateTextChange={(next) => setState((current) => ({ ...current, authoringStateText: next }))}
                                                    onGenerationExtraPromptChange={(next) => setState((current) => ({ ...current, generationExtraPrompt: next }))}
                                                    onGenerateFigure={handleGenerateFigure}
                                                    syncHandlerRef={vendorSyncHandlerRef}
                                                    sceneApplyHandlerRef={vendorSceneApplyHandlerRef}
                                                    onAuthoringToolReadyChange={setIsVendorToolReady}
                                                    effectiveProblemType={effectiveProblemType}
                                                    preferredAuthoringTool={state.authoringTool}
                                                />
                                            ) : (
                                                <div className="space-y-3">
                                                    <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                                                        旧仕様ブロックです。互換表示のみ残しており、新規追加はできません。
                                                    </div>
                                                    <AuthorBlockEditor
                                                        block={segment.block}
                                                        assetOptions={assetOptions}
                                                        onChange={(nextBlock) => updateBlock(setState, segment.block.id, nextBlock)}
                                                    />
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                ))}
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setState((current) => ({
                                        ...current,
                                        document: appendProblemBodyCard(current.document),
                                    }))}
                                >
                                    <Plus className="mr-2 h-4 w-4" />
                                    問題文を追加
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="answer">
                    <Card>
                        <CardHeader>
                            <CardTitle>答えと正解判定</CardTitle>
                            <CardDescription>AI採点の基準になる正解と別解を設定します。</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <AuthorAnswerSpecEditor
                                value={syncedAnswerSpec}
                                onChange={(next) => setState((current) => ({ ...current, answerSpec: next }))}
                            />
                        </CardContent>
                    </Card>
                </TabsContent>

            </Tabs>
        </div>
    );
}

function AuthorBlockEditor({
    block,
    assetOptions,
    onChange,
}: {
    block: ProblemBlock;
    assetOptions: RenderableProblemAsset[];
    onChange: (block: ProblemBlock) => void;
}) {
    const update = (patch: Partial<ProblemBlock>) => onChange({ ...block, ...patch } as ProblemBlock);

    if (block.type === 'paragraph') {
        return (
            <Textarea
                value={block.text}
                onChange={(event) => update({ text: event.target.value })}
                rows={4}
            />
        );
    }

    if (block.type === 'katexInline' || block.type === 'katexDisplay') {
        return (
            <div className="space-y-2">
                <Label>LaTeX 数式</Label>
                <Textarea value={block.latex} onChange={(event) => update({ latex: event.target.value })} rows={3} />
            </div>
        );
    }

    if (block.type === 'image' || block.type === 'svg' || block.type === 'graphAsset' || block.type === 'geometryAsset') {
        return (
            <div className="space-y-3">
                <div className="space-y-2">
                    <Label>使う図・画像</Label>
                    <Select
                        value={block.assetId || '__NONE__'}
                        onValueChange={(value) => update({
                            assetId: value === '__NONE__' ? '' : value,
                        } as Partial<ProblemBlock>)}
                    >
                        <SelectTrigger><SelectValue placeholder="保存済みの図・画像を選択" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__NONE__">未選択</SelectItem>
                            {assetOptions.map((asset) => (
                                <SelectItem key={asset.id} value={asset.id}>{getAssetKindLabel(asset.kind)} / {asset.fileName}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
        );
    }

    if (block.type === 'table') {
        return (
            <TableBlockEditor block={block} onChange={onChange} />
        );
    }

    if (block.type === 'choices') {
        return (
            <ChoiceBlockEditor block={block} onChange={onChange} />
        );
    }

    if (block.type === 'blankGroup') {
        return (
            <BlankGroupEditor block={block} onChange={onChange} />
        );
    }

    if (block.type === 'answerLines') {
        return (
            <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                旧仕様の解答欄ブロックです。現在の印刷では無視されるため、必要なら削除するか別の block に変更してください。
            </div>
        );
    }

    return null;
}

function TableBlockEditor({
    block,
    onChange,
}: {
    block: Extract<ProblemBlock, { type: 'table' }>;
    onChange: (block: ProblemBlock) => void;
}) {
    const setHeader = (index: number, value: string) => {
        const headers = [...block.headers];
        headers[index] = value;
        onChange({ ...block, headers });
    };

    const addHeader = () => onChange({ ...block, headers: [...block.headers, `列${block.headers.length + 1}`], rows: block.rows.map((row) => [...row, '']) });
    const removeHeader = (index: number) => {
        const headers = block.headers.filter((_, currentIndex) => currentIndex !== index);
        const rows = block.rows.map((row) => row.filter((_, currentIndex) => currentIndex !== index));
        onChange({ ...block, headers, rows });
    };
    const setCell = (rowIndex: number, cellIndex: number, value: string) => {
        const rows = block.rows.map((row, currentRowIndex) => (
            currentRowIndex === rowIndex
                ? row.map((cell, currentCellIndex) => currentCellIndex === cellIndex ? value : cell)
                : row
        ));
        onChange({ ...block, rows });
    };
    const addRow = () => onChange({ ...block, rows: [...block.rows, block.headers.map(() => '')] });
    const removeRow = (rowIndex: number) => onChange({ ...block, rows: block.rows.filter((_, currentRowIndex) => currentRowIndex !== rowIndex) });

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label>見出し</Label>
                <div className="space-y-2">
                    {block.headers.map((header, index) => (
                        <div key={`${block.id}-header-${index}`} className="flex gap-2">
                            <Input value={header} onChange={(event) => setHeader(index, event.target.value)} />
                            <Button type="button" variant="outline" size="icon" onClick={() => removeHeader(index)}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    ))}
                    <Button type="button" variant="outline" onClick={addHeader}>
                        <Plus className="mr-2 h-4 w-4" />
                        列を追加
                    </Button>
                </div>
            </div>
            <div className="space-y-2">
                <Label>表の内容</Label>
                <div className="space-y-2">
                    {block.rows.map((row, rowIndex) => (
                        <div key={`${block.id}-row-${rowIndex}`} className="space-y-2 rounded-md border p-3">
                            <div className="grid gap-2 md:grid-cols-2">
                                {block.headers.map((header, cellIndex) => (
                                    <div key={`${block.id}-row-${rowIndex}-cell-${cellIndex}`} className="space-y-1">
                                        <div className="text-xs text-muted-foreground">{header || `列${cellIndex + 1}`}</div>
                                        <Input value={row[cellIndex] ?? ''} onChange={(event) => setCell(rowIndex, cellIndex, event.target.value)} />
                                    </div>
                                ))}
                            </div>
                            <Button type="button" variant="outline" size="sm" onClick={() => removeRow(rowIndex)}>
                                行を削除
                            </Button>
                        </div>
                    ))}
                    <Button type="button" variant="outline" onClick={addRow}>
                        <Plus className="mr-2 h-4 w-4" />
                        行を追加
                    </Button>
                </div>
            </div>
        </div>
    );
}

function ChoiceBlockEditor({
    block,
    onChange,
}: {
    block: Extract<ProblemBlock, { type: 'choices' }>;
    onChange: (block: ProblemBlock) => void;
}) {
    const setOption = (index: number, label: string) => {
        const options = block.options.map((option, currentIndex) => currentIndex === index ? { ...option, label } : option);
        onChange({ ...block, options });
    };
    const addOption = () => {
        const nextId = String.fromCharCode(65 + block.options.length);
        onChange({ ...block, options: [...block.options, { id: nextId, label: '' }] });
    };
    const removeOption = (index: number) => {
        const options = block.options.filter((_, currentIndex) => currentIndex !== index);
        onChange({ ...block, options: options.length >= 2 ? options : block.options });
    };

    return (
        <div className="space-y-2">
            {block.options.map((option, index) => (
                <div key={option.id} className="flex gap-2">
                    <div className="flex w-12 items-center justify-center rounded-md border bg-muted/30 text-sm font-medium">
                        {option.id}
                    </div>
                    <Input value={option.label} onChange={(event) => setOption(index, event.target.value)} placeholder="選択肢の文章" />
                    <Button type="button" variant="outline" size="icon" onClick={() => removeOption(index)} disabled={block.options.length <= 2}>
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            ))}
            <Button type="button" variant="outline" onClick={addOption}>
                <Plus className="mr-2 h-4 w-4" />
                選択肢を追加
            </Button>
        </div>
    );
}

function BlankGroupEditor({
    block,
    onChange,
}: {
    block: Extract<ProblemBlock, { type: 'blankGroup' }>;
    onChange: (block: ProblemBlock) => void;
}) {
    const setBlank = (index: number, patch: { label?: string; placeholder?: string }) => {
        const blanks = block.blanks.map((blank, currentIndex) => currentIndex === index ? { ...blank, ...patch } : blank);
        onChange({ ...block, blanks });
    };
    const addBlank = () => onChange({
        ...block,
        blanks: [...block.blanks, { id: `blank-${block.blanks.length + 1}`, label: `空欄${block.blanks.length + 1}`, placeholder: '' }],
    });
    const removeBlank = (index: number) => {
        if (block.blanks.length <= 1) return;
        onChange({ ...block, blanks: block.blanks.filter((_, currentIndex) => currentIndex !== index) });
    };

    return (
        <div className="space-y-3">
            {block.blanks.map((blank, index) => (
                <div key={blank.id} className="space-y-2 rounded-md border p-3">
                    <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                        <Input value={blank.label} onChange={(event) => setBlank(index, { label: event.target.value })} placeholder="空欄の名前" />
                        <Input value={blank.placeholder ?? ''} onChange={(event) => setBlank(index, { placeholder: event.target.value })} placeholder="入力欄のヒント" />
                        <Button type="button" variant="outline" size="icon" onClick={() => removeBlank(index)} disabled={block.blanks.length <= 1}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            ))}
            <Button type="button" variant="outline" onClick={addBlank}>
                <Plus className="mr-2 h-4 w-4" />
                空欄を追加
            </Button>
        </div>
    );
}

function AuthorAnswerSpecEditor({
    value,
    onChange,
}: {
    value: AnswerSpec;
    onChange: (next: AnswerSpec) => void;
}) {
    const exactValue = normalizeAnswerSpecForAuthoring(value);

    return (
        <div className="space-y-4">
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label>正解</Label>
                    <Textarea
                        value={exactValue.correctAnswer}
                        onChange={(event) => onChange({ ...exactValue, correctAnswer: event.target.value })}
                        rows={4}
                    />
                </div>
                <StringListEditor
                    label="別解"
                    values={exactValue.acceptedAnswers}
                    onChange={(acceptedAnswers) => onChange({ ...exactValue, acceptedAnswers })}
                    emptyLabel="別解を追加"
                />
                <div className="text-xs text-muted-foreground">
                    JSON ではなく、候補を 1 行ずつ追加します。
                </div>
            </div>
        </div>
    );
}

function StringListEditor({
    label,
    values,
    onChange,
    emptyLabel,
}: {
    label: string;
    values: string[];
    onChange: (values: string[]) => void;
    emptyLabel: string;
}) {
    const setValue = (index: number, value: string) => {
        onChange(values.map((current, currentIndex) => currentIndex === index ? value : current));
    };

    const addValue = () => onChange([...values, '']);
    const removeValue = (index: number) => onChange(values.filter((_, currentIndex) => currentIndex !== index));

    return (
        <div className="space-y-2">
            <Label>{label}</Label>
            {values.length === 0 && <div className="text-sm text-muted-foreground">まだありません。</div>}
            {values.map((value, index) => (
                <div key={`${label}-${index}`} className="flex gap-2">
                    <Input value={value} onChange={(event) => setValue(index, event.target.value)} />
                    <Button type="button" variant="outline" size="icon" onClick={() => removeValue(index)}>
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            ))}
            <Button type="button" variant="outline" onClick={addValue}>
                <Plus className="mr-2 h-4 w-4" />
                {emptyLabel}
            </Button>
        </div>
    );
}

function updateBlock(
    setState: Dispatch<SetStateAction<EditorState>>,
    blockId: string,
    nextBlock: ProblemBlock,
) {
    setState((current) => ({
        ...current,
        document: {
            ...current.document,
            blocks: current.document.blocks.map((block) => (block.id === blockId ? nextBlock : block)),
        },
    }));
}
