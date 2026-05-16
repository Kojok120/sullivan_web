'use client';

import { useTranslations } from 'next-intl';

import { TableEditor } from '@/components/problem-authoring/table-editor';
import { TeXHelpLink } from '@/components/problem-authoring/tex-help-link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
    type ProblemBodyAttachmentBlockType,
    type ProblemBodyAttachmentKind,
    type ProblemBodyCard,
    type ProblemBodyDirectiveKind,
} from '@/lib/problem-editor-model';
import { getProblemBodyCardUiPolicy } from '@/lib/problem-body-card-ui-policy';
import { cn } from '@/lib/utils';
import { DirectiveForm, buildDefaultDirectiveSource } from './directive-form';
import { ProblemTextPreview } from './problem-text-preview';

const DIRECTIVE_KIND_SET = new Set<ProblemBodyDirectiveKind>(['numberline', 'coordplane', 'geometry', 'solid']);

function isDirectiveKind(kind: ProblemBodyAttachmentKind): kind is ProblemBodyDirectiveKind {
    return DIRECTIVE_KIND_SET.has(kind as ProblemBodyDirectiveKind);
}

const CARD_UPLOAD_ACCEPT = '.svg,.png,.jpg,.jpeg';

function AttachmentKindSelect({
    value,
    onChange,
}: {
    value: ProblemBodyAttachmentKind;
    onChange: (value: ProblemBodyAttachmentKind) => void;
}) {
    const t = useTranslations('ProblemBodyCardEditor');

    return (
        <Select value={value === 'none' ? undefined : value} onValueChange={(next) => onChange(next as ProblemBodyAttachmentKind)}>
            <SelectTrigger><SelectValue placeholder={t('attachmentPlaceholder')} /></SelectTrigger>
            <SelectContent>
                <SelectItem value="upload">{t('attachmentUpload')}</SelectItem>
                <SelectItem value="table">{t('attachmentTable')}</SelectItem>
                <SelectItem value="numberline">{t('attachmentNumberline')}</SelectItem>
                <SelectItem value="coordplane">{t('attachmentCoordplane')}</SelectItem>
                <SelectItem value="geometry">{t('attachmentGeometry')}</SelectItem>
                <SelectItem value="solid">{t('attachmentSolid')}</SelectItem>
            </SelectContent>
        </Select>
    );
}

export function ProblemBodyCardEditorShared({
    subjectName,
    card,
    problemId,
    revisionId,
    isUploadingAsset,
    isPending,
    onCardChange,
    onUploadAsset,
}: {
    subjectName?: string | null;
    card: ProblemBodyCard;
    problemId: string;
    revisionId: string;
    isUploadingAsset: boolean;
    isPending: boolean;
    onCardChange: (updater: (card: ProblemBodyCard) => ProblemBodyCard) => void;
    onUploadAsset: (file: File) => Promise<void> | void;
}) {
    const t = useTranslations('ProblemBodyCardEditor');
    const uiPolicy = getProblemBodyCardUiPolicy(subjectName);
    const isUploadCard = card.attachmentKind === 'upload';
    const isTableCard = card.attachmentKind === 'table';
    const isDirectiveCard = isDirectiveKind(card.attachmentKind);
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
                        <Label>{t('bodyLabel')}</Label>
                        <TeXHelpLink />
                    </div>
                    <Textarea
                        value={card.text}
                        onChange={(event) => onCardChange((current) => ({ ...current, text: event.target.value }))}
                        rows={5}
                        placeholder={t('bodyPlaceholder')}
                    />
                </div>
                {uiPolicy.showTextPreview && (
                    <div className="space-y-2">
                        <Label>{t('bodyPreviewLabel')}</Label>
                        <ProblemTextPreview text={card.text} />
                    </div>
                )}
            </div>

            {uiPolicy.allowAttachments && (
                <>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label>{t('attachmentLabel')}</Label>
                            <AttachmentKindSelect
                                value={card.attachmentKind}
                                onChange={(nextKind) => onCardChange((current) => {
                                    let nextAttachmentBlockType: ProblemBodyAttachmentBlockType;
                                    if (nextKind === 'upload') {
                                        nextAttachmentBlockType =
                                            current.attachmentBlockType === 'svg' || current.attachmentBlockType === 'image'
                                                ? current.attachmentBlockType
                                                : 'image';
                                    } else if (nextKind === 'table') {
                                        nextAttachmentBlockType = 'table';
                                    } else if (isDirectiveKind(nextKind)) {
                                        nextAttachmentBlockType = 'directive';
                                    } else {
                                        nextAttachmentBlockType = null;
                                    }

                                    const nextTableData = nextKind === 'table'
                                        && current.tableData.headers.length === 0
                                        ? { headers: ['x', 'y'], rows: [['', '']] }
                                        : current.tableData;

                                    const nextDirectiveSource = isDirectiveKind(nextKind)
                                        ? buildDefaultDirectiveSource(nextKind)
                                        : '';

                                    return {
                                        ...current,
                                        attachmentKind: nextKind,
                                        attachmentBlockType: nextAttachmentBlockType,
                                        assetId: '',
                                        tableData: nextTableData,
                                        directiveSource: nextDirectiveSource,
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
                                        tableData: { headers: [], rows: [] },
                                        directiveSource: '',
                                    }))}
                                >
                                    {t('removeAttachment')}
                                </Button>
                            </div>
                        )}
                    </div>

                    {isTableCard && (
                        <div className="space-y-2">
                            <Label>{t('tableLabel')}</Label>
                            <TableEditor
                                value={card.tableData}
                                onChange={(next) => onCardChange((current) => ({ ...current, tableData: next }))}
                                disabled={isPending}
                            />
                        </div>
                    )}

                    {isDirectiveCard && (
                        <div className="space-y-2">
                            <Label>{t('directiveSettingsLabel')}</Label>
                            <DirectiveForm
                                kind={card.attachmentKind as ProblemBodyDirectiveKind}
                                source={card.directiveSource}
                                onSourceChange={(next) => onCardChange((current) => ({ ...current, directiveSource: next }))}
                            />
                            <div className="space-y-2">
                                <Label>{t('previewLabel')}</Label>
                                <ProblemTextPreview text={card.directiveSource} />
                            </div>
                        </div>
                    )}

                    {isUploadCard && (
                        <div className="space-y-2">
                            <Label>{t('uploadLabel')}</Label>
                            <Input
                                type="file"
                                accept={CARD_UPLOAD_ACCEPT}
                                disabled={!canUploadAsset || isPending || isUploadingAsset}
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
                                <p className="text-xs text-muted-foreground">{t('uploadRequiresDraft')}</p>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
