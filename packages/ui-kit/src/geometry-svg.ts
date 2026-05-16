/**
 * 問題文中の作図記法
 *   `[[geometry vertices="A:0,0;B:5,0;C:3,4" segments="A-B:5;B-C;C-A" angles="A:right;B:60°" circles="O:2.5,2,1.5"]]`
 * を簡易な図形 SVG に展開するユーティリティ。
 *
 * 仕様:
 * - vertices: 必須。`label:x,y` をセミコロン区切り。label は他から参照されるので一意。
 * - segments: 任意。`labelA-labelB[:label]` をセミコロン区切り。両端の label が vertices に存在すること。
 *   `:label` は辺の中点に表示するラベル（長さなど）。
 * - angles: 任意。`vertex[:type[:label]]` をセミコロン区切り。
 *   - type 省略 / `arc` → 角弧
 *   - type `right` → 直角記号
 *   - 2 番目の引数が `right`/`arc` 以外ならラベルとして扱う（例: `B:60°`）。
 * - circles: 任意。`label:cx,cy,r` をセミコロン区切り。label 空可（先頭の `:` を省略可）。
 * - viewBox はすべての頂点・円の bbox を等比でフィット（縦横比を保持）。
 * - 頂点ラベルは図形重心から外側方向に置く簡易ヒューリスティック。
 *
 * サーバ側で文字列 SVG を生成し、`dangerouslySetInnerHTML` で
 * `renderProblemTextHtml` に埋め込む前提。クライアント JS 不要。
 */

export type GeometryVertex = {
    label: string;
    x: number;
    y: number;
};

export type GeometrySegment = {
    from: string;
    to: string;
    /** 辺の中点に表示するラベル（長さなど）。未指定ならラベルなし。 */
    label?: string;
};

export type GeometryAngleMark = 'arc' | 'right';

export type GeometryAngle = {
    /** 対象頂点ラベル（vertices に存在すること）。 */
    vertex: string;
    /**
     * 角を構成する 2 方向の頂点ラベル。指定時は vertex の neighbor として segments を見ず、
     * `from`/`to` 方向で角を描く。3 直線交点など、同一頂点に複数の角を独立して描きたい場合に使う。
     * 旧形式（vertex のみ）では segments から最初に見つかった 2 つの neighbor が使われる。
     */
    from?: string;
    to?: string;
    /** 角を示すマークの種類。 */
    mark: GeometryAngleMark;
    /** 角の中に表示するラベル（角度など）。未指定ならマークだけを描く。 */
    label?: string;
};

export type GeometryCircle = {
    label: string;
    cx: number;
    cy: number;
    r: number;
};

export type GeometryOptions = {
    vertices: GeometryVertex[];
    segments: GeometrySegment[];
    angles: GeometryAngle[];
    circles: GeometryCircle[];
};

// SVG の実サイズはデータの bbox に合わせて動的に決定するが、
// 上限・下限は設けて極端なサイズを防ぐ。
const PIXELS_PER_UNIT = 56;
const MAX_VIEW_DIMENSION = 360;
const MIN_VIEW_DIMENSION = 200;
const PADDING = 28;
const POINT_RADIUS = 3.5;
const LABEL_OFFSET = 12;
const MAX_VERTICES = 32;
const MAX_SEGMENTS = 64;
const MAX_CIRCLES = 8;
const MAX_ANGLES = 16;
const SEGMENT_LABEL_OFFSET = 14;
const ANGLE_ARC_RADIUS = 18;
const ANGLE_RIGHT_SIZE = 12;
const ANGLE_LABEL_OFFSET = 12;

function escapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

type Bounds = { xmin: number; xmax: number; ymin: number; ymax: number };
type Transform = {
    xmin: number;
    ymin: number;
    scale: number;
    offsetX: number;
    offsetY: number;
    viewWidth: number;
    viewHeight: number;
};

