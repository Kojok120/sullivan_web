'use client';

import { useEffect, useState } from 'react';

import { TableEditor } from '@/components/problem-authoring/table-editor';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    buildAnswerTableDirective,
    parseAnswerTableDirective,
    type AnswerTableOptions,
} from '@/lib/answer-table-svg';
import { parseCoordPlaneDirective } from '@/lib/coord-plane-svg';
import { parseNumberLineDirective, type NumberLineMark } from '@/lib/number-line-svg';

import { ProblemTextPreview } from './problem-text-preview';

export type AnswerTemplateKind = 'none' | 'numberline' | 'table' | 'coordplane';

type AnswerFieldEditorProps = {
    onProblemTypeChange: (next: string) => void;
    answerTemplate: string;
    onAnswerTemplateChange: (next: string) => void;
};

/**
 * 解答欄テンプレ種別から問題形式 (problemType) を導出する。
 * 解答欄UIの「形式」と「テンプレ」を 1 つの選択にまとめるためのマッピング。
 */
function mapKindToProblemType(kind: AnswerTemplateKind): string {
    if (kind === 'coordplane') return 'GRAPH_DRAW';
    return 'SHORT_TEXT';
}

type NumberLineState = {
    min: string;
    max: string;
    marks: string;
};

type CoordPlaneState = {
    xmin: string;
    xmax: string;
    ymin: string;
    ymax: string;
    points: string;
    curves: string;
    lines: string;
};

const DEFAULT_NUMBERLINE: NumberLineState = { min: '-5', max: '5', marks: '' };
const DEFAULT_COORDPLANE: CoordPlaneState = {
    xmin: '-5', xmax: '5', ymin: '-5', ymax: '5',
    points: '', curves: '', lines: '',
};
const DEFAULT_TABLE: AnswerTableOptions = {
    headers: ['x', 'y'],
    cells: [['', ''], ['', ''], ['', '']],
};

function detectKind(answerTemplate: string): AnswerTemplateKind {
    const trimmed = answerTemplate.trim();
    if (trimmed.length === 0) return 'none';
    if (trimmed.startsWith('[[numberline ') && trimmed.endsWith(']]')) {
        const body = trimmed.slice('[[numberline '.length, -2);
        if (parseNumberLineDirective(body)) return 'numberline';
    }
    if (trimmed.startsWith('[[answertable ') && trimmed.endsWith(']]')) {
        const body = trimmed.slice('[[answertable '.length, -2);
        if (parseAnswerTableDirective(body)) return 'table';
    }
    if (trimmed.startsWith('[[coordplane ') && trimmed.endsWith(']]')) {
        const body = trimmed.slice('[[coordplane '.length, -2);
        if (parseCoordPlaneDirective(body)) return 'coordplane';
    }
    return 'none';
}

function parseExistingNumberLine(answerTemplate: string): NumberLineState | null {
    const trimmed = answerTemplate.trim();
    if (!trimmed.startsWith('[[numberline ') || !trimmed.endsWith(']]')) return null;
    const body = trimmed.slice('[[numberline '.length, -2);
    const opts = parseNumberLineDirective(body);
    if (!opts) return null;
    return {
        min: String(opts.min),
        max: String(opts.max),
        marks: serializeMarks(opts.marks),
    };
}

function serializeMarks(marks: NumberLineMark[]): string {
    return marks.map((m) => (m.label ? `${m.label}:${m.value}` : String(m.value))).join(',');
}

function parseExistingTable(answerTemplate: string): AnswerTableOptions | null {
    const trimmed = answerTemplate.trim();
    if (!trimmed.startsWith('[[answertable ') || !trimmed.endsWith(']]')) return null;
    const body = trimmed.slice('[[answertable '.length, -2);
    return parseAnswerTableDirective(body);
}

