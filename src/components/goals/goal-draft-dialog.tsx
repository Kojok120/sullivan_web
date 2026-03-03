'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { formatDateKeyLabel, resolveGoalValueForDate, type DraftDialogState, type EditableGoal } from './goal-view-utils';

type GoalDraftDialogProps = {
    draftDialog: DraftDialogState | null;
    goals: EditableGoal[];
    timeZone: string;
    onChange: (next: DraftDialogState | null) => void;
    onApply: (goalId: string, proposals: DraftDialogState['proposals']) => void;
};

export function GoalDraftDialog(props: GoalDraftDialogProps) {
    const { draftDialog, goals, timeZone, onChange, onApply } = props;

    return (
        <Dialog open={!!draftDialog} onOpenChange={(open) => !open && onChange(null)}>
            <DialogContent className="max-h-[82vh] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>AI下書き比較</DialogTitle>
                    <DialogDescription>適用したい日付を選択してください。保存はまだ実行されません。</DialogDescription>
                </DialogHeader>

                {draftDialog ? (
                    <div className="space-y-2">
                        {draftDialog.proposals.map((proposal) => {
                            const goal = goals.find((item) => item.id === draftDialog.goalId);
                            const currentValue = goal
                                ? resolveGoalValueForDate(goal, proposal.dateKey)
                                : { targetCount: null, targetText: null };
                            const checked = draftDialog.selectedDateKeys.includes(proposal.dateKey);

                            return (
                                <label key={proposal.dateKey} className="flex items-start gap-3 rounded-lg border border-border/70 p-3">
                                    <Checkbox
                                        checked={checked}
                                        onCheckedChange={(nextChecked) => {
                                            const isChecked = nextChecked === true;
                                            const nextSelected = isChecked
                                                ? [...draftDialog.selectedDateKeys, proposal.dateKey]
                                                : draftDialog.selectedDateKeys.filter((key) => key !== proposal.dateKey);

                                            onChange({ ...draftDialog, selectedDateKeys: nextSelected });
                                        }}
                                    />
                                    <div className="min-w-0 flex-1 space-y-1">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="text-sm font-semibold">{formatDateKeyLabel(proposal.dateKey, timeZone)}</div>
                                            <Badge variant="outline" className="text-[11px]">提案</Badge>
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            現在値: {currentValue.targetCount !== null ? `${currentValue.targetCount}問` : '-'}
                                            {currentValue.targetText ? ` / ${currentValue.targetText}` : ''}
                                        </div>
                                        <div className="text-xs">
                                            提案値: {proposal.targetCount !== null && proposal.targetCount !== undefined ? `${proposal.targetCount}問` : '-'}
                                            {proposal.targetText ? ` / ${proposal.targetText}` : ''}
                                        </div>
                                    </div>
                                </label>
                            );
                        })}
                    </div>
                ) : null}

                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                            if (!draftDialog) return;
                            const proposals = draftDialog.proposals.filter((proposal) => draftDialog.selectedDateKeys.includes(proposal.dateKey));
                            onApply(draftDialog.goalId, proposals);
                            onChange(null);
                        }}
                    >
                        選択日を適用
                    </Button>
                    <Button
                        type="button"
                        onClick={() => {
                            if (!draftDialog) return;
                            onApply(draftDialog.goalId, draftDialog.proposals);
                            onChange(null);
                        }}
                    >
                        全提案を適用
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