function computeBounds(opts: GeometryOptions): Bounds {
    let xmin = Infinity;
    let xmax = -Infinity;
    let ymin = Infinity;
    let ymax = -Infinity;

    for (const v of opts.vertices) {
        if (v.x < xmin) xmin = v.x;
        if (v.x > xmax) xmax = v.x;
        if (v.y < ymin) ymin = v.y;
        if (v.y > ymax) ymax = v.y;
    }
    for (const c of opts.circles) {
        if (c.cx - c.r < xmin) xmin = c.cx - c.r;
        if (c.cx + c.r > xmax) xmax = c.cx + c.r;
        if (c.cy - c.r < ymin) ymin = c.cy - c.r;
        if (c.cy + c.r > ymax) ymax = c.cy + c.r;
    }

    if (!Number.isFinite(xmin)) {
        return { xmin: -1, xmax: 1, ymin: -1, ymax: 1 };
    }
    if (xmin === xmax) { xmin -= 0.5; xmax += 0.5; }
    if (ymin === ymax) { ymin -= 0.5; ymax += 0.5; }
    return { xmin, xmax, ymin, ymax };
}

function computeTransform(bounds: Bounds): Transform {
    const dataW = bounds.xmax - bounds.xmin;
    const dataH = bounds.ymax - bounds.ymin;

    // データのアスペクト比を保ったまま、PIXELS_PER_UNIT を基準スケールにする。
    // 大きすぎる場合は MAX_VIEW_DIMENSION で抑え、ラベル切れを避ける。
    const maxScaleByLimit = Math.min(
        (MAX_VIEW_DIMENSION - 2 * PADDING) / dataW,
        (MAX_VIEW_DIMENSION - 2 * PADDING) / dataH,
    );
    const scale = Math.min(PIXELS_PER_UNIT, maxScaleByLimit);

    let viewWidth = dataW * scale + 2 * PADDING;
    let viewHeight = dataH * scale + 2 * PADDING;

    // 一辺が小さすぎるとラベルが詰まるため、MIN_VIEW_DIMENSION を保証する。
    // 比率は維持し、片方の余白を増やして調整する。
    if (viewWidth < MIN_VIEW_DIMENSION) viewWidth = MIN_VIEW_DIMENSION;
    if (viewHeight < MIN_VIEW_DIMENSION) viewHeight = MIN_VIEW_DIMENSION;

    const usedW = dataW * scale;
    const usedH = dataH * scale;

    return {
        xmin: bounds.xmin,
        ymin: bounds.ymin,
        scale,
        offsetX: (viewWidth - usedW) / 2,
        offsetY: (viewHeight - usedH) / 2,
        viewWidth,
        viewHeight,
    };
}

function project(x: number, y: number, t: Transform): { sx: number; sy: number } {
    return {
        sx: t.offsetX + (x - t.xmin) * t.scale,
        sy: t.viewHeight - (t.offsetY + (y - t.ymin) * t.scale),
    };
}

function formatNumber(value: number): string {
    return Number(value.toFixed(2)).toString();
}

function computeCentroid(vertices: GeometryVertex[]): { x: number; y: number } {
    if (vertices.length === 0) return { x: 0, y: 0 };
    let sx = 0;
    let sy = 0;
    for (const v of vertices) {
        sx += v.x;
        sy += v.y;
    }
    return { x: sx / vertices.length, y: sy / vertices.length };
}

/**
 * SVG マークアップを生成する。失敗時は説明的なエラー span を返す。
 */
