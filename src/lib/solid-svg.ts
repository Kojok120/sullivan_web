/**
 * 問題文中の立体記法
 *   `[[solid kind="rect-prism" w=3 h=4 d=6]]`
 *   `[[solid kind="cube" size=4 diagonal=true labels="A,B,C,D,E,F,G,H"]]`
 *   `[[solid kind="cylinder" r=2 h=5]]`
 *   `[[solid kind="cone" r=4 h=9]]`
 *   `[[solid kind="sphere" r=6]]`
 *   `[[solid kind="hemisphere" r=9]]`
 *   `[[solid kind="square-pyramid" w=4 d=4 h=6]]`
 *   `[[solid kind="tri-prism" base="3,4,5" h=6]]`
 *   `[[solid kind="rotation" shape="rectangle" w=6 h=9]]`
 * を 2D 投影 SVG に展開するユーティリティ。
 *
 * 投影方式:
 * - 直方体/立方体/角柱/角錐: 斜投影（cabinet projection）。後面を depth × cos(30°) × 0.5 等
 *   シフトし、後面の隠れ辺は破線で描く。
 * - 円柱/円錐: 上下/底面 ellipse + 母線。底面 ellipse の奥半分は破線。
 * - 球: 円 + 赤道 ellipse 破線 + 経度 ellipse 破線。
 * - 半球: 半円 + 平らな底（ellipse 半分）。
 * - 回転体: 元の 2D 形を破線、軸 ℓ、回転体（円柱/円錐）を実線で重ね描画。
 *
 * サーバ側で文字列 SVG を生成し、`dangerouslySetInnerHTML` で
 * `renderProblemTextHtml` に埋め込む前提。クライアント JS 不要。
 */

export type SolidKind =
    | 'rect-prism'
    | 'cube'
    | 'cylinder'
    | 'cone'
    | 'sphere'
    | 'hemisphere'
    | 'square-pyramid'
    | 'tri-prism'
    | 'rotation';

export type SolidRotationShape = 'rectangle' | 'triangle';

/** 立体描画用パラメータの統合型。kind ごとに使うフィールドが異なる。 */
export type SolidOptions = {
    kind: SolidKind;
    /** 直方体: 横, 立方体: 未使用, 角錐: 底面横, 回転体(rectangle): 横 */
    w?: number;
    /** 直方体: 高さ, 円柱/円錐: 高さ, 角錐: 高さ, 回転体: 高さ */
    h?: number;
    /** 直方体: 奥行, 角錐: 奥行 */
    d?: number;
    /** 立方体の一辺 */
    size?: number;
    /** 円柱/円錐/球/半球の半径 */
    r?: number;
    /** 円錐の母線（h と排他、両方指定可） */
    slant?: number;
    /** 三角柱底面の 3 辺長 [a, b, c] */
    base?: [number, number, number];
    /** 回転体の元 2D 形 */
    shape?: SolidRotationShape;
    /** 三角形回転体の底辺 */
    b?: number;
    /** 立方体/直方体の空間対角線を点線で描画 */
    diagonal?: boolean;
    /** 円柱/球で `d=2r` ラベル表示 */
    showDiameter?: boolean;
    /** 円錐の母線ラベル表示 */
    showSlant?: boolean;
    /** 頂点ラベル（rect-prism, cube, square-pyramid, tri-prism 等で使用） */
    labels?: string[];
};

// 描画寸法と上下限
const MAX_VIEW_DIMENSION = 360;
const MIN_VIEW_DIMENSION = 200;
const PADDING = 28;
const PIXELS_PER_UNIT = 24;
const STROKE_COLOR = '#111827';
const DASH_PATTERN = '4 3';
const LABEL_FONT_SIZE = 12;
const VERTEX_FONT_SIZE = 13;

// 斜投影の奥行きシフト係数（cabinet projection: 30 度方向, 縮尺 0.5）
const OBLIQUE_ANGLE = Math.PI / 6;
const OBLIQUE_SCALE = 0.5;
const OBLIQUE_DX = Math.cos(OBLIQUE_ANGLE) * OBLIQUE_SCALE;
const OBLIQUE_DY = Math.sin(OBLIQUE_ANGLE) * OBLIQUE_SCALE;

// 円柱・円錐・球の奥行き楕円縦比
const ELLIPSE_RY_RATIO = 1 / 3;
const SPHERE_EQUATOR_RATIO = 1 / 4;
const SPHERE_MERIDIAN_RATIO = 1 / 4;

const MAX_LABELS = 16;
const MAX_DIMENSION_VALUE = 1000;

function escapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatNumber(value: number): string {
    if (Number.isInteger(value)) return String(value);
    return Number(value.toFixed(2)).toString();
}

/** 寸法ラベル文字列を生成。整数なら "3cm"、小数なら "2.5cm"。 */
function dimText(value: number): string {
    return `${formatNumber(value)}cm`;
}

/** 数値属性として安全な正値かを検証する。 */
function isPositiveDimension(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MAX_DIMENSION_VALUE;
}

/* ----------------------------- 属性パーサ ----------------------------- */

function parseAttributes(body: string): Map<string, string> | null {
    const result = new Map<string, string>();
    const re = /([A-Za-z_][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+))/g;
    let match: RegExpExecArray | null;
    let lastIndex = 0;
    while ((match = re.exec(body)) !== null) {
        const between = body.slice(lastIndex, match.index);
        if (between.trim().length > 0) return null;
        const key = match[1];
        const value = match[2] ?? match[3] ?? match[4] ?? '';
        result.set(key, value);
        lastIndex = re.lastIndex;
    }
    const tail = body.slice(lastIndex).trim();
    if (tail.length > 0) return null;
    return result;
}

function parseBool(raw: string | undefined): boolean {
    if (!raw) return false;
    const v = raw.trim().toLowerCase();
    return v === 'true' || v === '1' || v === 'yes';
}

