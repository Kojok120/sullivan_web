/**
 * 教科名に対する設定（色、ラベル、頭文字など）を一元管理する共通モジュール
 *
 * Phase 2 以降は jp-juken ContentPack の subjects 定義を一次ソースとし、
 * subject 名（DB の Subject.name）から SubjectConfig を解決する。
 * pack に無い名前（旧データ、社会など）は DEFAULT_CONFIG にフォールバックする。
 */

import { jpJukenPack } from '../../content/jp-juken/pack';

export type SubjectConfig = {
    letter: string;      // 頭文字: 'E', 'M', 'S', 'N'
    bgColor: string;     // Tailwind背景色: 'bg-orange-500'
    hoverColor: string;  // Tailwindホバー色: 'hover:bg-orange-600'
    label: string;       // 日本語ラベル: '英語'
    fullName: string;    // 英語名: 'English'
};

const FULL_NAME_MAP: Record<string, string> = {
    eng: 'English',
    math: 'Math',
    sci: 'Science',
    jpn: 'Japanese',
};

const SUBJECT_CONFIGS: { pattern: string; config: SubjectConfig }[] = jpJukenPack.subjects.map((subject) => ({
    pattern: subject.name,
    config: {
        letter: subject.letter,
        bgColor: subject.bgColor,
        hoverColor: subject.hoverColor,
        label: subject.localizedName?.['ja-JP'] ?? subject.name,
        fullName: FULL_NAME_MAP[subject.id] ?? subject.name,
    },
}));

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