export function renderGeometrySvg(opts: GeometryOptions): string {
    if (opts.vertices.length === 0 && opts.circles.length === 0) {
        return `<span class="geometry-error">図形要素が指定されていません</span>`;
    }

    const bounds = computeBounds(opts);
    const transform = computeTransform(bounds);
    const centroid = computeCentroid(opts.vertices);
    const vertexByLabel = new Map(opts.vertices.map((v) => [v.label, v]));

    const centroidScreen = project(centroid.x, centroid.y, transform);

    const segmentMarkup = opts.segments
        .map((seg) => {
            const a = vertexByLabel.get(seg.from);
            const b = vertexByLabel.get(seg.to);
            if (!a || !b) return '';
            const pa = project(a.x, a.y, transform);
            const pb = project(b.x, b.y, transform);
            const lineEl = `<line x1="${formatNumber(pa.sx)}" y1="${formatNumber(pa.sy)}" x2="${formatNumber(pb.sx)}" y2="${formatNumber(pb.sy)}" stroke="#111827" stroke-width="1.5" stroke-linecap="round" />`;
            if (!seg.label) return lineEl;

            // 辺ラベルは中点から「重心の反対側」に少しずらして置く。
            const midX = (pa.sx + pb.sx) / 2;
            const midY = (pa.sy + pb.sy) / 2;
            const dx = pb.sx - pa.sx;
            const dy = pb.sy - pa.sy;
            const len = Math.hypot(dx, dy);
            if (len < 1e-6) return lineEl;
            let nx = -dy / len;
            let ny = dx / len;
            const cx = centroidScreen.sx - midX;
            const cy = centroidScreen.sy - midY;
            if (nx * cx + ny * cy > 0) {
                nx = -nx;
                ny = -ny;
            }
            const lx = midX + nx * SEGMENT_LABEL_OFFSET;
            const ly = midY + ny * SEGMENT_LABEL_OFFSET;
            return `${lineEl}<text x="${formatNumber(lx)}" y="${formatNumber(ly)}" font-size="13" fill="#111827" text-anchor="middle" dominant-baseline="middle">${escapeXml(seg.label)}</text>`;
        })
        .join('');

    const angleMarkup = (opts.angles ?? [])
        .map((angle) => renderAngleMark(angle, vertexByLabel, opts.segments, transform))
        .join('');

    const circleMarkup = opts.circles
        .map((c) => {
            const center = project(c.cx, c.cy, transform);
            const radiusPx = c.r * transform.scale;
            const labelMarkup = c.label
                ? `<text x="${formatNumber(center.sx + 4)}" y="${formatNumber(center.sy - 4)}" font-size="13" fill="#111827">${escapeXml(c.label)}</text>`
                : '';
            return `<circle cx="${formatNumber(center.sx)}" cy="${formatNumber(center.sy)}" r="${formatNumber(radiusPx)}" fill="none" stroke="#111827" stroke-width="1.5" />${labelMarkup}`;
        })
        .join('');

    const vertexMarkup = opts.vertices
        .map((v) => {
            const p = project(v.x, v.y, transform);
            const dx = v.x - centroid.x;
            const dy = v.y - centroid.y;
            const len = Math.hypot(dx, dy);
            const ux = len > 0 ? dx / len : 0;
            const uy = len > 0 ? dy / len : -1;
            const labelX = p.sx + ux * LABEL_OFFSET;
            const labelY = p.sy - uy * LABEL_OFFSET;
            const anchor = ux > 0.3 ? 'start' : ux < -0.3 ? 'end' : 'middle';
            const baseline = uy > 0.3 ? 'baseline' : uy < -0.3 ? 'hanging' : 'middle';
            return `<circle cx="${formatNumber(p.sx)}" cy="${formatNumber(p.sy)}" r="${POINT_RADIUS}" fill="#111827" /><text x="${formatNumber(labelX)}" y="${formatNumber(labelY)}" font-size="14" fill="#111827" text-anchor="${anchor}" dominant-baseline="${baseline}">${escapeXml(v.label)}</text>`;
        })
        .join('');

    const w = formatNumber(transform.viewWidth);
    const h = formatNumber(transform.viewHeight);
    return `<svg class="geometry" xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="図形">${segmentMarkup}${circleMarkup}${angleMarkup}${vertexMarkup}</svg>`;
}

/**
 * 頂点に接続する 2 辺から角度マーク（直角記号 / 角弧）を描く。
 * 接続辺が 2 本未満なら何も描かない。
 */
