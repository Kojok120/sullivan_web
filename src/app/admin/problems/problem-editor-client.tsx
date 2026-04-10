'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
    Check,
    ChevronDown,
    ChevronUp,
    FileUp,
    Plus,
    Sparkles,
    Trash2,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { TeXHelpLink } from '@/components/problem-authoring/tex-help-link';
import {
    buildDefaultStructuredDraft,
    parseStructuredDocument,
    type AnswerSpec,
    type GradingConfig,
    type PrintConfig,
    type ProblemBlock,
    type StructuredProblemDocument,
} from '@/lib/structured-problem';
import {
    isAiFigureGenerationSupported,
    parseProblemFigureGenerationContext,
    renderSvgSceneSpec,
    type ProblemFigureSceneSpec,
} from '@/lib/problem-figure-scene';
import type { ProblemGradingAuditWithProblem, RenderableProblemAsset, RenderableProblemWithRelations } from './types';
import {
    createProblemDraft,
    deleteProblemAsset,
    generateProblemFigureDraft,
    overrideProblemGradingAudit,
    previewProblemPrint,
    publishProblemRevision,
    simulateProblemGrading,
    syncProblemAuthoringArtifacts,
    uploadProblemAsset,
} from './actions';
import {
    CoreProblemSelector,
    type ProblemEditorCoreProblemOption,
    type ProblemEditorSubjectOption,
    type SelectedCoreProblem,
} from './components/core-problem-selector';
import { ProblemTextPreview } from './components/problem-text-preview';
import { ProblemAuthoringEmbed, type VendorSceneApplyPayload, type VendorSyncPayload } from './problem-authoring-embed';
import {
    appendProblemBodyCard,
    deleteProblemBodySegment,
    deriveProblemTypeFromDocument,
    getProblemBodyCardAuthoringTool,
    hasEmptyProblemBodyCard,
    isVisualAttachmentKind,
    moveProblemBodySegment,
    parseProblemBodySegments,
    syncAnswerSpecWithGradingMode,
    updateProblemBodyCard,
    type ProblemBodyAttachmentBlockType,
    type ProblemBodyAttachmentKind,
    type ProblemBodyCard,
} from '@/lib/problem-editor-model';

type EditorProps = {
    problem: RenderableProblemWithRelations | null;
    audits: ProblemGradingAuditWithProblem[];
    subjects: ProblemEditorSubjectOption[];
    coreProblems: ProblemEditorCoreProblemOption[];
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
    gradingConfig: GradingConfig;
    generationExtraPrompt: string;
    authoringStateText: string;
};

const ASSET_SOURCE_TOOLS = ['MANUAL', 'GEOGEBRA', 'SVG', 'UPLOAD'] as const;
const ASSET_KINDS = ['IMAGE', 'SVG', 'PDF', 'GEOGEBRA_STATE', 'JSON', 'THUMBNAIL'] as const;

const CARD_UPLOAD_ACCEPT = '.svg,.png,.jpg,.jpeg';

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
    const answerSpec = (draftRevision?.answerSpec as AnswerSpec | null) ?? base.answerSpec;
    const printConfig = (draftRevision?.printConfig as PrintConfig | null) ?? base.printConfig;
    const gradingConfig = (draftRevision?.gradingConfig as GradingConfig | null) ?? base.gradingConfig;
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
        gradingConfig,
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

