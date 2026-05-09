/**
 * 問題文中の座標平面記法
 *   `[[coordplane xmin=-5 xmax=5 ymin=-5 ymax=5 points="P:4,3;Q:-2,1" curves="y=6/x;y=x^2" lines="x=2;y=-1"]]`
 * を簡易な座標平面 SVG に展開するユーティリティ。
 *
 * 仕様:
 * - xmin/xmax/ymin/ymax は必須（min < max）
 * - points: `label:x,y` をセミコロン区切り（label 空可）
 * - curves: `y=式` をセミコロン区切り。式は四則演算 + ^ + sqrt() + 単項 - + 数値 + x のみ。
 *   セキュリティ上 eval は使わず、専用の小規模パーサで評価する。
 * - lines: `x=数値` または `y=数値` をセミコロン区切り（鉛直/水平のみ）
 * - 範囲外の点は描画しない。曲線は範囲内のみサンプリングする。
 *
 * サーバ側で文字列 SVG を生成し、`dangerouslySetInnerHTML` で
 * 既存の `renderProblemTextHtml` に埋め込む前提。クライアント JS 不要。
 */

export type CoordPlanePoint = {
    label: string;
    x: number;
    y: number;
};

export type CoordPlaneCurve = {
    expression: string;
    evaluator: (x: number) => number;
};

export type CoordPlaneLine =
    | { axis: 'x'; value: number }
    | { axis: 'y'; value: number };

export type CoordPlaneOptions = {
    xmin: number;
    xmax: number;
    ymin: number;
    ymax: number;
    points: CoordPlanePoint[];
    curves: CoordPlaneCurve[];
    lines: CoordPlaneLine[];
};

const VIEW_WIDTH = 360;
const VIEW_HEIGHT = 360;
const PADDING = 24;
const CURVE_SAMPLES = 200;
const POINT_RADIUS = 4;
const LABEL_OFFSET_X = 8;
const LABEL_OFFSET_Y = -8;

// 軸目盛りの最小ピクセル間隔。閾値より狭くなる場合は粗い刻みに切り替える。
const MIN_TICK_PIXEL_SPACING = 18;
// データ依存しないハード上限。粗刻み計算が破綻したときの保険。
const MAX_TICKS_PER_AXIS = 60;

