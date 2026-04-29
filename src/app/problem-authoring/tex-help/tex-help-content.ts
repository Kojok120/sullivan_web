export type TexHelpExample = {
    title: string;
    description: string;
    tex: string;
};

export const TEX_HELP_SECTIONS: Array<{
    title: string;
    description: string;
    examples: TexHelpExample[];
}> = [
    {
        title: '基本ルール',
        description: '本文中では `$...$`、独立した大きい数式では `$$...$$` を使います。',
        examples: [
            {
                title: '文中数式',
                description: '文章の途中に短い数式を入れたいときの基本形です。',
                tex: '点Aの座標は $(-2, 3)$ です。',
            },
            {
                title: '独立数式',
                description: '式変形や公式を1行で大きく見せたいときに使います。',
                tex: '$$y = x^2 - 4x + 3$$',
            },
        ],
    },
    {
        title: 'よく使う記法',
        description: '分数、累乗、下付き、平方根など、問題文でよく使う形です。',
        examples: [
            {
                title: '分数',
                description: '分数は `\\frac{分子}{分母}` です。',
                tex: '$$x = \\frac{3}{4}$$',
            },
            {
                title: '累乗と下付き',
                description: '累乗は `^`、下付きは `_` を使います。',
                tex: '$$a_n = 2^n + 1$$',
            },
            {
                title: '平方根',
                description: '平方根は `\\sqrt{...}` で書きます。',
                tex: '$$x = \\sqrt{5} + \\sqrt{2}$$',
            },
        ],
    },
    {
        title: '記号と定型表現',
        description: '角度、ギリシャ文字、場合分け、連立方程式などのコピペ用例です。',
        examples: [
            {
                title: '角度とギリシャ文字',
                description: '図形や三角比でよく使います。',
                tex: '$$\\angle ABC = 45^\\circ,\\ \\theta = 30^\\circ$$',
            },
            {
                title: '不等号と ±',
                description: '条件整理や解の公式で使う記号です。',
                tex: '$$x \\neq 3,\\ x = 2 \\pm \\sqrt{5}$$',
            },
            {
                title: '場合分け',
                description: '場合分けは `cases` 環境を使います。',
                tex: '$$f(x)=\\begin{cases}x+1 & (x \\ge 0) \\\\ -x & (x < 0)\\end{cases}$$',
            },
            {
                title: '連立方程式',
                description: '連立方程式も `cases` でまとめて書けます。',
                tex: '$$\\begin{cases}x+y=5 \\\\ x-y=1\\end{cases}$$',
            },
            {
                title: 'ベクトル',
                description: 'ベクトルや座標の定型例です。',
                tex: '$$\\vec{AB} = (3, -2)$$',
            },
        ],
    },
    {
        title: 'コピペ用サンプル集',
        description: '問題文でそのまま使いやすい形を集めています。',
        examples: [
            {
                title: '二次関数',
                description: '放物線や頂点の問題で使いやすい例です。',
                tex: '二次関数 $y=x^2-4x+3$ のグラフについて、頂点の座標を答えなさい。',
            },
            {
                title: '比例式',
                description: '比例・反比例や一次関数の本文用です。',
                tex: '比例定数が $a$ のとき、$y=ax$ に $x=3$ を代入した値を求めなさい。',
            },
            {
                title: '解の公式',
                description: '公式を独立表示したいときに使えます。',
                tex: '$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$',
            },
        ],
    },
];