function renderAngleMark(
    angle: GeometryAngle,
    vertexByLabel: Map<string, GeometryVertex>,
    segments: GeometrySegment[],
    transform: Transform,
): string {
    const vertex = vertexByLabel.get(angle.vertex);
    if (!vertex) return '';

    // from/to 指定時は segments を無視してその 2 頂点で角を描く（3直線交点など）。
    // 未指定時は従来どおり segments から最初の 2 つの neighbor を使う。
    let firstNeighbor: GeometryVertex | undefined;
    let secondNeighbor: GeometryVertex | undefined;
    if (angle.from && angle.to) {
        firstNeighbor = vertexByLabel.get(angle.from);
        secondNeighbor = vertexByLabel.get(angle.to);
    } else {
        for (const seg of segments) {
            let neighbor: GeometryVertex | undefined;
            if (seg.from === angle.vertex) neighbor = vertexByLabel.get(seg.to);
            else if (seg.to === angle.vertex) neighbor = vertexByLabel.get(seg.from);
            if (neighbor) {
                if (!firstNeighbor) firstNeighbor = neighbor;
                else if (!secondNeighbor) { secondNeighbor = neighbor; break; }
            }
        }
    }
    if (!firstNeighbor || !secondNeighbor) return '';

    const vp = project(vertex.x, vertex.y, transform);
    const n1 = project(firstNeighbor.x, firstNeighbor.y, transform);
    const n2 = project(secondNeighbor.x, secondNeighbor.y, transform);

    const v1x = n1.sx - vp.sx;
    const v1y = n1.sy - vp.sy;
    const v2x = n2.sx - vp.sx;
    const v2y = n2.sy - vp.sy;
    const len1 = Math.hypot(v1x, v1y);
    const len2 = Math.hypot(v2x, v2y);
    if (len1 < 1e-6 || len2 < 1e-6) return '';

    const u1x = v1x / len1;
    const u1y = v1y / len1;
    const u2x = v2x / len2;
    const u2y = v2y / len2;

    // 二等分方向（内角側）。180 度の場合は法線を使う。
    let bx = u1x + u2x;
    let by = u1y + u2y;
    let blen = Math.hypot(bx, by);
    if (blen < 1e-6) {
        bx = -u1y;
        by = u1x;
        blen = 1;
    } else {
        bx /= blen;
        by /= blen;
        blen = 1;
    }

    const labelMarkup = (markRadius: number): string => {
        if (!angle.label) return '';
        const lx = vp.sx + (markRadius + ANGLE_LABEL_OFFSET) * bx;
        const ly = vp.sy + (markRadius + ANGLE_LABEL_OFFSET) * by;
        return `<text x="${formatNumber(lx)}" y="${formatNumber(ly)}" font-size="12" fill="#111827" text-anchor="middle" dominant-baseline="middle">${escapeXml(angle.label)}</text>`;
    };

    if (angle.mark === 'right') {
        const d = ANGLE_RIGHT_SIZE;
        const p1x = vp.sx + d * u1x;
        const p1y = vp.sy + d * u1y;
        const p2x = vp.sx + d * (u1x + u2x);
        const p2y = vp.sy + d * (u1y + u2y);
        const p3x = vp.sx + d * u2x;
        const p3y = vp.sy + d * u2y;
        return `<polyline points="${formatNumber(p1x)},${formatNumber(p1y)} ${formatNumber(p2x)},${formatNumber(p2y)} ${formatNumber(p3x)},${formatNumber(p3y)}" fill="none" stroke="#111827" stroke-width="1.2" />${labelMarkup(d)}`;
    }

    // arc
    const r = ANGLE_ARC_RADIUS;
    const startX = vp.sx + r * u1x;
    const startY = vp.sy + r * u1y;
    const endX = vp.sx + r * u2x;
    const endY = vp.sy + r * u2y;
    // SVG 座標系（Y 下向き）で u1→u2 の回転方向を判定。
    // cross > 0 なら画面で時計回り → sweep = 1（角度が増える向き）。
    const cross = u1x * u2y - u1y * u2x;
    const sweep = cross > 0 ? 1 : 0;
    return `<path d="M ${formatNumber(startX)} ${formatNumber(startY)} A ${r} ${r} 0 0 ${sweep} ${formatNumber(endX)} ${formatNumber(endY)}" fill="none" stroke="#111827" stroke-width="1.2" />${labelMarkup(r)}`;
}