function parseNumberAttr(raw: string | undefined): number | null {
    if (raw === undefined) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
}

function parseLabels(raw: string | undefined): string[] | null {
    if (raw === undefined || raw.trim() === '') return [];
    const items = raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    if (items.length === 0 || items.length > MAX_LABELS) return null;
    return items;
}

function parseBaseTuple(raw: string | undefined): [number, number, number] | null {
    if (raw === undefined) return null;
    const parts = raw.split(',').map((s) => s.trim());
    if (parts.length !== 3) return null;
    const nums = parts.map((p) => Number(p));
    if (!nums.every((n) => Number.isFinite(n) && n > 0 && n <= MAX_DIMENSION_VALUE)) return null;
    // 三角不等式
    const [a, b, c] = nums;
    if (a + b <= c || a + c <= b || b + c <= a) return null;
    return [a, b, c];
}

/**
 * `[[solid ...]]` の中身（key=value または key="value" の連なり）をパースする。
 * 失敗時は null を返す。
 */
export function parseSolidDirective(body: string): SolidOptions | null {
    const attrs = parseAttributes(body);
    if (!attrs) return null;

    const kindStr = attrs.get('kind');
    if (!kindStr) return null;
    const kind = kindStr as SolidKind;
    if (![
        'rect-prism', 'cube', 'cylinder', 'cone', 'sphere',
        'hemisphere', 'square-pyramid', 'tri-prism', 'rotation',
    ].includes(kind)) {
        return null;
    }

    const w = parseNumberAttr(attrs.get('w'));
    const h = parseNumberAttr(attrs.get('h'));
    const d = parseNumberAttr(attrs.get('d'));
    const size = parseNumberAttr(attrs.get('size'));
    const r = parseNumberAttr(attrs.get('r'));
    const slant = parseNumberAttr(attrs.get('slant'));
    const b = parseNumberAttr(attrs.get('b'));
    const base = parseBaseTuple(attrs.get('base'));
    const shapeRaw = attrs.get('shape');
    const labels = parseLabels(attrs.get('labels'));
    if (labels === null) return null;

    const opts: SolidOptions = { kind };
    if (w !== null) opts.w = w;
    if (h !== null) opts.h = h;
    if (d !== null) opts.d = d;
    if (size !== null) opts.size = size;
    if (r !== null) opts.r = r;
    if (slant !== null) opts.slant = slant;
    if (b !== null) opts.b = b;
    if (base) opts.base = base;
    if (labels.length > 0) opts.labels = labels;
    if (parseBool(attrs.get('diagonal'))) opts.diagonal = true;
    if (parseBool(attrs.get('showDiameter'))) opts.showDiameter = true;
    if (parseBool(attrs.get('showSlant'))) opts.showSlant = true;
    if (shapeRaw === 'rectangle' || shapeRaw === 'triangle') opts.shape = shapeRaw;

    // kind ごとの必須属性検証
    if (!validateSolidOptions(opts)) return null;
    return opts;
}

function validateSolidOptions(opts: SolidOptions): boolean {
    switch (opts.kind) {
        case 'rect-prism':
            return isPositiveDimension(opts.w) && isPositiveDimension(opts.h) && isPositiveDimension(opts.d);
        case 'cube':
            return isPositiveDimension(opts.size);
        case 'cylinder':
            return isPositiveDimension(opts.r) && isPositiveDimension(opts.h);
        case 'cone': {
            if (!isPositiveDimension(opts.r)) return false;
            // h または slant のいずれかが正値
            return isPositiveDimension(opts.h) || isPositiveDimension(opts.slant);
        }
        case 'sphere':
            return isPositiveDimension(opts.r);
        case 'hemisphere':
            return isPositiveDimension(opts.r);
        case 'square-pyramid':
            return isPositiveDimension(opts.w) && isPositiveDimension(opts.d) && isPositiveDimension(opts.h);
        case 'tri-prism': {
            if (!isPositiveDimension(opts.h)) return false;
            return Boolean(opts.base);
        }
        case 'rotation': {
            if (!opts.shape) return false;
            if (!isPositiveDimension(opts.h)) return false;
            if (opts.shape === 'rectangle') return isPositiveDimension(opts.w);
            if (opts.shape === 'triangle') return isPositiveDimension(opts.b);
            return false;
        }
    }
}

/* ------------------------------ 描画ユーティリティ ------------------------------ */

type Bounds = { xmin: number; xmax: number; ymin: number; ymax: number };

function emptyBounds(): Bounds {
    return { xmin: Infinity, xmax: -Infinity, ymin: Infinity, ymax: -Infinity };
}

function expandBounds(b: Bounds, x: number, y: number): void {
    if (x < b.xmin) b.xmin = x;
    if (x > b.xmax) b.xmax = x;
    if (y < b.ymin) b.ymin = y;
    if (y > b.ymax) b.ymax = y;
}

function finalizeBounds(b: Bounds): Bounds {
    if (!Number.isFinite(b.xmin)) return { xmin: -1, xmax: 1, ymin: -1, ymax: 1 };
    if (b.xmin === b.xmax) { b.xmin -= 0.5; b.xmax += 0.5; }
    if (b.ymin === b.ymax) { b.ymin -= 0.5; b.ymax += 0.5; }
    return b;
}

type ViewMetrics = {
    scale: number;
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
    bounds: Bounds;
};