function parseExistingCoordPlane(answerTemplate: string): CoordPlaneState | null {
    const trimmed = answerTemplate.trim();
    if (!trimmed.startsWith('[[coordplane ') || !trimmed.endsWith(']]')) return null;
    const body = trimmed.slice('[[coordplane '.length, -2);
    const opts = parseCoordPlaneDirective(body);
    if (!opts) return null;
    return {
        xmin: String(opts.xmin),
        xmax: String(opts.xmax),
        ymin: String(opts.ymin),
        ymax: String(opts.ymax),
        points: opts.points
            .map((p) => (p.label ? `${p.label}:${p.x},${p.y}` : `${p.x},${p.y}`))
            .join(';'),
        curves: opts.curves.map((c) => `y=${c.expression}`).join(';'),
        lines: opts.lines.map((l) => `${l.axis}=${l.value}`).join(';'),
    };
}

function buildNumberLineDsl(state: NumberLineState): string {
    const min = Number(state.min);
    const max = Number(state.max);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return '';
    const marks = state.marks.trim();
    if (marks) {
        return `[[numberline min=${min} max=${max} marks="${marks.replace(/"/g, '')}"]]`;
    }
    return `[[numberline min=${min} max=${max}]]`;
}

function buildCoordPlaneDsl(state: CoordPlaneState): string {
    const xmin = Number(state.xmin);
    const xmax = Number(state.xmax);
    const ymin = Number(state.ymin);
    const ymax = Number(state.ymax);
    if (
        !Number.isFinite(xmin) || !Number.isFinite(xmax) || xmin >= xmax
        || !Number.isFinite(ymin) || !Number.isFinite(ymax) || ymin >= ymax
    ) return '';

    const parts = [`xmin=${xmin}`, `xmax=${xmax}`, `ymin=${ymin}`, `ymax=${ymax}`];
    const sanitize = (value: string) => value.replace(/"/g, '').trim();
    if (state.points.trim()) parts.push(`points="${sanitize(state.points)}"`);
    if (state.curves.trim()) parts.push(`curves="${sanitize(state.curves)}"`);
    if (state.lines.trim()) parts.push(`lines="${sanitize(state.lines)}"`);
    return `[[coordplane ${parts.join(' ')}]]`;
}

export function AnswerFieldEditor({
    onProblemTypeChange,
    answerTemplate,
    onAnswerTemplateChange,
}: AnswerFieldEditorProps) {
    const [kind, setKind] = useState<AnswerTemplateKind>(() => detectKind(answerTemplate));
    const [numberLine, setNumberLine] = useState<NumberLineState>(() => parseExistingNumberLine(answerTemplate) ?? DEFAULT_NUMBERLINE);
    const [coordPlane, setCoordPlane] = useState<CoordPlaneState>(() => parseExistingCoordPlane(answerTemplate) ?? DEFAULT_COORDPLANE);
    const [tableValue, setTableValue] = useState<AnswerTableOptions>(() => parseExistingTable(answerTemplate) ?? DEFAULT_TABLE);

    useEffect(() => {
        const detected = detectKind(answerTemplate);
        if (detected === kind) return;

        setKind(detected);
        if (detected === 'numberline') {
            const parsed = parseExistingNumberLine(answerTemplate);
            if (parsed) setNumberLine(parsed);
        } else if (detected === 'table') {
            const parsed = parseExistingTable(answerTemplate);
            if (parsed) setTableValue(parsed);
        } else if (detected === 'coordplane') {
            const parsed = parseExistingCoordPlane(answerTemplate);
            if (parsed) setCoordPlane(parsed);
        }
        // detect 結果が同じならローカル編集中なのでそのままにする
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [answerTemplate]);

    const handleKindChange = (next: AnswerTemplateKind) => {
        setKind(next);
        onProblemTypeChange(mapKindToProblemType(next));
        if (next === 'none') {
            onAnswerTemplateChange('');
        } else if (next === 'numberline') {
            onAnswerTemplateChange(buildNumberLineDsl(numberLine));
        } else if (next === 'table') {
            onAnswerTemplateChange(buildAnswerTableDirective(tableValue));
        } else if (next === 'coordplane') {
            onAnswerTemplateChange(buildCoordPlaneDsl(coordPlane));
        }
    };

    const handleNumberLineChange = (patch: Partial<NumberLineState>) => {
        const next = { ...numberLine, ...patch };
        setNumberLine(next);
        // 「-」だけ入力した瞬間など、過渡的に invalid な間は親への伝搬を止める。
        // これがないと親の answerTemplate が空に戻り、useEffect が kind を 'none' に
        // 巻き戻して数直線エディタが画面から消えてしまう（負値入力を遮るバグ）。
        const dsl = buildNumberLineDsl(next);
        if (dsl) onAnswerTemplateChange(dsl);
    };

    const handleCoordPlaneChange = (patch: Partial<CoordPlaneState>) => {
        const next = { ...coordPlane, ...patch };
        setCoordPlane(next);
        const dsl = buildCoordPlaneDsl(next);
        if (dsl) onAnswerTemplateChange(dsl);
    };

    const handleTableChange = (next: AnswerTableOptions) => {
        setTableValue(next);
        onAnswerTemplateChange(buildAnswerTableDirective(next));
    };

    return (
        <div className="space-y-6">
            <div className="space-y-2 max-w-sm">
                <Label>形式</Label>
                <Select value={kind} onValueChange={(value) => handleKindChange(value as AnswerTemplateKind)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">短い記述</SelectItem>
                        <SelectItem value="numberline">数直線</SelectItem>
                        <SelectItem value="table">表</SelectItem>
                        <SelectItem value="coordplane">座標平面</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {kind === 'numberline' && (
                <div className="space-y-3 rounded-md border p-4">
                    <div className="grid gap-3 md:grid-cols-3">
                        <div className="space-y-1">
                            <Label className="text-xs">最小値</Label>
                            <Input
                                value={numberLine.min}
                                onChange={(event) => handleNumberLineChange({ min: event.target.value })}
                                inputMode="numeric"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">最大値</Label>
                            <Input
                                value={numberLine.max}
                                onChange={(event) => handleNumberLineChange({ max: event.target.value })}
                                inputMode="numeric"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">マーク（任意）</Label>
                            <Input
                                value={numberLine.marks}
                                onChange={(event) => handleNumberLineChange({ marks: event.target.value })}
                                placeholder="例: A:-3,B:2,C:4.5"
                            />
                        </div>
                    </div>
                </div>
            )}

            {kind === 'table' && (
                <div className="space-y-3 rounded-md border p-4">
                    <p className="text-xs text-muted-foreground">
                        セルを空にすると生徒が手書きで埋める空欄になります。値を入力するとプリント時にそのまま表示されます。
                    </p>
                    <TableEditor
                        value={{ headers: tableValue.headers, rows: tableValue.cells }}
                        onChange={(next) => handleTableChange({ headers: next.headers, cells: next.rows })}
                    />
                </div>
            )}

            {kind === 'coordplane' && (
                <div className="space-y-3 rounded-md border p-4">
                    <div className="grid gap-3 md:grid-cols-4">
                        {(['xmin', 'xmax', 'ymin', 'ymax'] as const).map((key) => (
                            <div key={key} className="space-y-1">
                                <Label className="text-xs">{key}</Label>
                                <Input
                                    value={coordPlane[key]}
                                    onChange={(event) => handleCoordPlaneChange({ [key]: event.target.value })}
                                    inputMode="numeric"
                                />
                            </div>
                        ))}
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">点（任意 / セミコロン区切り）</Label>
                        <Input
                            value={coordPlane.points}
                            onChange={(event) => handleCoordPlaneChange({ points: event.target.value })}
                            placeholder='例: P:4,3;Q:-2,1'
                        />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">曲線（任意 / y=式 をセミコロン区切り）</Label>
                        <Input
                            value={coordPlane.curves}
                            onChange={(event) => handleCoordPlaneChange({ curves: event.target.value })}
                            placeholder='例: y=x^2;y=6/x'
                        />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">直線（任意 / x=数値 または y=数値）</Label>
                        <Input
                            value={coordPlane.lines}
                            onChange={(event) => handleCoordPlaneChange({ lines: event.target.value })}
                            placeholder='例: x=2;y=-1'
                        />
                    </div>
                </div>
            )}

            {kind !== 'none' && (
                <div className="space-y-2">
                    <Label>解答欄プレビュー</Label>
                    <ProblemTextPreview
                        text={answerTemplate}
                        emptyMessage="解答欄テンプレートを設定するとプレビューが出ます。"
                    />
                </div>
            )}
        </div>
    );
}