function parseVertices(input: string): GeometryVertex[] | null {
    const items = input.split(';').map((s) => s.trim()).filter((s) => s.length > 0);
    if (items.length === 0 || items.length > MAX_VERTICES) return null;
    const vertices: GeometryVertex[] = [];
    const seenLabels = new Set<string>();
    for (const item of items) {
        const colon = item.indexOf(':');
        if (colon <= 0) return null;
        const label = item.slice(0, colon).trim();
        if (!label || seenLabels.has(label)) return null;
        const coords = item.slice(colon + 1).split(',').map((s) => s.trim());
        if (coords.length !== 2) return null;
        const x = Number(coords[0]);
        const y = Number(coords[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        seenLabels.add(label);
        vertices.push({ label, x, y });
    }
    return vertices;
}

function parseSegments(input: string, vertices: GeometryVertex[]): GeometrySegment[] | null {
    const items = input.split(';').map((s) => s.trim()).filter((s) => s.length > 0);
    if (items.length > MAX_SEGMENTS) return null;
    const labelSet = new Set(vertices.map((v) => v.label));
    const segments: GeometrySegment[] = [];
    for (const item of items) {
        // 後ろ側の `:label` を分離（label は from-to 表現に含まれない）。
        const colon = item.indexOf(':');
        const segPart = colon === -1 ? item : item.slice(0, colon);
        const rawLabel = colon === -1 ? '' : item.slice(colon + 1).trim();
        const dash = segPart.indexOf('-');
        if (dash <= 0) return null;
        const from = segPart.slice(0, dash).trim();
        const to = segPart.slice(dash + 1).trim();
        if (!labelSet.has(from) || !labelSet.has(to) || from === to) return null;
        const segment: GeometrySegment = { from, to };
        if (rawLabel) segment.label = rawLabel;
        segments.push(segment);
    }
    return segments;
}

function parseAngles(input: string, vertices: GeometryVertex[]): GeometryAngle[] | null {
    const items = input.split(';').map((s) => s.trim()).filter((s) => s.length > 0);
    if (items.length > MAX_ANGLES) return null;
    const labelSet = new Set(vertices.map((v) => v.label));
    const angles: GeometryAngle[] = [];
    const seen = new Set<string>();
    for (const item of items) {
        const parts = item.split(':').map((s) => s.trim());
        if (parts.length === 0 || parts.length > 3) return null;

        // vertex 部分は `V` か `V/from-to` の 2 形式。後者は同一頂点に複数角を許可する。
        // 既存データに `/` を含む頂点ラベルが残っているケースを壊さないため、
        // 「`V` 部分が既知ラベル、かつ `from-to` の両ラベルも既知ラベル」を満たすときだけ
        // 新構文として解釈する。それ以外は head 全体を頂点ラベルとして扱う。
        const head = parts[0];
        if (!head) return null;
        let vertex = head;
        let from: string | undefined;
        let to: string | undefined;
        const slash = head.indexOf('/');
        if (slash > 0 && slash < head.length - 1 && head.indexOf('/', slash + 1) === -1) {
            const candidateVertex = head.slice(0, slash).trim();
            const fromTo = head.slice(slash + 1).trim();
            const dash = fromTo.indexOf('-');
            if (dash > 0 && dash < fromTo.length - 1) {
                const candidateFrom = fromTo.slice(0, dash).trim();
                const candidateTo = fromTo.slice(dash + 1).trim();
                if (
                    candidateFrom &&
                    candidateTo &&
                    candidateFrom !== candidateTo &&
                    labelSet.has(candidateVertex) &&
                    labelSet.has(candidateFrom) &&
                    labelSet.has(candidateTo)
                ) {
                    vertex = candidateVertex;
                    from = candidateFrom;
                    to = candidateTo;
                }
            }
        }
        if (!vertex || !labelSet.has(vertex)) return null;

        // seen キーは vertex 単体（旧形式）または `V|from-to`（新形式）。
        // 新形式は方向ごとに 1 個までで、旧形式と新形式は別キー扱い。
        const seenKey = from && to ? `${vertex}|${from}-${to}` : vertex;
        if (seen.has(seenKey)) return null;
        seen.add(seenKey);

        let mark: GeometryAngleMark = 'arc';
        let label: string | undefined;
        if (parts.length === 2) {
            const second = parts[1];
            if (second === 'right') mark = 'right';
            else if (second === 'arc') mark = 'arc';
            else if (second.length > 0) label = second;
        } else if (parts.length === 3) {
            const second = parts[1];
            const third = parts[2];
            if (second === 'right') mark = 'right';
            else if (second === 'arc') mark = 'arc';
            else return null;
            if (third.length > 0) label = third;
        }

        const entry: GeometryAngle = { vertex, mark };
        if (from && to) {
            entry.from = from;
            entry.to = to;
        }
        if (label) entry.label = label;
        angles.push(entry);
    }
    return angles;
}

function parseCircles(input: string): GeometryCircle[] | null {
    const items = input.split(';').map((s) => s.trim()).filter((s) => s.length > 0);
    if (items.length > MAX_CIRCLES) return null;
    const circles: GeometryCircle[] = [];
    for (const item of items) {
        const colon = item.indexOf(':');
        let label = '';
        let rest = item;
        if (colon >= 0) {
            label = item.slice(0, colon).trim();
            rest = item.slice(colon + 1).trim();
        }
        const parts = rest.split(',').map((s) => s.trim());
        if (parts.length !== 3) return null;
        const cx = Number(parts[0]);
        const cy = Number(parts[1]);
        const r = Number(parts[2]);
        if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(r) || r <= 0) return null;
        circles.push({ label, cx, cy, r });
    }
    return circles;
}

function parseAttributes(body: string): Map<string, string> | null {
    const result = new Map<string, string>();
    const re = /([A-Za-z_][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|(-?\.?\d[\w.\-]*))/g;
    let match: RegExpExecArray | null;
    let lastIndex = 0;
    while ((match = re.exec(body)) !== null) {
        const key = match[1];
        const value = match[2] ?? match[3] ?? match[4] ?? '';
        result.set(key, value);
        lastIndex = re.lastIndex;
    }
    const tail = body.slice(lastIndex).trim();
    if (tail.length > 0) return null;
    return result;
}

/**
 * `[[geometry ... ]]` の中身（key=value または key="value" の連なり）をパースする。
 * 失敗時は null を返す。
 */
export function parseGeometryDirective(body: string): GeometryOptions | null {
    const attrs = parseAttributes(body);
    if (!attrs) return null;

    const verticesStr = attrs.get('vertices');
    if (verticesStr === undefined) return null;
    const vertices = parseVertices(verticesStr);
    if (!vertices) return null;

    const segmentsStr = attrs.get('segments') ?? '';
    const segments = parseSegments(segmentsStr, vertices);
    if (!segments) return null;

    const anglesStr = attrs.get('angles') ?? '';
    const angles = parseAngles(anglesStr, vertices);
    if (!angles) return null;

    const circlesStr = attrs.get('circles') ?? '';
    const circles = parseCircles(circlesStr);
    if (!circles) return null;

    return { vertices, segments, angles, circles };
}

/**
 * テキスト中の `[[geometry ...]]` を SVG に展開する。
 * パース失敗時は元のテキストをそのまま残す。
 */
export function expandGeometryDirectives(text: string): string {
    const re = /\[\[geometry\s+([^\]]*)\]\]/g;
    return text.replace(re, (full, body: string) => {
        const opts = parseGeometryDirective(body);
        if (!opts) return full;
        return renderGeometrySvg(opts);
    });
}

/**
 * AI 採点用の人間可読サマリ。SVG ではなくテキスト要約を返す。
 */
export function expandGeometryDirectivesAsText(text: string): string {
    const re = /\[\[geometry\s+([^\]]*)\]\]/g;
    return text.replace(re, (full, body: string) => {
        const opts = parseGeometryDirective(body);
        if (!opts) return full;
        return summarizeGeometry(opts);
    });
}

