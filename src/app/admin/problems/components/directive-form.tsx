'use client';

import { useState } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parseCoordPlaneDirective } from '@/lib/coord-plane-svg';
import { parseGeometryDirective } from '@/lib/geometry-svg';
import { parseNumberLineDirective, type NumberLineMark } from '@/lib/number-line-svg';
import type { ProblemBodyDirectiveKind } from '@/lib/problem-editor-model';
import { buildSolidDirective, parseSolidDirective } from '@/lib/solid-svg';

/**
 * 数直線 / 座標平面 / 図形 の DSL を form ベースで編集するための共通コンポーネント。
 * 解答欄エディタと本文カードエディタの両方から利用する。
 *
 * - source は完全な `[[numberline ...]]` などの DSL 文字列
 * - kind 切替は親側で行い、空 source のときは kind に応じたデフォルトを差し込む想定
 */
type DirectiveFormProps = {
    kind: ProblemBodyDirectiveKind;
    source: string;
    onSourceChange: (next: string) => void;
};

export function DirectiveForm({ kind, source, onSourceChange }: DirectiveFormProps) {
    if (kind === 'numberline') {
        return <NumberLineForm source={source} onSourceChange={onSourceChange} />;
    }

    if (kind === 'coordplane') {
        return <CoordPlaneForm source={source} onSourceChange={onSourceChange} />;
    }

    if (kind === 'solid') {
        return <SolidForm source={source} onSourceChange={onSourceChange} />;
    }

    return <GeometryForm source={source} onSourceChange={onSourceChange} />;
}

const DEFAULT_SOLID_SOURCE = '[[solid kind="cube" size=4]]';

/**
 * solid DSL は kind ごとに必須属性が異なるため、まずは raw テキスト編集で対応する。
 * 入力中の値が valid な solid DSL であれば onSourceChange に流す。
 */
function SolidForm({ source, onSourceChange }: FormProps) {
    const [draft, setDraft] = useState(() => source || DEFAULT_SOLID_SOURCE);
    const [prevSource, setPrevSource] = useState(source);
    if (source !== prevSource) {
        setPrevSource(source);
        setDraft(source || DEFAULT_SOLID_SOURCE);
    }

    const update = (next: string) => {
        setDraft(next);
        const trimmed = next.trim();
        if (!trimmed.startsWith('[[solid ') || !trimmed.endsWith(']]')) return;
        const body = trimmed.slice('[[solid '.length, -2);
        const opts = parseSolidDirective(body);
        if (opts) onSourceChange(buildSolidDirective(opts));
    };

    return (
        <div className="space-y-2 rounded-md border p-4">
            <Label className="text-xs">立体 DSL（[[solid kind=&quot;...&quot; ...]]）</Label>
            <Input
                value={draft}
                onChange={(event) => update(event.target.value)}
                placeholder='例: [[solid kind="cube" size=4 diagonal=true]]'
            />
            <p className="text-xs text-muted-foreground">
                kind: rect-prism / cube / cylinder / cone / sphere / hemisphere / square-pyramid / tri-prism / rotation
            </p>
        </div>
    );
}

type FormProps = {
    source: string;
    onSourceChange: (next: string) => void;
};

type NumberLineState = {
    min: string;
    max: string;
    marks: string;
};

const DEFAULT_NUMBERLINE: NumberLineState = { min: '-5', max: '5', marks: '' };