function fitView(bounds: Bounds): ViewMetrics {
    const dataW = bounds.xmax - bounds.xmin;
    const dataH = bounds.ymax - bounds.ymin;
    const maxScaleByLimit = Math.min(
        (MAX_VIEW_DIMENSION - 2 * PADDING) / dataW,
        (MAX_VIEW_DIMENSION - 2 * PADDING) / dataH,
    );
    const scale = Math.min(PIXELS_PER_UNIT, Math.max(4, maxScaleByLimit));

    let viewWidth = dataW * scale + 2 * PADDING;
    let viewHeight = dataH * scale + 2 * PADDING;
    if (viewWidth < MIN_VIEW_DIMENSION) viewWidth = MIN_VIEW_DIMENSION;
    if (viewHeight < MIN_VIEW_DIMENSION) viewHeight = MIN_VIEW_DIMENSION;

    const usedW = dataW * scale;
    const usedH = dataH * scale;
    return {
        scale,
        width: viewWidth,
        height: viewHeight,
        offsetX: (viewWidth - usedW) / 2,
        offsetY: (viewHeight - usedH) / 2,
        bounds,
    };
}

function project(x: number, y: number, view: ViewMetrics): { sx: number; sy: number } {
    return {
        sx: view.offsetX + (x - view.bounds.xmin) * view.scale,
        // SVG は Y 下向きなので反転して画面座標に変換
        sy: view.height - (view.offsetY + (y - view.bounds.ymin) * view.scale),
    };
}

function makeLine(x1: number, y1: number, x2: number, y2: number, dashed = false): string {
    const dash = dashed ? ` stroke-dasharray="${DASH_PATTERN}"` : '';
    return `<line x1="${formatNumber(x1)}" y1="${formatNumber(y1)}" x2="${formatNumber(x2)}" y2="${formatNumber(y2)}" stroke="${STROKE_COLOR}" stroke-width="1.5" stroke-linecap="round"${dash} />`;
}

function makeText(x: number, y: number, text: string, anchor = 'middle', fontSize = LABEL_FONT_SIZE): string {
    return `<text x="${formatNumber(x)}" y="${formatNumber(y)}" font-size="${fontSize}" fill="${STROKE_COLOR}" text-anchor="${anchor}" dominant-baseline="middle">${escapeXml(text)}</text>`;
}

function makePolygon(points: { sx: number; sy: number }[], dashed = false): string {
    const ptsStr = points.map((p) => `${formatNumber(p.sx)},${formatNumber(p.sy)}`).join(' ');
    const dash = dashed ? ` stroke-dasharray="${DASH_PATTERN}"` : '';
    return `<polygon points="${ptsStr}" fill="none" stroke="${STROKE_COLOR}" stroke-width="1.5" stroke-linejoin="round"${dash} />`;
}

function makeEllipse(cx: number, cy: number, rx: number, ry: number, dashed = false): string {
    const dash = dashed ? ` stroke-dasharray="${DASH_PATTERN}"` : '';
    return `<ellipse cx="${formatNumber(cx)}" cy="${formatNumber(cy)}" rx="${formatNumber(rx)}" ry="${formatNumber(ry)}" fill="none" stroke="${STROKE_COLOR}" stroke-width="1.5"${dash} />`;
}

/** 楕円弧の path（手前半分=実線、奥半分=破線 を別 path で描く時用）。 */
function makeArcPath(cx: number, cy: number, rx: number, ry: number, fromAngle: number, toAngle: number, dashed: boolean): string {
    const sx = cx + rx * Math.cos(fromAngle);
    const sy = cy + ry * Math.sin(fromAngle);
    const ex = cx + rx * Math.cos(toAngle);
    const ey = cy + ry * Math.sin(toAngle);
    const large = Math.abs(toAngle - fromAngle) > Math.PI ? 1 : 0;
    const sweep = toAngle > fromAngle ? 1 : 0;
    const dash = dashed ? ` stroke-dasharray="${DASH_PATTERN}"` : '';
    return `<path d="M ${formatNumber(sx)} ${formatNumber(sy)} A ${formatNumber(rx)} ${formatNumber(ry)} 0 ${large} ${sweep} ${formatNumber(ex)} ${formatNumber(ey)}" fill="none" stroke="${STROKE_COLOR}" stroke-width="1.5"${dash} />`;
}

function wrapSvg(view: ViewMetrics, body: string, ariaLabel: string): string {
    const w = formatNumber(view.width);
    const h = formatNumber(view.height);
    return `<svg class="solid" xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeXml(ariaLabel)}">${body}</svg>`;
}

/* ------------------------------ kind ごとの描画 ------------------------------ */

/**
 * 直方体（または立方体）。w=横, h=高さ, d=奥行。斜投影で奥行きをずらす。
 */