function summarizeGeometry(opts: GeometryOptions): string {
    const lines: string[] = ['[図形]'];
    if (opts.vertices.length > 0) {
        lines.push(
            `頂点: ${opts.vertices.map((v) => `${v.label}(${v.x},${v.y})`).join(', ')}`,
        );
    }
    if (opts.segments.length > 0) {
        lines.push(`線分: ${opts.segments.map((s) => `${s.from}-${s.to}${s.label ? `(${s.label})` : ''}`).join(', ')}`);
    }
    if (opts.angles && opts.angles.length > 0) {
        lines.push(`角: ${opts.angles.map((a) => {
            const mark = a.mark === 'right' ? '直角' : '弧';
            const head = a.from && a.to ? `${a.vertex}(${a.from}-${a.to})` : a.vertex;
            return a.label ? `${head}(${mark}, ${a.label})` : `${head}(${mark})`;
        }).join(', ')}`);
    }
    if (opts.circles.length > 0) {
        lines.push(
            `円: ${opts.circles.map((c) => {
                const head = c.label ? `${c.label}` : '';
                return `${head}(中心(${c.cx},${c.cy}), 半径${c.r})`;
            }).join(', ')}`,
        );
    }
    return lines.join('\n');
}

/**
 * GeometryOptions から DSL 文字列を再構築する（編集 UI で answerTemplate を更新するときに使う）。
 */