function NumberLineForm({ source, onSourceChange }: FormProps) {
    // 親の source は常に valid な DSL である前提で、ローカル draft（編集中の生文字列）
    // を別途保持する。これがないと「-」だけ入力した瞬間に buildNumberLineDsl('') が
    // 返って source が空になり、再 parse 時に DEFAULT_NUMBERLINE に戻ってしまう。
    // 親 source が外部から差し替わった場合は draft をリセット（render 中に setState する
    // React 公式の「prop 変化に追従」パターン: useEffect ではなく前回値と比較する）。
    const [draft, setDraft] = useState<NumberLineState>(() => parseExistingNumberLine(source) ?? DEFAULT_NUMBERLINE);
    const [prevSource, setPrevSource] = useState(source);
    if (source !== prevSource) {
        setPrevSource(source);
        setDraft(parseExistingNumberLine(source) ?? DEFAULT_NUMBERLINE);
    }

    const update = (patch: Partial<NumberLineState>) => {
        const next = { ...draft, ...patch };
        setDraft(next);
        const dsl = buildNumberLineDsl(next);
        if (dsl) onSourceChange(dsl);
    };

    const state = draft;

    return (
        <div className="space-y-3 rounded-md border p-4">
            <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                    <Label className="text-xs">最小値</Label>
                    <Input
                        value={state.min}
                        onChange={(event) => update({ min: event.target.value })}
                        inputMode="numeric"
                    />
                </div>
                <div className="space-y-1">
                    <Label className="text-xs">最大値</Label>
                    <Input
                        value={state.max}
                        onChange={(event) => update({ max: event.target.value })}
                        inputMode="numeric"
                    />
                </div>
                <div className="space-y-1">
                    <Label className="text-xs">マーク（任意）</Label>
                    <Input
                        value={state.marks}
                        onChange={(event) => update({ marks: event.target.value })}
                        placeholder="例: A:-3,B:2,C:4.5"
                    />
                </div>
            </div>
        </div>
    );
}

type CoordPlaneState = {
    xmin: string;
    xmax: string;
    ymin: string;
    ymax: string;
    points: string;
    curves: string;
    lines: string;
};

const DEFAULT_COORDPLANE: CoordPlaneState = {
    xmin: '-5', xmax: '5', ymin: '-5', ymax: '5',
    points: '', curves: '', lines: '',
};

function CoordPlaneForm({ source, onSourceChange }: FormProps) {
    const [draft, setDraft] = useState<CoordPlaneState>(() => parseExistingCoordPlane(source) ?? DEFAULT_COORDPLANE);
    const [prevSource, setPrevSource] = useState(source);
    if (source !== prevSource) {
        setPrevSource(source);
        setDraft(parseExistingCoordPlane(source) ?? DEFAULT_COORDPLANE);
    }

    const update = (patch: Partial<CoordPlaneState>) => {
        const next = { ...draft, ...patch };
        setDraft(next);
        const dsl = buildCoordPlaneDsl(next);
        if (dsl) onSourceChange(dsl);
    };

    const state = draft;

    return (
        <div className="space-y-3 rounded-md border p-4">
            <div className="grid gap-3 md:grid-cols-4">
                {(['xmin', 'xmax', 'ymin', 'ymax'] as const).map((key) => (
                    <div key={key} className="space-y-1">
                        <Label className="text-xs">{key}</Label>
                        <Input
                            value={state[key]}
                            onChange={(event) => update({ [key]: event.target.value })}
                            inputMode="numeric"
                        />
                    </div>
                ))}
            </div>
            <div className="space-y-1">
                <Label className="text-xs">点（任意 / セミコロン区切り）</Label>
                <Input
                    value={state.points}
                    onChange={(event) => update({ points: event.target.value })}
                    placeholder='例: P:4,3;Q:-2,1'
                />
            </div>
            <div className="space-y-1">
                <Label className="text-xs">曲線（任意 / y=式 をセミコロン区切り）</Label>
                <Input
                    value={state.curves}
                    onChange={(event) => update({ curves: event.target.value })}
                    placeholder='例: y=x^2;y=6/x'
                />
            </div>
            <div className="space-y-1">
                <Label className="text-xs">直線（任意 / x=数値 または y=数値）</Label>
                <Input
                    value={state.lines}
                    onChange={(event) => update({ lines: event.target.value })}
                    placeholder='例: x=2;y=-1'
                />
            </div>
        </div>
    );
}

type GeometryState = {
    vertices: string;
    segments: string;
    angles: string;
    circles: string;
};

const DEFAULT_GEOMETRY: GeometryState = {
    vertices: 'A:0,0;B:4,0;C:2,3',
    segments: 'A-B;B-C;C-A',
    angles: '',
    circles: '',
};