export function ProblemEditorClient({
    problem,
    audits,
    subjects,
    coreProblems,
    initialSubjectId = null,
}: EditorProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [isGenerating, startGenerationTransition] = useTransition();
    const [state, setState] = useState(() => buildInitialState(problem, initialSubjectId));
    const vendorSyncHandlerRef = useRef<(() => Promise<VendorSyncPayload>) | null>(null);
    const vendorSceneApplyHandlerRef = useRef<((payload: VendorSceneApplyPayload) => Promise<void>) | null>(null);
    const [assetKind, setAssetKind] = useState<(typeof ASSET_KINDS)[number]>('SVG');
    const [assetInlineContent, setAssetInlineContent] = useState('');
    const [assetSourceTool, setAssetSourceTool] = useState<(typeof ASSET_SOURCE_TOOLS)[number]>('UPLOAD');
    const [assetFile, setAssetFile] = useState<File | null>(null);
    const [simulationAnswer, setSimulationAnswer] = useState('');
    const [simulationResult, setSimulationResult] = useState<Awaited<ReturnType<typeof simulateProblemGrading>> | null>(null);
    const [generationDiagnostic, setGenerationDiagnostic] = useState<string | null>(null);
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
    const bodySegments = useMemo(() => parseProblemBodySegments(state.document.blocks), [state.document.blocks]);
    const bodyCards = useMemo(
        () => bodySegments.flatMap((segment) => segment.kind === 'card' ? [segment.card] : []),
        [bodySegments],
    );
    const effectiveProblemType = useMemo(
        () => deriveProblemTypeFromDocument(state.document, state.gradingConfig.mode),
        [state.document, state.gradingConfig.mode],
    );
    const syncedAnswerSpec = useMemo(
        () => syncAnswerSpecWithGradingMode(state.answerSpec, state.gradingConfig.mode),
        [state.answerSpec, state.gradingConfig.mode],
    );
    const currentChoiceOptions = useMemo(() => {
        const choiceBlock = state.document.blocks.find((block) => block.type === 'choices');
        return choiceBlock?.type === 'choices' ? choiceBlock.options : [];
    }, [state.document.blocks]);
    const visualCards = useMemo(
        () => bodyCards.filter((card) => isVisualAttachmentKind(card.attachmentKind)),
        [bodyCards],
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

    const assetOptions = activeRevision?.assets ?? problem?.publishedRevision?.assets ?? [];

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

            let authoringState = state.authoringStateText.trim()
                ? JSON.parse(state.authoringStateText)
                : undefined;
            let vendorPayload: VendorSyncPayload | null = null;
            const normalizedAnswerSpec = syncAnswerSpecWithGradingMode(state.answerSpec, state.gradingConfig.mode);

            if (activeVisualCard && activeVisualAuthoringTool === 'GEOGEBRA') {
                if (!vendorSyncHandlerRef.current) {
                    toast.error('GeoGebra エディタの初期化が完了していません');
                    return null;
                }

                vendorPayload = await vendorSyncHandlerRef.current();
                authoringState = vendorPayload.authoringState;
            }

            let workingDocument = state.document;
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
                gradingConfig: state.gradingConfig,
            });

            if (!result.success) {
                toast.error(result.error || '保存に失敗しました');
                return null;
            }

            let problemId = result.problemId || state.problemId;
            let revisionId = result.revisionId || state.revisionId;

            if (
                vendorPayload
                && problemId
                && revisionId
                && activeVisualCard
                && activeVisualAuthoringTool === 'GEOGEBRA'
            ) {
                const syncResult = await syncProblemAuthoringArtifacts({
                    problemId,
                    revisionId,
                    authoringTool: 'GEOGEBRA',
                    authoringState: vendorPayload.authoringState,
                    svgContent: vendorPayload.svgContent,
                });

                if (!syncResult.success) {
                    toast.error(syncResult.error || 'vendor アセット同期に失敗しました');
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
                            gradingConfig: state.gradingConfig,
                        });

                        if (!result.success) {
                            toast.error(result.error || 'vendor 連携後の再保存に失敗しました');
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
                router.push(`/admin/problems/${problemId}`);
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

    const handleGenerateFigure = () => {
        if (!state.problemId) {
            toast.error('先に下書きを保存してください');
            return;
        }

        if (!activeVisualCard || !supportsAiFigureGeneration) {
            toast.error('AI 図版生成は GEOMETRY / GRAPH_DRAW のみ対応しています');
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
                        setGenerationDiagnostic(syncResult.error || 'SVG アセットの保存に失敗しました');
                        toast.error(syncResult.error || 'SVG アセットの保存に失敗しました');
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
                        setGenerationDiagnostic(`${result.targetTool} エディタの準備ができていません`);
                        toast.error(`${result.targetTool} エディタの準備ができていません`);
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
                        setGenerationDiagnostic(syncResult.error || 'vendor アセット同期に失敗しました');
                        toast.error(syncResult.error || 'vendor アセット同期に失敗しました');
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
                    problemType: deriveProblemTypeFromDocument(nextDocument, state.gradingConfig.mode),
                    grade: state.grade || undefined,
                    videoUrl: state.videoUrl || undefined,
                    coreProblemIds: state.coreProblems.map((coreProblem) => coreProblem.id),
                    authoringTool: result.targetTool === 'SVG' ? 'SVG' as never : result.targetTool as never,
                    authoringState: result.targetTool === 'SVG'
                        ? undefined
                        : JSON.parse(nextAuthoringStateText),
                    document: nextDocument,
                    answerSpec: syncAnswerSpecWithGradingMode(state.answerSpec, state.gradingConfig.mode),
                    printConfig: state.printConfig,
                    gradingConfig: state.gradingConfig,
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
                    problemType: deriveProblemTypeFromDocument(nextDocument, current.gradingConfig.mode),
                    answerSpec: syncAnswerSpecWithGradingMode(current.answerSpec, current.gradingConfig.mode),
                    document: nextDocument,
                    authoringStateText: nextAuthoringStateText,
                    authoringTool: result.targetTool,
                }));
                toast.success('AI で図版を下書きに反映しました');
                router.refresh();
            } catch (error) {
                const message = error instanceof Error ? error.message : 'AI 図版生成に失敗しました';
                setGenerationDiagnostic(message);
                toast.error(message);
            }
        });
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
        if (result.success) {
            window.open(result.url, '_blank', 'noopener,noreferrer');
        }
    };

    const handleAssetUpload = () => {
        if (!state.problemId || !state.revisionId) {
            toast.error('先に下書きを保存してください');
            return;
        }

        startTransition(async () => {
            const formData = new FormData();
            formData.set('problemId', state.problemId);
            formData.set('revisionId', state.revisionId);
            formData.set('kind', assetKind);
            formData.set('sourceTool', assetSourceTool);
            if (assetFile) {
                formData.set('file', assetFile);
            }
            if (assetInlineContent.trim()) {
                formData.set('inlineContent', assetInlineContent.trim());
            }

            const result = await uploadProblemAsset(formData);
            if (result.success) {
                toast.success('アセットを保存しました');
                setAssetFile(null);
                setAssetInlineContent('');
                router.refresh();
            } else {
                toast.error(result.error || 'アセット保存に失敗しました');
            }
        });
    };

    const handleDeleteAsset = (assetId: string) => {
        startTransition(async () => {
            const result = await deleteProblemAsset(assetId);
            if (result.success) {
                toast.success('アセットを削除しました');
                router.refresh();
            } else {
                toast.error(result.error || 'アセット削除に失敗しました');
            }
        });
    };

    const handleSimulate = () => {
        if (!state.problemId) {
            toast.error('先に保存してください');
            return;
        }
        startTransition(async () => {
            const result = await simulateProblemGrading({
                problemId: state.problemId,
                revisionId: state.revisionId || undefined,
                studentAnswer: simulationAnswer,
            });
            setSimulationResult(result);
            if (result.success) {
                toast.success('採点シミュレーションを実行しました');
                router.refresh();
            } else {
                toast.error(result.error || '採点シミュレーションに失敗しました');
            }
        });
    };

    const handleOverrideAudit = (auditId: string, score: number, reason: string) => {
        startTransition(async () => {
            const result = await overrideProblemGradingAudit({
                auditId,
                overrideScore: score,
                overrideReason: reason,
            });
            if (result.success) {
                toast.success('監査を更新しました');
                router.refresh();
            } else {
                toast.error(result.error || '監査更新に失敗しました');
            }
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl font-bold">構造化問題エディタ</h1>
                    <p className="text-sm text-muted-foreground">
                        理科・数学向けの revision / asset / grading 一体型エディタです。
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" asChild>
                        <Link href="/admin/problems">一覧へ戻る</Link>
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

            <Alert>
                <Check className="h-4 w-4" />
                <AlertTitle>DEV限定</AlertTitle>
                <AlertDescription>
                    structured problem は feature flag で有効化された環境でのみ利用されます。PRODUCTION DB には適用しません。
                </AlertDescription>
            </Alert>

            <Tabs defaultValue="basic" className="space-y-4">
                <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0">
                    <TabsTrigger value="basic">基本情報</TabsTrigger>
                    <TabsTrigger value="body">本文</TabsTrigger>
                    <TabsTrigger value="answer">解答仕様</TabsTrigger>
                    <TabsTrigger value="grading">採点</TabsTrigger>
                    <TabsTrigger value="assets">アセット</TabsTrigger>
                    <TabsTrigger value="history">改訂履歴</TabsTrigger>
                </TabsList>

                <TabsContent value="basic">
                    <Card>
                        <CardHeader>
                            <CardTitle>基本情報</CardTitle>
                            <CardDescription>問題の識別情報と紐付けを設定します。</CardDescription>
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
                                <Input value={state.videoUrl} onChange={(event) => setState((current) => ({ ...current, videoUrl: event.target.value }))} placeholder="https://..." />
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
                            <CardTitle>本文</CardTitle>
                            <CardDescription>問題文カードを積み上げ、必要なカードだけに図・画像を添付します。</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-4">
                                {bodySegments.map((segment, index) => (
                                    <Card key={segment.kind === 'card' ? segment.card.id : segment.block.id} className="border-dashed shadow-none hover:shadow-none">
                                        <CardHeader>
                                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                                <CardTitle className="text-base">
                                                    {segment.kind === 'card' ? `問題文カード ${index + 1}` : `旧仕様ブロック ${index + 1}`}
                                                </CardTitle>
                                                <div className="flex gap-2">
                                                    <Button type="button" variant="outline" size="icon" onClick={() => setState((current) => ({
                                                        ...current,
                                                        document: moveProblemBodySegment(current.document, index, -1),
                                                    }))}><ChevronUp className="h-4 w-4" /></Button>
                                                    <Button type="button" variant="outline" size="icon" onClick={() => setState((current) => ({
                                                        ...current,
                                                        document: moveProblemBodySegment(current.document, index, 1),
                                                    }))}><ChevronDown className="h-4 w-4" /></Button>
                                                    <Button type="button" variant="outline" size="icon" onClick={() => setState((current) => ({
                                                        ...current,
                                                        document: deleteProblemBodySegment(current.document, index),
                                                    }))}><Trash2 className="h-4 w-4" /></Button>
                                                </div>
                                            </div>
                                        </CardHeader>
                                        <CardContent>
                                            {segment.kind === 'card' ? (
                                                <ProblemBodyCardEditor
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
                                                    <BlockEditor
                                                        block={segment.block}
                                                        assetOptions={assetOptions}
                                                        onChange={(nextBlock) => updateBlock(setState, String(segment.block.id), nextBlock)}
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
                            <CardTitle>解答仕様</CardTitle>
                            <CardDescription>採点方式に応じて必要な解答情報だけを設定します。</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <AnswerSpecEditor
                                value={syncedAnswerSpec}
                                choiceOptions={currentChoiceOptions}
                                onChange={(next) => setState((current) => ({ ...current, answerSpec: next }))}
                            />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="grading">
                    <Card>
                        <CardHeader>
                            <CardTitle>採点</CardTitle>
                            <CardDescription>決定論採点か AI rubric かを設定し、テキスト回答でシミュレーションします。</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label>採点モード</Label>
                                    <EnumSelect
                                        value={state.gradingConfig.mode}
                                        values={['EXACT', 'NUMERIC_TOLERANCE', 'CHOICE', 'MULTI_BLANK', 'FORMULA', 'AI_RUBRIC', 'AI_VISION_RUBRIC']}
                                        onChange={(value) => setState((current) => ({
                                            ...current,
                                            gradingConfig: { ...current.gradingConfig, mode: value as GradingConfig['mode'] },
                                            answerSpec: syncAnswerSpecWithGradingMode(current.answerSpec, value as GradingConfig['mode']),
                                        }))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>満点</Label>
                                    <Input
                                        type="number"
                                        value={state.gradingConfig.maxScore}
                                        onChange={(event) => setState((current) => ({
                                            ...current,
                                            gradingConfig: { ...current.gradingConfig, maxScore: Number.parseInt(event.target.value || '100', 10) || 100 },
                                        }))}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>rubricPrompt</Label>
                                <Textarea
                                    value={state.gradingConfig.rubricPrompt ?? ''}
                                    onChange={(event) => setState((current) => ({
                                        ...current,
                                        gradingConfig: { ...current.gradingConfig, rubricPrompt: event.target.value },
                                    }))}
                                    rows={4}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>採点シミュレーション用の回答</Label>
                                <Textarea value={simulationAnswer} onChange={(event) => setSimulationAnswer(event.target.value)} rows={5} />
                            </div>
                            <Button variant="outline" onClick={handleSimulate} disabled={isPending || !state.problemId}>
                                採点シミュレーション
                            </Button>
                            {simulationResult?.success && (
                                <Alert>
                                    <AlertTitle>採点結果</AlertTitle>
                                    <AlertDescription className="space-y-1">
                                        <div>評価: {simulationResult.result.evaluation}</div>
                                        <div>スコア: {simulationResult.result.score} / {simulationResult.result.maxScore}</div>
                                        <div>信頼度: {simulationResult.result.confidence}</div>
                                        <div>理由: {simulationResult.result.reason}</div>
                                        <div>フィードバック: {simulationResult.result.feedback}</div>
                                    </AlertDescription>
                                </Alert>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="assets">
                    <Card>
                        <CardHeader>
                            <CardTitle>アセット</CardTitle>
                            <CardDescription>SVG / 画像 / state を revision に紐付けて保存します。</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid gap-4 md:grid-cols-3">
                                <div className="space-y-2">
                                    <Label>種別</Label>
                                    <EnumSelect value={assetKind} values={ASSET_KINDS as unknown as string[]} onChange={(value) => setAssetKind(value as (typeof ASSET_KINDS)[number])} />
                                </div>
                                <div className="space-y-2">
                                    <Label>sourceTool</Label>
                                    <EnumSelect value={assetSourceTool} values={ASSET_SOURCE_TOOLS as unknown as string[]} onChange={(value) => setAssetSourceTool(value as (typeof ASSET_SOURCE_TOOLS)[number])} />
                                </div>
                                <div className="space-y-2">
                                    <Label>ファイル</Label>
                                    <Input type="file" onChange={(event) => setAssetFile(event.target.files?.[0] ?? null)} />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>inlineContent</Label>
                                <Textarea value={assetInlineContent} onChange={(event) => setAssetInlineContent(event.target.value)} rows={6} placeholder="SVG や JSON を直接保存できます" />
                            </div>
                            <Button variant="outline" onClick={handleAssetUpload} disabled={isPending}>
                                <FileUp className="mr-2 h-4 w-4" />
                                アセット保存
                            </Button>

                            <div className="space-y-3">
                                {assetOptions.length === 0 ? (
                                    <div className="text-sm text-muted-foreground">保存済みアセットはありません。</div>
                                ) : assetOptions.map((asset) => (
                                    <div key={asset.id} className="rounded-lg border p-4">
                                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                            <div className="space-y-2">
                                                <div className="flex flex-wrap gap-2">
                                                    <Badge>{asset.kind}</Badge>
                                                    <Badge variant="secondary">{asset.fileName}</Badge>
                                                </div>
                                                <div className="text-sm text-muted-foreground">{asset.mimeType}</div>
                                                {asset.signedUrl && (
                                                    <a className="text-sm text-blue-600 underline" href={asset.signedUrl} target="_blank" rel="noreferrer">
                                                        アセットを開く
                                                    </a>
                                                )}
                                            </div>
                                            <Button variant="outline" onClick={() => handleDeleteAsset(asset.id)} disabled={isPending}>
                                                削除
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="history">
                    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                        <Card>
                            <CardHeader>
                                <CardTitle>改訂履歴</CardTitle>
                                <CardDescription>draft / published / superseded の revision を確認します。</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {problem?.revisions.length ? problem.revisions.map((revision) => (
                                    <div key={revision.id} className="rounded-lg border p-4">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Badge>{revision.status}</Badge>
                                            <Badge variant="secondary">rev.{revision.revisionNumber}</Badge>
                                            {revision.id === state.revisionId && <Badge variant="outline">編集中</Badge>}
                                        </div>
                                        <div className="mt-2 text-sm text-muted-foreground">
                                            {new Date(revision.updatedAt).toLocaleString('ja-JP')}
                                        </div>
                                    </div>
                                )) : (
                                    <div className="text-sm text-muted-foreground">revision はまだありません。</div>
                                )}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>採点監査</CardTitle>
                                <CardDescription>直近の simulation / grading audit を確認し、必要なら上書きします。</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {audits.length === 0 ? (
                                    <div className="text-sm text-muted-foreground">監査履歴はありません。</div>
                                ) : audits.map((audit) => (
                                    <AuditCard key={audit.id} audit={audit} onOverride={handleOverrideAudit} />
                                ))}
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}

function EnumSelect({
    value,
    values,
    onChange,
}: {
    value: string;
    values: string[];
    onChange: (value: string) => void;
}) {
    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
                {values.map((item) => (
                    <SelectItem key={item} value={item}>{item}</SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

function AttachmentKindSelect({
    value,
    onChange,
}: {
    value: ProblemBodyAttachmentKind;
    onChange: (value: ProblemBodyAttachmentKind) => void;
}) {
    return (
        <Select value={value === 'none' ? undefined : value} onValueChange={(next) => onChange(next as ProblemBodyAttachmentKind)}>
            <SelectTrigger><SelectValue placeholder="図・画像などを追加" /></SelectTrigger>
            <SelectContent>
                <SelectItem value="upload">アップロード</SelectItem>
                <SelectItem value="graph">グラフ</SelectItem>
                <SelectItem value="geometry">図形</SelectItem>
            </SelectContent>
        </Select>
    );
}

function ProblemBodyCardEditor({
    card,
    isActiveVisualCard,
    problemId,
    revisionId,
    isUploadingAsset,
    authoringStateText,
    generationExtraPrompt,
    generationDiagnostic,
    isPending,
    isGenerating,
    isAuthoringToolReady,
    supportsAiFigureGeneration,
    onActivateVisualCard,
    onCardChange,
    onUploadAsset,
    onAuthoringStateTextChange,
    onGenerationExtraPromptChange,
    onGenerateFigure,
    syncHandlerRef,
    sceneApplyHandlerRef,
    onAuthoringToolReadyChange,
    effectiveProblemType,
    preferredAuthoringTool,
}: {
    card: ProblemBodyCard;
    isActiveVisualCard: boolean;
    problemId: string;
    revisionId: string;
    isUploadingAsset: boolean;
    authoringStateText: string;
    generationExtraPrompt: string;
    generationDiagnostic: string | null;
    isPending: boolean;
    isGenerating: boolean;
    isAuthoringToolReady: boolean;
    supportsAiFigureGeneration: boolean;
    onActivateVisualCard: () => void;
    onCardChange: (updater: (card: ProblemBodyCard) => ProblemBodyCard) => void;
    onUploadAsset: (file: File) => Promise<void> | void;
    onAuthoringStateTextChange: (value: string) => void;
    onGenerationExtraPromptChange: (value: string) => void;
    onGenerateFigure: () => void;
    syncHandlerRef: MutableRefObject<(() => Promise<VendorSyncPayload>) | null>;
    sceneApplyHandlerRef: MutableRefObject<((payload: VendorSceneApplyPayload) => Promise<void>) | null>;
    onAuthoringToolReadyChange: (ready: boolean) => void;
    effectiveProblemType: string;
    preferredAuthoringTool: string;
}) {
    const isVisualCard = isVisualAttachmentKind(card.attachmentKind);
    const isUploadCard = card.attachmentKind === 'upload';
    const authoringTool = getProblemBodyCardAuthoringTool(card, preferredAuthoringTool);
    const canUploadAsset = Boolean(problemId && revisionId);

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                    <Label>本文</Label>
                    <TeXHelpLink />
                </div>
                <Textarea
                    value={card.text}
                    onChange={(event) => onCardChange((current) => ({ ...current, text: event.target.value }))}
                    rows={5}
                    placeholder="問題文を入力してください。数式は $...$ / $$...$$ で書けます。"
                />
            </div>
            <div className="space-y-2">
                <Label>本文確認</Label>
                <ProblemTextPreview text={card.text} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                    <Label>図・画像など</Label>
                    <AttachmentKindSelect
                        value={card.attachmentKind}
                        onChange={(nextKind) => onCardChange((current) => {
                            const nextAttachmentBlockType: ProblemBodyAttachmentBlockType =
                                nextKind === 'upload'
                                    ? current.attachmentBlockType === 'svg' || current.attachmentBlockType === 'image'
                                        ? current.attachmentBlockType
                                        : 'image'
                                    : nextKind === 'graph'
                                        ? 'graphAsset'
                                        : 'geometryAsset';

                            return {
                                ...current,
                                attachmentKind: nextKind,
                                attachmentBlockType: nextAttachmentBlockType,
                                assetId: '',
                            };
                        })}
                    />
                </div>
                {card.attachmentKind !== 'none' && (
                    <div className="flex items-end">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onCardChange((current) => ({
                                ...current,
                                attachmentKind: 'none',
                                attachmentBlockType: null,
                                assetId: '',
                            }))}
                        >
                            添付を外す
                        </Button>
                    </div>
                )}
            </div>

            {isUploadCard && (
                <>
                    <div className="space-y-2">
                        <Label>アップロード</Label>
                        <Input
                            type="file"
                            accept={CARD_UPLOAD_ACCEPT}
                            disabled={!canUploadAsset || isPending || isGenerating || isUploadingAsset}
                            onChange={(event) => {
                                const file = event.target.files?.[0];
                                event.currentTarget.value = '';
                                if (!file) {
                                    return;
                                }

                                void onUploadAsset(file);
                            }}
                        />
                        {!canUploadAsset && (
                            <p className="text-xs text-muted-foreground">先に下書き保存するとアップロードできます。</p>
                        )}
                    </div>
                </>
            )}

            {isVisualCard && (
                <div className="space-y-4 rounded-lg border border-dashed p-4">
                    <div className="space-y-1">
                        <div className="text-sm font-medium">図形・グラフ作成</div>
                        <p className="text-sm text-muted-foreground">
                            このカードに紐づく図版を作成・生成します。
                        </p>
                    </div>

                    {!isActiveVisualCard && (
                        <Button type="button" variant="outline" onClick={onActivateVisualCard}>
                            このカードを作図対象にする
                        </Button>
                    )}

                    {isActiveVisualCard && authoringTool === 'GEOGEBRA' && (
                        <div className="space-y-2">
                            <Label>埋め込みエディタ</Label>
                            <ProblemAuthoringEmbed
                                problemType={effectiveProblemType}
                                tool={authoringTool}
                                authoringStateText={authoringStateText}
                                onAuthoringStateTextChange={onAuthoringStateTextChange}
                                syncHandlerRef={syncHandlerRef}
                                sceneApplyHandlerRef={sceneApplyHandlerRef}
                                disabled={isPending}
                                onReadyStateChange={onAuthoringToolReadyChange}
                            />
                        </div>
                    )}

                    {isActiveVisualCard && (
                        <div className="space-y-4 rounded-lg border border-dashed p-4">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 text-sm font-medium">
                                    <Sparkles className="h-4 w-4" />
                                    AI生成
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    カード本文と追加指示から図版だけを生成して反映します。
                                </p>
                            </div>

                            {supportsAiFigureGeneration ? (
                                <>
                                    <div className="space-y-2">
                                        <Label>追加プロンプト</Label>
                                        <Textarea
                                            value={generationExtraPrompt}
                                            onChange={(event) => onGenerationExtraPromptChange(event.target.value)}
                                            rows={4}
                                            placeholder="例: 頂点を明示 / 整数座標に限定 / 補助線なし"
                                        />
                                    </div>

                                    {generationDiagnostic && (
                                        <Alert variant="destructive">
                                            <AlertTitle>生成エラー</AlertTitle>
                                            <AlertDescription>{generationDiagnostic}</AlertDescription>
                                        </Alert>
                                    )}

                                    <div className="flex flex-wrap gap-2">
                                        <Button
                                            type="button"
                                            onClick={onGenerateFigure}
                                            disabled={isPending || isGenerating || !supportsAiFigureGeneration || (authoringTool === 'GEOGEBRA' && !isAuthoringToolReady)}
                                        >
                                            <Sparkles className="mr-2 h-4 w-4" />
                                            AIで生成してdraftに反映
                                        </Button>
                                    </div>
                                    {authoringTool === 'GEOGEBRA' && !isAuthoringToolReady && (
                                        <p className="text-sm text-muted-foreground">
                                            GeoGebra エディタの読み込み完了後に生成できます。
                                        </p>
                                    )}
                                </>
                            ) : (
                                <p className="text-sm text-muted-foreground">
                                    AI 図版生成は `GEOMETRY` と `GRAPH_DRAW` のときだけ表示します。
                                </p>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function BlockEditor({
    block,
    assetOptions,
    onChange,
}: {
    block: ProblemBlock;
    assetOptions: RenderableProblemAsset[];
    onChange: (block: ProblemBlock) => void;
}) {
    const type = block.type;
    const update = (patch: Partial<ProblemBlock>) => onChange({ ...block, ...patch } as ProblemBlock);

    if (type === 'paragraph') {
        return (
            <Textarea
                value={String(block.text ?? '')}
                onChange={(event) => update({ text: event.target.value })}
                rows={4}
            />
        );
    }

    if (type === 'katexInline' || type === 'katexDisplay') {
        return (
            <div className="space-y-2">
                <Textarea value={String(block.latex ?? '')} onChange={(event) => update({ latex: event.target.value })} rows={3} />
            </div>
        );
    }

    if (type === 'image' || type === 'svg' || type === 'graphAsset' || type === 'geometryAsset') {
        return (
            <div className="space-y-3">
                <div className="space-y-2">
                    <Label>assetId</Label>
                    <Select
                        value={String(block.assetId ?? '') || '__NONE__'}
                        onValueChange={(value) => update({
                            assetId: value === '__NONE__' ? '' : value,
                        })}
                    >
                        <SelectTrigger><SelectValue placeholder="asset を選択" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__NONE__">未選択</SelectItem>
                            {assetOptions.map((asset) => (
                                <SelectItem key={asset.id} value={asset.id}>{asset.kind} / {asset.fileName}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                {type === 'image' && (
                    <Input value={String(block.src ?? '')} onChange={(event) => update({ src: event.target.value })} placeholder="fallback image URL" />
                )}
                {type === 'svg' && (
                    <Textarea value={String(block.svg ?? '')} onChange={(event) => update({ svg: event.target.value })} rows={5} placeholder="<svg>...</svg>" />
                )}
            </div>
        );
    }

    if (type === 'table') {
        return (
            <div className="space-y-2">
                <Textarea
                    value={JSON.stringify(block.headers ?? [], null, 2)}
                    onChange={(event) => update({ headers: safeJsonArray(event.target.value) })}
                    rows={3}
                    placeholder='["x", "y"]'
                />
                <Textarea
                    value={JSON.stringify(block.rows ?? [], null, 2)}
                    onChange={(event) => update({ rows: safeJsonMatrix(event.target.value) })}
                    rows={6}
                    placeholder='[["1", "2"]]'
                />
            </div>
        );
    }

    if (type === 'choices') {
        return (
            <Textarea
                value={JSON.stringify(block.options ?? [], null, 2)}
                onChange={(event) => update({ options: safeJsonArrayOfObjects(event.target.value, [{ id: 'A', label: '選択肢A' }]) })}
                rows={6}
                placeholder='[{"id":"A","label":"選択肢A"}]'
            />
        );
    }

    if (type === 'blankGroup') {
        return (
            <Textarea
                value={JSON.stringify(block.blanks ?? [], null, 2)}
                onChange={(event) => update({ blanks: safeJsonArrayOfObjects(event.target.value, [{ id: 'blank-1', label: '空欄1' }]) })}
                rows={6}
                placeholder='[{"id":"blank-1","label":"空欄1"}]'
            />
        );
    }

    if (type === 'answerLines') {
        return (
            <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                旧仕様の解答欄ブロックです。現在の印刷では無視されるため、必要なら削除するか別の block に変更してください。
            </div>
        );
    }

    return null;
}

function AnswerSpecEditor({
    value,
    choiceOptions,
    onChange,
}: {
    value: AnswerSpec;
    choiceOptions: Array<{ id: string; label: string }>;
    onChange: (next: AnswerSpec) => void;
}) {
    const kind = value.kind;
    const update = (patch: Partial<AnswerSpec>) => onChange({ ...value, ...patch } as AnswerSpec);

    return (
        <div className="space-y-4">
            {(kind === 'exact' || kind === 'numeric' || kind === 'formula') && (
                <div className="space-y-3">
                    <div className="space-y-2">
                        <Label>correctAnswer</Label>
                        <Input value={String(value.correctAnswer ?? '')} onChange={(event) => update({ correctAnswer: event.target.value })} />
                    </div>
                    <div className="space-y-2">
                        <Label>acceptedAnswers(JSON)</Label>
                        <Textarea
                            value={JSON.stringify(value.acceptedAnswers ?? [], null, 2)}
                            onChange={(event) => update({ acceptedAnswers: safeJsonArray(event.target.value) })}
                            rows={4}
                        />
                    </div>
                    {kind === 'numeric' && (
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label>tolerance</Label>
                                <Input type="number" value={Number(value.tolerance ?? 0)} onChange={(event) => update({ tolerance: Number.parseFloat(event.target.value || '0') || 0 })} />
                            </div>
                            <div className="space-y-2">
                                <Label>unit</Label>
                                <Input value={String(value.unit ?? '')} onChange={(event) => update({ unit: event.target.value })} />
                            </div>
                        </div>
                    )}
                </div>
            )}

            {kind === 'choice' && (
                <div className="space-y-2">
                    <Label>correctChoiceId</Label>
                    <Select value={value.correctChoiceId} onValueChange={(correctChoiceId) => onChange({ ...value, correctChoiceId })}>
                        <SelectTrigger><SelectValue placeholder="選択肢を選ぶ" /></SelectTrigger>
                        <SelectContent>
                            {choiceOptions.map((option) => (
                                <SelectItem key={option.id} value={option.id}>
                                    {option.id} / {option.label || '未入力'}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}

            {kind === 'multiBlank' && (
                <div className="space-y-2">
                    <Label>blanks(JSON)</Label>
                    <Textarea
                        value={JSON.stringify(value.blanks ?? [], null, 2)}
                        onChange={(event) => update({ blanks: safeJsonArrayOfObjects(event.target.value, [{ id: 'blank-1', correctAnswer: '', acceptedAnswers: [] }]) })}
                        rows={8}
                    />
                </div>
            )}

            {(kind === 'rubric' || kind === 'visionRubric') && (
                <div className="space-y-3">
                    <div className="space-y-2">
                        <Label>modelAnswer</Label>
                        <Textarea value={String(value.modelAnswer ?? '')} onChange={(event) => update({ modelAnswer: event.target.value })} rows={4} />
                    </div>
                    <div className="space-y-2">
                        <Label>rubric</Label>
                        <Textarea value={String(value.rubric ?? '')} onChange={(event) => update({ rubric: event.target.value })} rows={4} />
                    </div>
                    <div className="space-y-2">
                        <Label>criteria(JSON)</Label>
                        <Textarea
                            value={JSON.stringify(value.criteria ?? [], null, 2)}
                            onChange={(event) => update({ criteria: safeJsonArrayOfObjects(event.target.value, [{ id: 'criterion-1', label: '観点', description: '説明', maxPoints: 50 }]) })}
                            rows={8}
                        />
                    </div>
                    {kind === 'visionRubric' && (
                        <div className="space-y-2">
                            <Label>expectedElements(JSON)</Label>
                            <Textarea
                                value={JSON.stringify(value.expectedElements ?? [], null, 2)}
                                onChange={(event) => update({ expectedElements: safeJsonArray(event.target.value) })}
                                rows={4}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function AuditCard({
    audit,
    onOverride,
}: {
    audit: ProblemGradingAuditWithProblem;
    onOverride: (auditId: string, score: number, reason: string) => void;
}) {
    const [score, setScore] = useState(audit.overrideScore ?? audit.score);
    const [reason, setReason] = useState(audit.overrideReason ?? '');

    return (
        <div className="rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-2">
                <Badge>{audit.gradingMode}</Badge>
                <Badge variant="secondary">{audit.graderType}</Badge>
                <Badge variant="outline">{audit.source}</Badge>
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
                score: {audit.score} / {audit.maxScore} {audit.confidence !== null ? `(confidence: ${audit.confidence})` : ''}
            </div>
            {audit.reason && <div className="mt-2 text-sm">{audit.reason}</div>}
            <div className="mt-3 space-y-2">
                <Input type="number" value={score} onChange={(event) => setScore(Number.parseFloat(event.target.value || '0') || 0)} />
                <Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} placeholder="override reason" />
                <Button variant="outline" onClick={() => onOverride(audit.id, score, reason)}>
                    上書き保存
                </Button>
            </div>
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

function safeJsonArray(value: string): string[] {
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
    } catch {
        return [];
    }
}

function safeJsonMatrix(value: string): string[][] {
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map((row) => Array.isArray(row) ? row.map((cell) => String(cell)) : []) : [];
    } catch {
        return [];
    }
}

function safeJsonArrayOfObjects<T extends object>(value: string, fallback: T[]): T[] {
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : fallback;
    } catch {
        return fallback;
    }
}
