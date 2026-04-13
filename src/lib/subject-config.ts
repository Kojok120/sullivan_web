/**
 * 教科名に対する設定（色、ラベル、頭文字など）を一元管理する共通モジュール
 */

export type SubjectConfig = {
    letter: string;      // 頭文字: 'E', 'M', 'S', 'N'
    bgColor: string;     // Tailwind背景色: 'bg-orange-500'
    hoverColor: string;  // Tailwindホバー色: 'hover:bg-orange-600'
    label: string;       // 日本語ラベル: '英語'
    fullName: string;    // 英語名: 'English'
};

const SUBJECT_CONFIGS: { pattern: string; config: SubjectConfig }[] = [
    {
        pattern: '英語',
        config: {
            letter: 'E',
            bgColor: 'bg-orange-500',
            hoverColor: 'hover:bg-orange-600',
            label: '英語',
            fullName: 'English',
        },
    },
    {
        pattern: '数学',
        config: {
            letter: 'M',
            bgColor: 'bg-blue-500',
            hoverColor: 'hover:bg-blue-600',
            label: '数学',
            fullName: 'Math',
        },
    },
    {
        pattern: '理科',
        config: {
            letter: 'S',
            bgColor: 'bg-cyan-500',
            hoverColor: 'hover:bg-cyan-600',
            label: '理科',
            fullName: 'Science',
        },
    },
    {
        pattern: '国語',
        config: {
            letter: 'N',
            bgColor: 'bg-green-500',
            hoverColor: 'hover:bg-green-600',
            label: '国語',
            fullName: 'Japanese',
        },
    },
];

const DEFAULT_CONFIG: SubjectConfig = {
    letter: '?',
    bgColor: 'bg-gray-500',
    hoverColor: 'hover:bg-gray-600',
    label: '不明',
    fullName: 'Unknown',
};

/**
 * 教科名から設定を取得
 * @param subjectName 教科名（例: '英語', '中学数学'）
 * @returns 対応するSubjectConfig
 */
export function getSubjectConfig(subjectName: string): SubjectConfig {
    for (const { pattern, config } of SUBJECT_CONFIGS) {
        if (subjectName.includes(pattern)) {
            return config;
        }
    }
    // デフォルト: 先頭文字を使用
    return {
        ...DEFAULT_CONFIG,
        letter: subjectName.charAt(0).toUpperCase() || '?',
        label: subjectName,
        fullName: subjectName,
    };
}

/**
 * 教科名から頭文字（プレフィックス）を取得
 * @param subjectName 教科名
 * @returns プレフィックス文字（例: 'E', 'M', 'S', 'N'）
 */
export function getSubjectPrefix(subjectName: string): string {
    return getSubjectConfig(subjectName).letter;
}