// SSR と CSR で同じマークアップを返す必要があるため、グローバルな mutable カウンタは使えない。
// CoordPlaneOptions の内容と呼び出し元の安定キー（出現位置など）を合わせてハッシュし、
// 同じ図を同じページに 2 回置いても marker id が衝突しないようにする。
function hashCoordPlaneMarker(options: CoordPlaneOptions, idSuffix: string): string {
    const payload = JSON.stringify({
        suffix: idSuffix,
        xmin: options.xmin,
        xmax: options.xmax,
        ymin: options.ymin,
        ymax: options.ymax,
        points: options.points.map((p) => ({ label: p.label, x: p.x, y: p.y })),
        curves: options.curves.map((c) => c.expression),
        lines: options.lines,
    });
    // FNV-1a 32bit。SVG 内部の id 衝突回避が目的なので暗号強度は不要。
    let hash = 0x811c9dc5;
    for (let i = 0; i < payload.length; i += 1) {
        hash ^= payload.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
}

// 与えられた下限値以上で {1, 2, 5} × 10^n 系列の最小の "nice" step を返す。
// span が 1 未満（例: [-0.5, 0.5]）でも 0.1, 0.2, 0.5 のような fractional step を採用し、
// 全ての tick が v=0 で潰れて何も描画されない問題を防ぐ。
function niceStepAtLeast(minStep: number): number {
    if (!Number.isFinite(minStep) || minStep <= 0) return 1;
    const exp = Math.floor(Math.log10(minStep));
    const pow = 10 ** exp;
    const base = minStep / pow;
    const niceBase = base <= 1 ? 1 : base <= 2 ? 2 : base <= 5 ? 5 : 10;
    return niceBase * pow;
}

function chooseTickStep(span: number, viewSpan: number): number {
    if (!Number.isFinite(span) || span <= 0) return 1;
    const usable = viewSpan - PADDING * 2;
    const pixelsPerUnit = usable / span;
    if (!Number.isFinite(pixelsPerUnit) || pixelsPerUnit <= 0) {
        return niceStepAtLeast(span / MAX_TICKS_PER_AXIS);
    }
    const minStepByPixel = MIN_TICK_PIXEL_SPACING / pixelsPerUnit;
    const minStepByCount = span / MAX_TICKS_PER_AXIS;
    return niceStepAtLeast(Math.max(minStepByPixel, minStepByCount));
}

function escapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function projectX(x: number, xmin: number, xmax: number): number {
    const ratio = (x - xmin) / (xmax - xmin);
    return PADDING + ratio * (VIEW_WIDTH - PADDING * 2);
}

function projectY(y: number, ymin: number, ymax: number): number {
    const ratio = (y - ymin) / (ymax - ymin);
    return VIEW_HEIGHT - PADDING - ratio * (VIEW_HEIGHT - PADDING * 2);
}

function formatNumber(value: number): string {
    if (Number.isInteger(value)) return String(value);
    return String(Number(value.toFixed(2)));
}

/**
 * 座標平面 SVG マークアップを生成する。失敗時は説明的なエラー span を返す。
 *
 * @param idSuffix 同じ options を 1 ページ内に複数並べる場合の衝突回避用 suffix。
 *   省略時は空文字を入れて options 内容のみで marker id を導出する。
 *   呼び出し側（expandCoordPlaneDirectives 等）から match.index を 36 進で渡すのが想定。
 */
export function renderCoordPlaneSvg(options: CoordPlaneOptions, idSuffix = ''): string {
    const { xmin, xmax, ymin, ymax, points, curves, lines } = options;

    if (
        !Number.isFinite(xmin) || !Number.isFinite(xmax) || xmin >= xmax
        || !Number.isFinite(ymin) || !Number.isFinite(ymax) || ymin >= ymax
    ) {
        return `<span class="coordplane-error">座標平面の範囲が不正です</span>`;
    }

    // 描画範囲が広い場合に SVG ノード数が爆発しないよう、ピクセル間隔と件数で
    // 動的に刻み幅を決める。数十万単位のレンジを安全に描画するためのガード。
    const xStep = chooseTickStep(xmax - xmin, VIEW_WIDTH);
    const yStep = chooseTickStep(ymax - ymin, VIEW_HEIGHT);

    // グリッド線
    const gridLines: string[] = [];
    for (let v = Math.ceil(xmin / xStep) * xStep; v <= xmax; v += xStep) {
        if (v === 0) continue;
        const x = projectX(v, xmin, xmax);
        gridLines.push(`<line x1="${x}" y1="${PADDING}" x2="${x}" y2="${VIEW_HEIGHT - PADDING}" stroke="currentColor" stroke-width="0.5" opacity="0.2" />`);
    }
    for (let v = Math.ceil(ymin / yStep) * yStep; v <= ymax; v += yStep) {
        if (v === 0) continue;
        const y = projectY(v, ymin, ymax);
        gridLines.push(`<line x1="${PADDING}" y1="${y}" x2="${VIEW_WIDTH - PADDING}" y2="${y}" stroke="currentColor" stroke-width="0.5" opacity="0.2" />`);
    }

    // SVG ごとに一意な marker id を割り当てる（同一ページ内で複数並んでも参照崩れしない）。
    // SSR/CSR の hydration 不一致を避けるため options + idSuffix から決定論的に算出する。
    const markerPrefix = `cp-${hashCoordPlaneMarker(options, idSuffix)}`;
    const arrowUp = `${markerPrefix}-up`;
    const arrowDown = `${markerPrefix}-down`;
    const arrowLeft = `${markerPrefix}-left`;
    const arrowRight = `${markerPrefix}-right`;

    // 軸（範囲内に 0 が含まれる場合のみ）
    const axisLines: string[] = [];
    const axisLabels: string[] = [];
    if (xmin <= 0 && xmax >= 0) {
        const x0 = projectX(0, xmin, xmax);
        axisLines.push(`<line x1="${x0}" y1="${PADDING}" x2="${x0}" y2="${VIEW_HEIGHT - PADDING}" stroke="currentColor" stroke-width="1" marker-start="url(#${arrowUp})" marker-end="url(#${arrowDown})" />`);
        axisLabels.push(`<text x="${x0 + 6}" y="${PADDING + 4}" font-size="12" fill="currentColor">y</text>`);
    }
    if (ymin <= 0 && ymax >= 0) {
        const y0 = projectY(0, ymin, ymax);
        axisLines.push(`<line x1="${PADDING}" y1="${y0}" x2="${VIEW_WIDTH - PADDING}" y2="${y0}" stroke="currentColor" stroke-width="1" marker-start="url(#${arrowLeft})" marker-end="url(#${arrowRight})" />`);
        axisLabels.push(`<text x="${VIEW_WIDTH - PADDING - 4}" y="${y0 - 6}" font-size="12" fill="currentColor" text-anchor="end">x</text>`);
    }

    // 目盛
    const ticks: string[] = [];
    if (ymin <= 0 && ymax >= 0) {
        const y0 = projectY(0, ymin, ymax);
        for (let v = Math.ceil(xmin / xStep) * xStep; v <= xmax; v += xStep) {
            if (v === 0) continue;
            const x = projectX(v, xmin, xmax);
            ticks.push(`<line x1="${x}" y1="${y0 - 3}" x2="${x}" y2="${y0 + 3}" stroke="currentColor" stroke-width="1" />`);
            ticks.push(`<text x="${x}" y="${y0 + 14}" font-size="10" text-anchor="middle" fill="currentColor">${formatNumber(v)}</text>`);
        }
    }
    if (xmin <= 0 && xmax >= 0) {
        const x0 = projectX(0, xmin, xmax);
        for (let v = Math.ceil(ymin / yStep) * yStep; v <= ymax; v += yStep) {
            if (v === 0) continue;
            const y = projectY(v, ymin, ymax);
            ticks.push(`<line x1="${x0 - 3}" y1="${y}" x2="${x0 + 3}" y2="${y}" stroke="currentColor" stroke-width="1" />`);
            ticks.push(`<text x="${x0 - 6}" y="${y + 3}" font-size="10" text-anchor="end" fill="currentColor">${formatNumber(v)}</text>`);
        }
    }

    // 直線（鉛直/水平）
    const lineEls: string[] = [];
    for (const line of lines) {
        if (line.axis === 'x') {
            if (line.value < xmin || line.value > xmax) continue;
            const x = projectX(line.value, xmin, xmax);
            lineEls.push(`<line x1="${x}" y1="${PADDING}" x2="${x}" y2="${VIEW_HEIGHT - PADDING}" stroke="currentColor" stroke-width="1.2" stroke-dasharray="4 3" />`);
        } else {
            if (line.value < ymin || line.value > ymax) continue;
            const y = projectY(line.value, ymin, ymax);
            lineEls.push(`<line x1="${PADDING}" y1="${y}" x2="${VIEW_WIDTH - PADDING}" y2="${y}" stroke="currentColor" stroke-width="1.2" stroke-dasharray="4 3" />`);
        }
    }

    // 曲線
    const curveEls: string[] = [];
    for (const curve of curves) {
        const segments: string[][] = [];
        let current: string[] = [];
        for (let i = 0; i <= CURVE_SAMPLES; i += 1) {
            const x = xmin + ((xmax - xmin) * i) / CURVE_SAMPLES;
            let y: number;
            try {
                y = curve.evaluator(x);
            } catch {
                y = Number.NaN;
            }
            if (!Number.isFinite(y) || y < ymin || y > ymax) {
                if (current.length > 1) segments.push(current);
                current = [];
                continue;
            }
            const px = projectX(x, xmin, xmax);
            const py = projectY(y, ymin, ymax);
            current.push(`${px.toFixed(2)},${py.toFixed(2)}`);
        }
        if (current.length > 1) segments.push(current);

        for (const seg of segments) {
            curveEls.push(`<polyline points="${seg.join(' ')}" fill="none" stroke="currentColor" stroke-width="1.5" />`);
        }
    }

    // 点とラベル
    const pointEls: string[] = [];
    for (const point of points) {
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
        if (point.x < xmin || point.x > xmax || point.y < ymin || point.y > ymax) continue;
        const px = projectX(point.x, xmin, xmax);
        const py = projectY(point.y, ymin, ymax);
        pointEls.push(`<circle cx="${px}" cy="${py}" r="${POINT_RADIUS}" fill="currentColor" />`);
        if (point.label) {
            pointEls.push(`<text x="${px + LABEL_OFFSET_X}" y="${py + LABEL_OFFSET_Y}" font-size="13" font-weight="bold" fill="currentColor">${escapeXml(point.label)}</text>`);
        }
    }

    const defs = `<defs>
        <marker id="${arrowUp}" viewBox="0 0 10 10" refX="5" refY="2" markerWidth="8" markerHeight="8" orient="auto">
            <path d="M 0 10 L 5 0 L 10 10 z" fill="currentColor" />
        </marker>
        <marker id="${arrowDown}" viewBox="0 0 10 10" refX="5" refY="8" markerWidth="8" markerHeight="8" orient="auto">
            <path d="M 0 0 L 5 10 L 10 0 z" fill="currentColor" />
        </marker>
        <marker id="${arrowLeft}" viewBox="0 0 10 10" refX="2" refY="5" markerWidth="8" markerHeight="8" orient="auto">
            <path d="M 10 0 L 0 5 L 10 10 z" fill="currentColor" />
        </marker>
        <marker id="${arrowRight}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
    </defs>`;

    return `<svg class="coordplane" width="${VIEW_WIDTH}" height="${VIEW_HEIGHT}" viewBox="0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="座標平面">${defs}${gridLines.join('')}${axisLines.join('')}${ticks.join('')}${lineEls.join('')}${curveEls.join('')}${axisLabels.join('')}${pointEls.join('')}</svg>`;
}

/**
 * `[[coordplane ... ]]` の中身（key=value または key="value" の連なり）をパースする。
 * 失敗時は null を返す。
 */
export function parseCoordPlaneDirective(body: string): CoordPlaneOptions | null {
    const attrs = parseAttributes(body);
    if (!attrs) return null;

    const xminStr = attrs.get('xmin');
    const xmaxStr = attrs.get('xmax');
    const yminStr = attrs.get('ymin');
    const ymaxStr = attrs.get('ymax');
    if (xminStr === undefined || xmaxStr === undefined || yminStr === undefined || ymaxStr === undefined) {
        return null;
    }

    const xmin = Number(xminStr);
    const xmax = Number(xmaxStr);
    const ymin = Number(yminStr);
    const ymax = Number(ymaxStr);
    if (
        !Number.isFinite(xmin) || !Number.isFinite(xmax) || xmin >= xmax
        || !Number.isFinite(ymin) || !Number.isFinite(ymax) || ymin >= ymax
    ) {
        return null;
    }

    const points = parsePoints(attrs.get('points') ?? '');
    const curves = parseCurves(attrs.get('curves') ?? '');
    const lines = parseLines(attrs.get('lines') ?? '');

    return { xmin, xmax, ymin, ymax, points, curves, lines };
}

function parseAttributes(body: string): Map<string, string> | null {
    const result = new Map<string, string>();
    const re = /([A-Za-z_][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|(-?\.?\d[\w.\-]*))/g;
    let match: RegExpExecArray | null;
    let lastIndex = 0;
    while ((match = re.exec(body)) !== null) {
        // 属性間に未消費のテキストがあれば typo を含む DSL なので拒否する。
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

function parsePoints(spec: string): CoordPlanePoint[] {
    if (!spec.trim()) return [];
    const items = spec.split(';').map((s) => s.trim()).filter((s) => s.length > 0);
    const points: CoordPlanePoint[] = [];
    for (const item of items) {
        const colon = item.indexOf(':');
        const label = colon === -1 ? '' : item.slice(0, colon).trim();
        const coords = (colon === -1 ? item : item.slice(colon + 1)).split(',').map((s) => s.trim());
        if (coords.length !== 2) continue;
        const x = Number(coords[0]);
        const y = Number(coords[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        points.push({ label, x, y });
    }
    return points;
}

function parseLines(spec: string): CoordPlaneLine[] {
    if (!spec.trim()) return [];
    const items = spec.split(';').map((s) => s.trim()).filter((s) => s.length > 0);
    const lines: CoordPlaneLine[] = [];
    for (const item of items) {
        const eq = item.indexOf('=');
        if (eq === -1) continue;
        const lhs = item.slice(0, eq).trim().toLowerCase();
        const rhs = Number(item.slice(eq + 1).trim());
        if (!Number.isFinite(rhs)) continue;
        if (lhs === 'x') lines.push({ axis: 'x', value: rhs });
        else if (lhs === 'y') lines.push({ axis: 'y', value: rhs });
    }
    return lines;
}

function parseCurves(spec: string): CoordPlaneCurve[] {
    if (!spec.trim()) return [];
    const items = spec.split(';').map((s) => s.trim()).filter((s) => s.length > 0);
    const curves: CoordPlaneCurve[] = [];
    for (const item of items) {
        const eq = item.indexOf('=');
        if (eq === -1) continue;
        const lhs = item.slice(0, eq).trim().toLowerCase();
        if (lhs !== 'y') continue;
        const expr = item.slice(eq + 1).trim();
        const evaluator = compileExpression(expr);
        if (!evaluator) continue;
        curves.push({ expression: expr, evaluator });
    }
    return curves;
}

/**
 * `x` を変数とする算術式を評価する関数を返す。
 * サポート: 数値リテラル、`x`、`+ - * / ^`、単項マイナス、括弧、`sqrt(...)`。
 * eval / Function コンストラクタは使わず、再帰下降パーサで安全に評価する。
 */
function compileExpression(source: string): ((x: number) => number) | null {
    const tokens = tokenize(source);
    if (!tokens) return null;

    let pos = 0;

    const peek = (): Token | undefined => tokens[pos];
    const consume = (): Token | undefined => tokens[pos++];

    function parseExpression(): Node | null {
        let left = parseTerm();
        if (!left) return null;
        while (peek() && (peek()!.type === '+' || peek()!.type === '-')) {
            const op = consume()!.type as '+' | '-';
            const right = parseTerm();
            if (!right) return null;
            left = { kind: 'binary', op, left, right };
        }
        return left;
    }

    function parseTerm(): Node | null {
        // 単項は乗除より高い優先度なので term は unary を結合する。
        let left = parseUnary();
        if (!left) return null;
        while (peek() && (peek()!.type === '*' || peek()!.type === '/')) {
            const op = consume()!.type as '*' | '/';
            const right = parseUnary();
            if (!right) return null;
            left = { kind: 'binary', op, left, right };
        }
        return left;
    }

    function parseFactor(): Node | null {
        // factor: primary ('^' unary)?
        // 単項を base 側に巻き込まないことで `-x^2` を `-(x^2)` と解釈する。
        let base = parsePrimary();
        if (!base) return null;
        if (peek() && peek()!.type === '^') {
            consume();
            // 指数側は unary を許可することで `2^-3` を成立させる。右結合は
            // parseUnary → parseFactor の相互再帰で表現される。
            const exp = parseUnary();
            if (!exp) return null;
            base = { kind: 'binary', op: '^', left: base, right: exp };
        }
        return base;
    }

    function parseUnary(): Node | null {
        if (peek() && peek()!.type === '-') {
            consume();
            const inner = parseUnary();
            if (!inner) return null;
            return { kind: 'unary', op: '-', operand: inner };
        }
        if (peek() && peek()!.type === '+') {
            consume();
            return parseUnary();
        }
        // unary は factor 全体を包む（`-x^2` の場合は `-(x^2)` になる）。
        return parseFactor();
    }

    function parsePrimary(): Node | null {
        const token = consume();
        if (!token) return null;
        if (token.type === 'number') {
            return { kind: 'number', value: token.value };
        }
        if (token.type === 'x') {
            return { kind: 'x' };
        }
        if (token.type === 'sqrt') {
            const open = consume();
            if (!open || open.type !== '(') return null;
            const arg = parseExpression();
            if (!arg) return null;
            const close = consume();
            if (!close || close.type !== ')') return null;
            return { kind: 'call', name: 'sqrt', arg };
        }
        if (token.type === '(') {
            const inner = parseExpression();
            if (!inner) return null;
            const close = consume();
            if (!close || close.type !== ')') return null;
            return inner;
        }
        return null;
    }

    const ast = parseExpression();
    if (!ast || pos !== tokens.length) return null;

    return (x: number) => evaluate(ast, x);
}

type Token =
    | { type: 'number'; value: number }
    | { type: 'x' }
    | { type: 'sqrt' }
    | { type: '+' | '-' | '*' | '/' | '^' | '(' | ')' };

function tokenize(source: string): Token[] | null {
    const tokens: Token[] = [];
    let i = 0;
    while (i < source.length) {
        const ch = source[i];
        if (ch === ' ' || ch === '\t') {
            i += 1;
            continue;
        }
        if ('+-*/^()'.includes(ch)) {
            tokens.push({ type: ch as '+' | '-' | '*' | '/' | '^' | '(' | ')' });
            i += 1;
            continue;
        }
        if (ch >= '0' && ch <= '9' || ch === '.') {
            let j = i;
            while (j < source.length && (source[j] >= '0' && source[j] <= '9' || source[j] === '.')) {
                j += 1;
            }
            const num = Number(source.slice(i, j));
            if (!Number.isFinite(num)) return null;
            tokens.push({ type: 'number', value: num });
            i = j;
            continue;
        }
        if (ch === 'x' || ch === 'X') {
            tokens.push({ type: 'x' });
            i += 1;
            continue;
        }
        if (source.startsWith('sqrt', i)) {
            tokens.push({ type: 'sqrt' });
            i += 4;
            continue;
        }
        return null;
    }
    return tokens;
}

type Node =
    | { kind: 'number'; value: number }
    | { kind: 'x' }
    | { kind: 'unary'; op: '-'; operand: Node }
    | { kind: 'binary'; op: '+' | '-' | '*' | '/' | '^'; left: Node; right: Node }
    | { kind: 'call'; name: 'sqrt'; arg: Node };

function evaluate(node: Node, x: number): number {
    switch (node.kind) {
        case 'number':
            return node.value;
        case 'x':
            return x;
        case 'unary':
            return -evaluate(node.operand, x);
        case 'binary': {
            const a = evaluate(node.left, x);
            const b = evaluate(node.right, x);
            switch (node.op) {
                case '+': return a + b;
                case '-': return a - b;
                case '*': return a * b;
                case '/': return b === 0 ? Number.NaN : a / b;
                case '^': return Math.pow(a, b);
            }
            return Number.NaN;
        }
        case 'call':
            if (node.name === 'sqrt') {
                const v = evaluate(node.arg, x);
                return v < 0 ? Number.NaN : Math.sqrt(v);
            }
            return Number.NaN;
    }
}

/**
 * テキスト中の `[[coordplane ...]]` を検出し、SVG に置換する。
 * パース失敗時は元のテキストをそのまま残す。
 */
export function expandCoordPlaneDirectives(text: string): string {
    const re = /\[\[coordplane\s+([^\]]*)\]\]/g;
    return text.replace(re, (full, body: string, offset: number) => {
        const opts = parseCoordPlaneDirective(body);
        if (!opts) return full;
        // 同じ DSL を同一ページに複数置いた場合に marker id が衝突しないよう、
        // 出現位置を 36 進で suffix に渡す。
        return renderCoordPlaneSvg(opts, offset.toString(36));
    });
}

/**
 * AI 採点用に、座標平面ディレクティブを人間が読める日本語サマリに置換する。
 * SVG ではなく短いテキストで何が描かれているかを伝えるのが目的。
 * パース失敗時は元のテキストを残す。
 */
export function expandCoordPlaneDirectivesAsText(text: string): string {
    const re = /\[\[coordplane\s+([^\]]*)\]\]/g;
    return text.replace(re, (full, body: string) => {
        const opts = parseCoordPlaneDirective(body);
        if (!opts) return full;
        return summarizeCoordPlane(opts);
    });
}

function summarizeCoordPlane(opts: CoordPlaneOptions): string {
    const range = `x: ${formatNumber(opts.xmin)}〜${formatNumber(opts.xmax)} / y: ${formatNumber(opts.ymin)}〜${formatNumber(opts.ymax)}`;
    const parts: string[] = [`[座標平面 ${range}]`];

    if (opts.points.length > 0) {
        const pointStr = opts.points
            .map((p) => `${p.label ? `${p.label}` : '点'}(${formatNumber(p.x)}, ${formatNumber(p.y)})`)
            .join(', ');
        parts.push(`点: ${pointStr}`);
    }

    if (opts.curves.length > 0) {
        parts.push(`曲線: ${opts.curves.map((c) => `y=${c.expression}`).join(', ')}`);
    }

    if (opts.lines.length > 0) {
        parts.push(`直線: ${opts.lines.map((l) => `${l.axis}=${formatNumber(l.value)}`).join(', ')}`);
    }

    return parts.join(' / ');
}