function renderRectPrism(w: number, h: number, d: number, opts: SolidOptions): string {
    // 前面 4 頂点 (左下=A, 右下=B, 右上=C, 左上=D)、後面 4 頂点 (E,F,G,H)
    const dxOff = d * OBLIQUE_DX;
    const dyOff = d * OBLIQUE_DY;
    const A = { x: 0, y: 0 };
    const B = { x: w, y: 0 };
    const C = { x: w, y: h };
    const D = { x: 0, y: h };
    const E = { x: A.x + dxOff, y: A.y + dyOff };
    const F = { x: B.x + dxOff, y: B.y + dyOff };
    const G = { x: C.x + dxOff, y: C.y + dyOff };
    const H = { x: D.x + dxOff, y: D.y + dyOff };

    const bounds = emptyBounds();
    for (const p of [A, B, C, D, E, F, G, H]) expandBounds(bounds, p.x, p.y);
    const view = fitView(finalizeBounds(bounds));

    const pA = project(A.x, A.y, view);
    const pB = project(B.x, B.y, view);
    const pC = project(C.x, C.y, view);
    const pD = project(D.x, D.y, view);
    const pE = project(E.x, E.y, view);
    const pF = project(F.x, F.y, view);
    const pG = project(G.x, G.y, view);
    const pH = project(H.x, H.y, view);

    const parts: string[] = [];
    // 後面（隠れ辺）: E-F, F-G, G-H, H-E は実視線では一部遮蔽。簡素に E-F, E-H を破線、F-G, G-H は奥でも見えるとして実線化しても可。
    // ここでは「後面の上辺と奥の縦辺」は実線、隠れる E-F, E-H を破線にする。
    parts.push(makeLine(pE.sx, pE.sy, pF.sx, pF.sy, true)); // 後面下辺
    parts.push(makeLine(pE.sx, pE.sy, pH.sx, pH.sy, true)); // 後面左縦
    parts.push(makeLine(pA.sx, pA.sy, pE.sx, pE.sy, true)); // 左下奥行（A→E）
    parts.push(makeLine(pH.sx, pH.sy, pG.sx, pG.sy)); // 後面上辺
    parts.push(makeLine(pF.sx, pF.sy, pG.sx, pG.sy)); // 後面右縦
    parts.push(makeLine(pB.sx, pB.sy, pF.sx, pF.sy)); // 右下奥行
    parts.push(makeLine(pC.sx, pC.sy, pG.sx, pG.sy)); // 右上奥行
    parts.push(makeLine(pD.sx, pD.sy, pH.sx, pH.sy)); // 左上奥行
    // 前面 4 辺
    parts.push(makeLine(pA.sx, pA.sy, pB.sx, pB.sy));
    parts.push(makeLine(pB.sx, pB.sy, pC.sx, pC.sy));
    parts.push(makeLine(pC.sx, pC.sy, pD.sx, pD.sy));
    parts.push(makeLine(pD.sx, pD.sy, pA.sx, pA.sy));

    // 空間対角線（A→G）
    if (opts.diagonal) {
        parts.push(`<line x1="${formatNumber(pA.sx)}" y1="${formatNumber(pA.sy)}" x2="${formatNumber(pG.sx)}" y2="${formatNumber(pG.sy)}" stroke="${STROKE_COLOR}" stroke-width="1.2" stroke-dasharray="2 3" />`);
    }

    // 寸法ラベル
    parts.push(makeText((pA.sx + pB.sx) / 2, pA.sy + 14, dimText(w))); // 横
    parts.push(makeText(pA.sx - 14, (pA.sy + pD.sy) / 2, dimText(h), 'end')); // 高さ
    // 奥行は B→F の中点
    parts.push(makeText((pB.sx + pF.sx) / 2 + 6, (pB.sy + pF.sy) / 2 + 6, dimText(d), 'start'));

    // 頂点ラベル
    if (opts.labels && opts.labels.length >= 8) {
        const verts: { p: { sx: number; sy: number }; offX: number; offY: number }[] = [
            { p: pA, offX: -8, offY: 12 },
            { p: pB, offX: 8, offY: 12 },
            { p: pC, offX: 8, offY: -8 },
            { p: pD, offX: -8, offY: -8 },
            { p: pE, offX: -8, offY: 12 },
            { p: pF, offX: 8, offY: 12 },
            { p: pG, offX: 8, offY: -8 },
            { p: pH, offX: -8, offY: -8 },
        ];
        opts.labels.slice(0, 8).forEach((label, i) => {
            const v = verts[i];
            parts.push(makeText(v.p.sx + v.offX, v.p.sy + v.offY, label, 'middle', VERTEX_FONT_SIZE));
        });
    }

    return wrapSvg(view, parts.join(''), opts.kind === 'cube' ? '立方体' : '直方体');
}

/**
 * 円柱。上下 ellipse + 左右の母線。上 ellipse は実線、下 ellipse は奥半分破線。
 */
function renderCylinder(r: number, h: number, opts: SolidOptions): string {
    const rx = r;
    const ry = r * ELLIPSE_RY_RATIO;
    const bounds = emptyBounds();
    expandBounds(bounds, -rx, -ry);
    expandBounds(bounds, rx, h + ry);
    const view = fitView(finalizeBounds(bounds));

    const top = project(0, h, view);
    const bottom = project(0, 0, view);
    const leftTop = project(-rx, h, view);
    const rightTop = project(rx, h, view);
    const leftBottom = project(-rx, 0, view);
    const rightBottom = project(rx, 0, view);
    const rxPx = (rightTop.sx - leftTop.sx) / 2;
    const ryPx = view.scale * ry;

    const parts: string[] = [];
    // 上面 ellipse（全周実線）
    parts.push(makeEllipse(top.sx, top.sy, rxPx, ryPx));
    // 下面 ellipse: 手前（下半分=画面下半周）実線、奥（上半分）破線
    // SVG 座標で y 下方向が +。手前 = 画面下 = sy が大きい側 = 楕円方程式 sin>0
    parts.push(makeArcPath(bottom.sx, bottom.sy, rxPx, ryPx, 0, Math.PI, false));
    parts.push(makeArcPath(bottom.sx, bottom.sy, rxPx, ryPx, Math.PI, 2 * Math.PI, true));
    // 左右母線
    parts.push(makeLine(leftTop.sx, leftTop.sy, leftBottom.sx, leftBottom.sy));
    parts.push(makeLine(rightTop.sx, rightTop.sy, rightBottom.sx, rightBottom.sy));

    // ラベル: 半径と高さ
    parts.push(makeText(top.sx, top.sy - ryPx - 8, dimText(r), 'middle'));
    parts.push(makeText(rightBottom.sx + 12, (rightTop.sy + rightBottom.sy) / 2, dimText(h), 'start'));
    if (opts.showDiameter) {
        parts.push(makeText(bottom.sx, bottom.sy + ryPx + 14, `直径 ${dimText(r * 2)}`, 'middle'));
    }

    return wrapSvg(view, parts.join(''), '円柱');
}

/**
 * 円錐。底面 ellipse + 頂点から左右母線。
 */