export function buildGeometryDirective(opts: GeometryOptions): string {
    const verticesStr = opts.vertices
        .map((v) => `${escapeForAttr(v.label)}:${v.x},${v.y}`)
        .join(';');
    const parts: string[] = [`vertices="${verticesStr}"`];
    if (opts.segments.length > 0) {
        const segStr = opts.segments
            .map((s) => {
                const base = `${escapeForAttr(s.from)}-${escapeForAttr(s.to)}`;
                return s.label ? `${base}:${escapeForAttr(s.label)}` : base;
            })
            .join(';');
        parts.push(`segments="${segStr}"`);
    }
    if (opts.angles && opts.angles.length > 0) {
        const angleStr = opts.angles
            .map((a) => {
                const v = a.from && a.to
                    ? `${escapeForAttr(a.vertex)}/${escapeForAttr(a.from)}-${escapeForAttr(a.to)}`
                    : escapeForAttr(a.vertex);
                if (a.mark === 'right' && a.label) return `${v}:right:${escapeForAttr(a.label)}`;
                if (a.mark === 'right') return `${v}:right`;
                if (a.label) return `${v}:${escapeForAttr(a.label)}`;
                return v;
            })
            .join(';');
        parts.push(`angles="${angleStr}"`);
    }
    if (opts.circles.length > 0) {
        const circleStr = opts.circles
            .map((c) => {
                const head = c.label ? `${escapeForAttr(c.label)}:` : '';
                return `${head}${c.cx},${c.cy},${c.r}`;
            })
            .join(';');
        parts.push(`circles="${circleStr}"`);
    }
    return `[[geometry ${parts.join(' ')}]]`;
}

function escapeForAttr(value: string): string {
    // ダブルクォートとセミコロン/カンマ/コロン/ハイフンは DSL の区切り文字なのでサニタイズ
    return value.replace(/[",;:\-]/g, '');
}

export {
    MAX_VERTICES as GEOMETRY_MAX_VERTICES,
    MAX_SEGMENTS as GEOMETRY_MAX_SEGMENTS,
    MAX_CIRCLES as GEOMETRY_MAX_CIRCLES,
    MAX_ANGLES as GEOMETRY_MAX_ANGLES,
};