function GeometryForm({ source, onSourceChange }: FormProps) {
    const [draft, setDraft] = useState<GeometryState>(() => parseExistingGeometry(source) ?? DEFAULT_GEOMETRY);
    const [prevSource, setPrevSource] = useState(source);
    if (source !== prevSource) {
        setPrevSource(source);
        setDraft(parseExistingGeometry(source) ?? DEFAULT_GEOMETRY);
    }

    const update = (patch: Partial<GeometryState>) => {
        const next = { ...draft, ...patch };
        setDraft(next);
        const dsl = buildGeometryDsl(next);
        if (dsl) onSourceChange(dsl);
    };

    const state = draft;

    return (
        <div className="space-y-3 rounded-md border p-4">
            <div className="space-y-1">
                <Label className="text-xs">頂点（label:x,y をセミコロン区切り）</Label>
                <Input
                    value={state.vertices}
                    onChange={(event) => update({ vertices: event.target.value })}
                    placeholder="例: A:0,0;B:4,0;C:2,3"
                />
            </div>
            <div className="space-y-1">
                <Label className="text-xs">線分（label-label[:辺ラベル] をセミコロン区切り）</Label>
                <Input
                    value={state.segments}
                    onChange={(event) => update({ segments: event.target.value })}
                    placeholder="例: A-B:5;B-C:4;C-A:3"
                />
            </div>
            <div className="space-y-1">
                <Label className="text-xs">角度（任意 / 頂点[/from-to][:right|:角ラベル] をセミコロン区切り）</Label>
                <Input
                    value={state.angles}
                    onChange={(event) => update({ angles: event.target.value })}
                    placeholder="例: A:right;B:60°;O/A-B:30°"
                />
            </div>
            <div className="space-y-1">
                <Label className="text-xs">円（任意 / label:cx,cy,r をセミコロン区切り）</Label>
                <Input
                    value={state.circles}
                    onChange={(event) => update({ circles: event.target.value })}
                    placeholder="例: O:0,0,2"
                />
            </div>
        </div>
    );
}

function parseExistingNumberLine(source: string): NumberLineState | null {
    const trimmed = source.trim();
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

function parseExistingCoordPlane(source: string): CoordPlaneState | null {
    const trimmed = source.trim();
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

function parseExistingGeometry(source: string): GeometryState | null {
    const trimmed = source.trim();
    if (!trimmed.startsWith('[[geometry ') || !trimmed.endsWith(']]')) return null;
    const body = trimmed.slice('[[geometry '.length, -2);
    const opts = parseGeometryDirective(body);
    if (!opts) return null;
    return {
        vertices: opts.vertices.map((v) => `${v.label}:${v.x},${v.y}`).join(';'),
        segments: opts.segments
            .map((s) => `${s.from}-${s.to}${s.label ? `:${s.label}` : ''}`)
            .join(';'),
        angles: opts.angles
            .map((a) => {
                // vertex/from-to 形式の場合は新構文を再構築する。
                const head = a.from && a.to ? `${a.vertex}/${a.from}-${a.to}` : a.vertex;
                if (a.mark === 'right' && a.label) return `${head}:right:${a.label}`;
                if (a.mark === 'right') return `${head}:right`;
                if (a.label) return `${head}:${a.label}`;
                return head;
            })
            .join(';'),
        circles: opts.circles
            .map((c) => `${c.label ? `${c.label}:` : ''}${c.cx},${c.cy},${c.r}`)
            .join(';'),
    };
}

function buildGeometryDsl(state: GeometryState): string {
    const vertices = state.vertices.trim();
    const segments = state.segments.trim();
    const angles = state.angles.trim();
    const circles = state.circles.trim();
    if (!vertices && !circles) return '';

    const sanitize = (value: string) => value.replace(/"/g, '').trim();
    const parts: string[] = [];
    if (vertices) parts.push(`vertices="${sanitize(vertices)}"`);
    if (segments) parts.push(`segments="${sanitize(segments)}"`);
    if (angles) parts.push(`angles="${sanitize(angles)}"`);
    if (circles) parts.push(`circles="${sanitize(circles)}"`);
    return `[[geometry ${parts.join(' ')}]]`;
}

/**
 * kind 切替時に空 source からデフォルト DSL を生成するためのヘルパ。
 */
export function buildDefaultDirectiveSource(kind: ProblemBodyDirectiveKind): string {
    switch (kind) {
        case 'numberline':
            return buildNumberLineDsl(DEFAULT_NUMBERLINE);
        case 'coordplane':
            return buildCoordPlaneDsl(DEFAULT_COORDPLANE);
        case 'geometry':
            return buildGeometryDsl(DEFAULT_GEOMETRY);
        case 'solid':
            return DEFAULT_SOLID_SOURCE;
    }
}