function renderCone(r: number, h: number, opts: SolidOptions): string {
    const rx = r;
    const ry = r * ELLIPSE_RY_RATIO;
    const bounds = emptyBounds();
    expandBounds(bounds, -rx, -ry);
    expandBounds(bounds, rx, h);
    const view = fitView(finalizeBounds(bounds));

    const apex = project(0, h, view);
    const base = project(0, 0, view);
    const leftBase = project(-rx, 0, view);
    const rightBase = project(rx, 0, view);
    const rxPx = (rightBase.sx - leftBase.sx) / 2;
    const ryPx = view.scale * ry;

    const parts: string[] = [];
    // 底面: 手前実線、奥破線
    parts.push(makeArcPath(base.sx, base.sy, rxPx, ryPx, 0, Math.PI, false));
    parts.push(makeArcPath(base.sx, base.sy, rxPx, ryPx, Math.PI, 2 * Math.PI, true));
    // 母線
    parts.push(makeLine(apex.sx, apex.sy, leftBase.sx, leftBase.sy));
    parts.push(makeLine(apex.sx, apex.sy, rightBase.sx, rightBase.sy));

    // 半径ラベル
    parts.push(makeText((base.sx + rightBase.sx) / 2, base.sy + ryPx + 14, dimText(r), 'middle'));
    // 高さラベル: 中心軸沿い右側
    parts.push(makeText(apex.sx + 8, (apex.sy + base.sy) / 2, dimText(h), 'start'));

    if (opts.showSlant) {
        const slant = opts.slant ?? Math.sqrt(r * r + h * h);
        // 母線中点に表示
        const mx = (apex.sx + rightBase.sx) / 2 + 8;
        const my = (apex.sy + rightBase.sy) / 2;
        parts.push(makeText(mx, my, `母線 ${dimText(slant)}`, 'start'));
    }

    return wrapSvg(view, parts.join(''), '円錐');
}

/** 球。円 + 赤道楕円破線 + 経度楕円破線。 */
function renderSphere(r: number, opts: SolidOptions): string {
    const bounds = emptyBounds();
    expandBounds(bounds, -r, -r);
    expandBounds(bounds, r, r);
    const view = fitView(finalizeBounds(bounds));

    const center = project(0, 0, view);
    const rPx = view.scale * r;
    const eqRy = rPx * SPHERE_EQUATOR_RATIO;
    const merRx = rPx * SPHERE_MERIDIAN_RATIO;

    const parts: string[] = [];
    parts.push(`<circle cx="${formatNumber(center.sx)}" cy="${formatNumber(center.sy)}" r="${formatNumber(rPx)}" fill="none" stroke="${STROKE_COLOR}" stroke-width="1.5" />`);
    parts.push(makeEllipse(center.sx, center.sy, rPx, eqRy, true));
    parts.push(makeEllipse(center.sx, center.sy, merRx, rPx, true));

    // 半径ラベル
    parts.push(makeText(center.sx + 6, center.sy - 6, dimText(r), 'start'));
    if (opts.showDiameter) {
        parts.push(makeText(center.sx, center.sy + rPx + 14, `直径 ${dimText(r * 2)}`, 'middle'));
    }

    return wrapSvg(view, parts.join(''), '球');
}

/** 半球。半円 + 平らな底（楕円の上半分）。 */
function renderHemisphere(r: number): string {
    const bounds = emptyBounds();
    expandBounds(bounds, -r, 0);
    expandBounds(bounds, r, r);
    const view = fitView(finalizeBounds(bounds));

    const center = project(0, 0, view);
    const left = project(-r, 0, view);
    const right = project(r, 0, view);
    const rPx = (right.sx - left.sx) / 2;
    const ry = rPx * ELLIPSE_RY_RATIO;

    const parts: string[] = [];
    // 上半円
    parts.push(`<path d="M ${formatNumber(left.sx)} ${formatNumber(left.sy)} A ${formatNumber(rPx)} ${formatNumber(rPx)} 0 0 1 ${formatNumber(right.sx)} ${formatNumber(right.sy)}" fill="none" stroke="${STROKE_COLOR}" stroke-width="1.5" />`);
    // 底面 ellipse: 手前実線、奥破線
    parts.push(makeArcPath(center.sx, center.sy, rPx, ry, 0, Math.PI, false));
    parts.push(makeArcPath(center.sx, center.sy, rPx, ry, Math.PI, 2 * Math.PI, true));

    parts.push(makeText(center.sx, center.sy - rPx - 8, dimText(r), 'middle'));

    return wrapSvg(view, parts.join(''), '半球');
}

