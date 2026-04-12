'use client';

import type { MutableRefObject } from 'react';
import { Sparkles } from 'lucide-react';

import { TeXHelpLink } from '@/components/problem-authoring/tex-help-link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
    getProblemBodyCardAuthoringTool,
    isVisualAttachmentKind,
    type ProblemBodyAttachmentBlockType,
    type ProblemBodyAttachmentKind,
    type ProblemBodyCard,
} from '@/lib/problem-editor-model';
import { getProblemBodyCardUiPolicy } from '@/lib/problem-body-card-ui-policy';
import { cn } from '@/lib/utils';
import { ProblemAuthoringEmbed, type VendorSceneApplyPayload, type VendorSyncPayload } from '../problem-authoring-embed';
import { ProblemTextPreview } from './problem-text-preview';

const CARD_UPLOAD_ACCEPT = '.svg,.png,.jpg,.jpeg';

type ProblemBodyCardEditorVariant = 'admin' | 'author';

type ProblemBodyCardEditorCopy = {
    authoringToolLabel: string;
    aiSectionTitle: string;
    aiSectionDescription: string;
    extraInstructionsLabel: string;
    extraInstructionsPlaceholder: string;
    generateButtonLabel: string;
    aiUnavailableText: string;
};

const COPY_BY_VARIANT: Record<ProblemBodyCardEditorVariant, ProblemBodyCardEditorCopy> = {
    admin: {
        authoringToolLabel: '埋め込みエディタ',
        aiSectionTitle: 'AI生成',
        aiSectionDescription: 'カード本文と追加指示から図版だけを生成して反映します。',
        extraInstructionsLabel: '追加プロンプト',
        extraInstructionsPlaceholder: '例: 頂点を明示 / 整数座標に限定 / 補助線なし',
        generateButtonLabel: 'AIで生成してdraftに反映',
        aiUnavailableText: 'AI 図版生成は `GEOMETRY` と `GRAPH_DRAW` のときだけ表示します。',
    },
    author: {
        authoringToolLabel: '作図エディタ',
        aiSectionTitle: 'AIで図を作成',
        aiSectionDescription: 'このカードの本文と補足指示から、図形やグラフの素材だけを自動生成します。',
        extraInstructionsLabel: '追加の指示',
        extraInstructionsPlaceholder: '例: 頂点を明示する / 整数座標にする / 補助線なし',
        generateButtonLabel: 'AIで生成して反映',
        aiUnavailableText: 'AI生成は図形問題と関数・グラフ問題で使えます。',
    },
};

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

export function ProblemBodyCardEditorShared({
    variant,
    subjectName,
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
    variant: ProblemBodyCardEditorVariant;
    subjectName?: string | null;
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
    const copy = COPY_BY_VARIANT[variant];
    const uiPolicy = getProblemBodyCardUiPolicy(subjectName);
    const isVisualCard = isVisualAttachmentKind(card.attachmentKind);
    const isUploadCard = card.attachmentKind === 'upload';
    const authoringTool = getProblemBodyCardAuthoringTool(card, preferredAuthoringTool);
    const canUploadAsset = Boolean(problemId && revisionId);

    return (
        <div className="space-y-4">
            <div
                className={cn(
                    'space-y-4',
                    uiPolicy.showTextPreview && uiPolicy.previewPlacement === 'right' && 'md:grid md:grid-cols-2 md:gap-4 md:space-y-0',
                )}
                data-testid="problem-body-card-text-layout"
                data-preview-placement={uiPolicy.showTextPreview ? uiPolicy.previewPlacement : 'hidden'}
            >
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
                {uiPolicy.showTextPreview && (
                    <div className="space-y-2">
                        <Label>本文確認</Label>
                        <ProblemTextPreview text={card.text} />
                    </div>
                )}
            </div>

            {uiPolicy.allowAttachments && (
                <>
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
                                    <Label>{copy.authoringToolLabel}</Label>
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
                                            {copy.aiSectionTitle}
                                        </div>
                                        <p className="text-sm text-muted-foreground">
                                            {copy.aiSectionDescription}
                                        </p>
                                    </div>
                                    {supportsAiFigureGeneration ? (
                                        <>
                                            <div className="space-y-2">
                                                <Label>{copy.extraInstructionsLabel}</Label>
                                                <Textarea
                                                    value={generationExtraPrompt}
                                                    onChange={(event) => onGenerationExtraPromptChange(event.target.value)}
                                                    rows={4}
                                                    placeholder={copy.extraInstructionsPlaceholder}
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
                                                    {copy.generateButtonLabel}
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
                                            {copy.aiUnavailableText}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