/** 四角錐。底面が w×d、高さ h。底面は斜投影、頂点は底面中心の真上。 */
function renderSquarePyramid(w: number, d: number, h: number, opts: SolidOptions): string {
    // 底面（前面 A,B、後面 D,C）
    const dxOff = d * OBLIQUE_DX;
    const dyOff = d * OBLIQUE_DY;
    const A = { x: 0, y: 0 };
    const B = { x: w, y: 0 };
    const D = { x: A.x + dxOff, y: A.y + dyOff };
    const C = { x: B.x + dxOff, y: B.y + dyOff };
    // 頂点: 底面中心の真上 h
    const cx = (A.x + B.x + C.x + D.x) / 4;
    const cy = (A.y + B.y + C.y + D.y) / 4;
    const T = { x: cx, y: cy + h };

    const bounds = emptyBounds();
    for (const p of [A, B, C, D, T]) expandBounds(bounds, p.x, p.y);
    const view = fitView(finalizeBounds(bounds));

    const pA = project(A.x, A.y, view);
    const pB = project(B.x, B.y, view);
    const pC = project(C.x, C.y, view);
    const pD = project(D.x, D.y, view);
    const pT = project(T.x, T.y, view);

    const parts: string[] = [];
    // 後ろの底辺と隠れ稜線 (D は後面奥なので破線)
    parts.push(makeLine(pA.sx, pA.sy, pD.sx, pD.sy, true));
    parts.push(makeLine(pD.sx, pD.sy, pC.sx, pC.sy, true));
    parts.push(makeLine(pT.sx, pT.sy, pD.sx, pD.sy, true));
    // 前面の底辺と稜線
    parts.push(makeLine(pA.sx, pA.sy, pB.sx, pB.sy));
    parts.push(makeLine(pB.sx, pB.sy, pC.sx, pC.sy));
    parts.push(makeLine(pT.sx, pT.sy, pA.sx, pA.sy));
    parts.push(makeLine(pT.sx, pT.sy, pB.sx, pB.sy));
    parts.push(makeLine(pT.sx, pT.sy, pC.sx, pC.sy));

    // 寸法ラベル
    parts.push(makeText((pA.sx + pB.sx) / 2, pA.sy + 14, dimText(w)));
    parts.push(makeText((pB.sx + pC.sx) / 2 + 6, (pB.sy + pC.sy) / 2 + 6, dimText(d), 'start'));
    parts.push(makeText(pT.sx + 8, (pT.sy + (pA.sy + pB.sy + pC.sy + pD.sy) / 4) / 2, dimText(h), 'start'));

    // 頂点ラベル（5 頂点: T, A, B, C, D）
    if (opts.labels && opts.labels.length >= 5) {
        const verts: { p: { sx: number; sy: number }; offX: number; offY: number }[] = [
            { p: pT, offX: 0, offY: -10 },
            { p: pA, offX: -8, offY: 12 },
            { p: pB, offX: 8, offY: 12 },
            { p: pC, offX: 10, offY: -2 },
            { p: pD, offX: -10, offY: -2 },
        ];
        opts.labels.slice(0, 5).forEach((label, i) => {
            const v = verts[i];
            parts.push(makeText(v.p.sx + v.offX, v.p.sy + v.offY, label, 'middle', VERTEX_FONT_SIZE));
        });
    }

    return wrapSvg(view, parts.join(''), '四角錐');
}

/** 三角柱。底面が三角形（base=[a,b,c]）、高さ h。 */
function renderTriPrism(base: [number, number, number], h: number, opts: SolidOptions): string {
    const [a, b, c] = base;
    // 底面三角形を 2D に配置: P=(0,0), Q=(a,0), R=余弦定理で算出
    const cosP = (a * a + c * c - b * b) / (2 * a * c);
    const safeCos = Math.max(-1, Math.min(1, cosP));
    const Rx = c * safeCos;
    const Ry = c * Math.sqrt(Math.max(0, 1 - safeCos * safeCos));
    // 底面（前面）3 頂点
    const P = { x: 0, y: 0 };
    const Q = { x: a, y: 0 };
    const R = { x: Rx, y: Ry };
    // h は柱の高さ。底面を XY、柱方向を Y 上向きで取る (= 実は柱は奥行きで描きたいので XY 平面で底面を描き、Y で押し上げる方が自然)
    // ここでは底面 = 上面とし、奥行き = h で斜投影で背面を描く（横倒しの三角柱）
    // よって背面 = 前面 + 奥行きシフト (h * OBLIQUE_DX, h * OBLIQUE_DY)
    const dxOff = h * OBLIQUE_DX;
    const dyOff = h * OBLIQUE_DY;
    const P2 = { x: P.x + dxOff, y: P.y + dyOff };
    const Q2 = { x: Q.x + dxOff, y: Q.y + dyOff };
    const R2 = { x: R.x + dxOff, y: R.y + dyOff };

    const bounds = emptyBounds();
    for (const p of [P, Q, R, P2, Q2, R2]) expandBounds(bounds, p.x, p.y);
    const view = fitView(finalizeBounds(bounds));

    const pP = project(P.x, P.y, view);
    const pQ = project(Q.x, Q.y, view);
    const pR = project(R.x, R.y, view);
    const pP2 = project(P2.x, P2.y, view);
    const pQ2 = project(Q2.x, Q2.y, view);
    const pR2 = project(R2.x, R2.y, view);

    const parts: string[] = [];
    // 後面三角形（隠れ辺）
    parts.push(makeLine(pP2.sx, pP2.sy, pQ2.sx, pQ2.sy, true));
    parts.push(makeLine(pQ2.sx, pQ2.sy, pR2.sx, pR2.sy, true));
    parts.push(makeLine(pR2.sx, pR2.sy, pP2.sx, pP2.sy, true));
    // 奥行き辺（P→P2 は隠れる、Q→Q2 / R→R2 は見える）
    parts.push(makeLine(pP.sx, pP.sy, pP2.sx, pP2.sy, true));
    parts.push(makeLine(pQ.sx, pQ.sy, pQ2.sx, pQ2.sy));
    parts.push(makeLine(pR.sx, pR.sy, pR2.sx, pR2.sy));
    // 前面三角形
    parts.push(makeLine(pP.sx, pP.sy, pQ.sx, pQ.sy));
    parts.push(makeLine(pQ.sx, pQ.sy, pR.sx, pR.sy));
    parts.push(makeLine(pR.sx, pR.sy, pP.sx, pP.sy));

    // 寸法ラベル
    parts.push(makeText((pP.sx + pQ.sx) / 2, pP.sy + 14, dimText(a)));
    parts.push(makeText((pQ.sx + pR.sx) / 2 + 6, (pQ.sy + pR.sy) / 2, dimText(b), 'start'));
    parts.push(makeText((pR.sx + pP.sx) / 2 - 6, (pR.sy + pP.sy) / 2, dimText(c), 'end'));
    parts.push(makeText((pQ.sx + pQ2.sx) / 2 + 6, (pQ.sy + pQ2.sy) / 2 + 10, `高さ ${dimText(h)}`, 'start'));

    // 頂点ラベル（6 頂点）
    if (opts.labels && opts.labels.length >= 6) {
        const verts: { p: { sx: number; sy: number }; offX: number; offY: number }[] = [
            { p: pP, offX: -8, offY: 10 },
            { p: pQ, offX: 8, offY: 10 },
            { p: pR, offX: 0, offY: -10 },
            { p: pP2, offX: -8, offY: 10 },
            { p: pQ2, offX: 8, offY: 10 },
            { p: pR2, offX: 0, offY: -10 },
        ];
        opts.labels.slice(0, 6).forEach((label, i) => {
            const v = verts[i];
            parts.push(makeText(v.p.sx + v.offX, v.p.sy + v.offY, label, 'middle', VERTEX_FONT_SIZE));
        });
    }

    return wrapSvg(view, parts.join(''), '三角柱');
}

/**
 * 回転体（軸 ℓ 周り）。元の 2D 形を破線 + 軸 ℓ + 回転体（円柱/円錐）を実線。
 */
function renderRotation(opts: SolidOptions): string {
    const shape = opts.shape!;
    const h = opts.h!;
    // 軸 ℓ は X=0、回転体は X∈[-r, r]
    if (shape === 'rectangle') {
        const w = opts.w!;
        const r = w; // 矩形の横が回転半径
        const ry = r * ELLIPSE_RY_RATIO;
        const bounds = emptyBounds();
        expandBounds(bounds, -r, -ry);
        expandBounds(bounds, r, h + ry);
        const view = fitView(finalizeBounds(bounds));

        const top = project(0, h, view);
        const bottom = project(0, 0, view);
        const leftTop = project(-r, h, view);
        const rightTop = project(r, h, view);
        const leftBottom = project(-r, 0, view);
        const rightBottom = project(r, 0, view);
        const rxPx = (rightTop.sx - leftTop.sx) / 2;
        const ryPx = view.scale * ry;

        const parts: string[] = [];
        // 軸 ℓ（縦の点線、図の上下を貫く）
        const axisTop = project(0, h + ry + 0.5, view);
        const axisBottom = project(0, -ry - 0.5, view);
        parts.push(`<line x1="${formatNumber(axisTop.sx)}" y1="${formatNumber(axisTop.sy)}" x2="${formatNumber(axisBottom.sx)}" y2="${formatNumber(axisBottom.sy)}" stroke="${STROKE_COLOR}" stroke-width="1" stroke-dasharray="2 3" />`);
        parts.push(makeText(axisTop.sx + 8, axisTop.sy - 4, 'ℓ', 'start'));

        // 元の矩形（軸右側、破線）
        parts.push(makeLine(bottom.sx, bottom.sy, rightBottom.sx, rightBottom.sy, true));
        parts.push(makeLine(rightBottom.sx, rightBottom.sy, rightTop.sx, rightTop.sy, true));
        parts.push(makeLine(rightTop.sx, rightTop.sy, top.sx, top.sy, true));

        // 回転体（円柱）実線
        parts.push(makeEllipse(top.sx, top.sy, rxPx, ryPx));
        parts.push(makeArcPath(bottom.sx, bottom.sy, rxPx, ryPx, 0, Math.PI, false));
        parts.push(makeArcPath(bottom.sx, bottom.sy, rxPx, ryPx, Math.PI, 2 * Math.PI, true));
        parts.push(makeLine(leftTop.sx, leftTop.sy, leftBottom.sx, leftBottom.sy));
        parts.push(makeLine(rightTop.sx, rightTop.sy, rightBottom.sx, rightBottom.sy));

        parts.push(makeText((bottom.sx + rightBottom.sx) / 2, rightBottom.sy + 14, dimText(r)));
        parts.push(makeText(rightBottom.sx + 12, (rightTop.sy + rightBottom.sy) / 2, dimText(h), 'start'));

        return wrapSvg(view, parts.join(''), '回転体');
    }

    // triangle: 直角三角形（底辺 b、高さ h）を ℓ 周りに回転 → 円錐
    const b = opts.b!;
    const r = b;
    const ry = r * ELLIPSE_RY_RATIO;
    const bounds = emptyBounds();
    expandBounds(bounds, -r, -ry);
    expandBounds(bounds, r, h);
    const view = fitView(finalizeBounds(bounds));

    const apex = project(0, h, view);
    const base = project(0, 0, view);
    const leftBase = project(-r, 0, view);
    const rightBase = project(r, 0, view);
    const rxPx = (rightBase.sx - leftBase.sx) / 2;
    const ryPx = view.scale * ry;

    const parts: string[] = [];
    const axisTop = project(0, h + 0.5, view);
    const axisBottom = project(0, -ry - 0.5, view);
    parts.push(`<line x1="${formatNumber(axisTop.sx)}" y1="${formatNumber(axisTop.sy)}" x2="${formatNumber(axisBottom.sx)}" y2="${formatNumber(axisBottom.sy)}" stroke="${STROKE_COLOR}" stroke-width="1" stroke-dasharray="2 3" />`);
    parts.push(makeText(axisTop.sx + 8, axisTop.sy - 4, 'ℓ', 'start'));

    // 元の直角三角形（軸右側、破線）
    parts.push(makeLine(base.sx, base.sy, rightBase.sx, rightBase.sy, true));
    parts.push(makeLine(rightBase.sx, rightBase.sy, apex.sx, apex.sy, true));
    parts.push(makeLine(apex.sx, apex.sy, base.sx, base.sy, true));

    // 回転体（円錐）実線
    parts.push(makeArcPath(base.sx, base.sy, rxPx, ryPx, 0, Math.PI, false));
    parts.push(makeArcPath(base.sx, base.sy, rxPx, ryPx, Math.PI, 2 * Math.PI, true));
    parts.push(makeLine(apex.sx, apex.sy, leftBase.sx, leftBase.sy));
    parts.push(makeLine(apex.sx, apex.sy, rightBase.sx, rightBase.sy));

    parts.push(makeText((base.sx + rightBase.sx) / 2, base.sy + 14, dimText(r)));
    parts.push(makeText(apex.sx + 8, (apex.sy + base.sy) / 2, dimText(h), 'start'));

    return wrapSvg(view, parts.join(''), '回転体');
}

/* --------------------------------- 公開関数 --------------------------------- */

/**
 * SolidOptions から SVG マークアップを生成する。失敗時は説明的なエラー span を返す。
 */
export function renderSolidSvg(opts: SolidOptions): string {
    if (!validateSolidOptions(opts)) {
        return `<span class="solid-error">立体パラメータが不正です</span>`;
    }
    switch (opts.kind) {
        case 'rect-prism':
            return renderRectPrism(opts.w!, opts.h!, opts.d!, opts);
        case 'cube':
            return renderRectPrism(opts.size!, opts.size!, opts.size!, opts);
        case 'cylinder':
            return renderCylinder(opts.r!, opts.h!, opts);
        case 'cone': {
            const h = opts.h ?? (opts.slant && opts.r ? Math.sqrt(Math.max(0, opts.slant * opts.slant - opts.r * opts.r)) : 0);
            return renderCone(opts.r!, h, opts);
        }
        case 'sphere':
            return renderSphere(opts.r!, opts);
        case 'hemisphere':
            return renderHemisphere(opts.r!);
        case 'square-pyramid':
            return renderSquarePyramid(opts.w!, opts.d!, opts.h!, opts);
        case 'tri-prism':
            return renderTriPrism(opts.base!, opts.h!, opts);
        case 'rotation':
            return renderRotation(opts);
    }
}

/**
 * テキスト中の `[[solid ...]]` を SVG に展開する。パース失敗時は元のテキストを残す。
 */
export function expandSolidDirectives(text: string): string {
    const re = /\[\[solid\s+([^\]]*)\]\]/g;
    return text.replace(re, (full, body: string) => {
        const opts = parseSolidDirective(body);
        if (!opts) return full;
        return renderSolidSvg(opts);
    });
}

/**
 * AI 採点用の人間可読サマリ。SVG ではなくテキスト要約を返す。
 */
export function expandSolidDirectivesAsText(text: string): string {
    const re = /\[\[solid\s+([^\]]*)\]\]/g;
    return text.replace(re, (full, body: string) => {
        const opts = parseSolidDirective(body);
        if (!opts) return full;
        return summarizeSolid(opts);
    });
}

function summarizeSolid(opts: SolidOptions): string {
    switch (opts.kind) {
        case 'rect-prism':
            return `[立体: 直方体 横${formatNumber(opts.w!)} 縦${formatNumber(opts.d!)} 高さ${formatNumber(opts.h!)}]`;
        case 'cube':
            return `[立体: 立方体 一辺${formatNumber(opts.size!)}]`;
        case 'cylinder':
            return `[立体: 円柱 半径${formatNumber(opts.r!)} 高さ${formatNumber(opts.h!)}]`;
        case 'cone': {
            const h = opts.h ?? (opts.slant && opts.r ? Math.sqrt(Math.max(0, opts.slant * opts.slant - opts.r * opts.r)) : 0);
            return `[立体: 円錐 半径${formatNumber(opts.r!)} 高さ${formatNumber(h)}]`;
        }
        case 'sphere':
            return `[立体: 球 半径${formatNumber(opts.r!)}]`;
        case 'hemisphere':
            return `[立体: 半球 半径${formatNumber(opts.r!)}]`;
        case 'square-pyramid':
            return `[立体: 四角錐 底面${formatNumber(opts.w!)}×${formatNumber(opts.d!)} 高さ${formatNumber(opts.h!)}]`;
        case 'tri-prism':
            return `[立体: 三角柱 底面(${opts.base!.map(formatNumber).join(',')}) 高さ${formatNumber(opts.h!)}]`;
        case 'rotation': {
            if (opts.shape === 'rectangle') {
                return `[立体: 回転体 矩形(横${formatNumber(opts.w!)} 高さ${formatNumber(opts.h!)})を軸ℓ周りに回転]`;
            }
            return `[立体: 回転体 直角三角形(底辺${formatNumber(opts.b!)} 高さ${formatNumber(opts.h!)})を軸ℓ周りに回転]`;
        }
    }
}

/**
 * SolidOptions から DSL 文字列を再構築する（編集 UI で answerTemplate を更新するときに使う）。
 */
export function buildSolidDirective(opts: SolidOptions): string {
    const parts: string[] = [`kind="${opts.kind}"`];
    if (opts.size !== undefined) parts.push(`size=${formatNumber(opts.size)}`);
    if (opts.w !== undefined) parts.push(`w=${formatNumber(opts.w)}`);
    if (opts.h !== undefined) parts.push(`h=${formatNumber(opts.h)}`);
    if (opts.d !== undefined) parts.push(`d=${formatNumber(opts.d)}`);
    if (opts.r !== undefined) parts.push(`r=${formatNumber(opts.r)}`);
    if (opts.slant !== undefined) parts.push(`slant=${formatNumber(opts.slant)}`);
    if (opts.b !== undefined) parts.push(`b=${formatNumber(opts.b)}`);
    if (opts.base) parts.push(`base="${opts.base.map(formatNumber).join(',')}"`);
    if (opts.shape) parts.push(`shape="${opts.shape}"`);
    if (opts.diagonal) parts.push(`diagonal=true`);
    if (opts.showDiameter) parts.push(`showDiameter=true`);
    if (opts.showSlant) parts.push(`showSlant=true`);
    if (opts.labels && opts.labels.length > 0) {
        const safe = opts.labels.map((l) => l.replace(/[",]/g, '')).join(',');
        parts.push(`labels="${safe}"`);
    }
    return `[[solid ${parts.join(' ')}]]`;
}
