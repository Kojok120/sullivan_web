'use client';

import Link from 'next/link';

interface Subject {
    subjectId: string;
    subjectName: string;
}

interface SubjectPrintButtonsProps {
    subjects: Subject[];
}

// 科目名から略称と色を決定するヘルパー関数
function getSubjectConfig(subjectName: string): { letter: string; bgColor: string; hoverColor: string; label: string } | null {
    if (subjectName.includes('英語')) {
        return {
            letter: 'E',
            bgColor: 'bg-orange-500',
            hoverColor: 'hover:bg-orange-600',
            label: '英語',
        };
    }
    if (subjectName.includes('数学')) {
        return {
            letter: 'M',
            bgColor: 'bg-blue-500',
            hoverColor: 'hover:bg-blue-600',
            label: '数学',
        };
    }
    if (subjectName.includes('国語')) {
        return {
            letter: 'J',
            bgColor: 'bg-green-500',
            hoverColor: 'hover:bg-green-600',
            label: '国語',
        };
    }
    return null;
}

export function SubjectPrintButtons({ subjects }: SubjectPrintButtonsProps) {
    // 科目の順番を E → M → J の順に固定
    const orderedSubjects = ['英語', '数学', '国語'];

    const sortedSubjects = subjects
        .filter(s => getSubjectConfig(s.subjectName) !== null)
        .sort((a, b) => {
            const indexA = orderedSubjects.findIndex(name => a.subjectName.includes(name));
            const indexB = orderedSubjects.findIndex(name => b.subjectName.includes(name));
            return indexA - indexB;
        });

    return (
        <div className="flex flex-col items-center gap-6 py-8">
            <h2 className="text-2xl font-bold text-foreground">問題を印刷する</h2>
            <p className="text-muted-foreground text-center">
                印刷したい科目を選択してください
            </p>
            <div className="flex items-center justify-center gap-6 flex-wrap">
                {sortedSubjects.map((subject) => {
                    const config = getSubjectConfig(subject.subjectName);
                    if (!config) return null;

                    return (
                        <Link
                            key={subject.subjectId}
                            href={`/dashboard/print?subjectId=${subject.subjectId}`}
                            className={`
                                flex flex-col items-center justify-center
                                w-28 h-28 rounded-2xl
                                ${config.bgColor} ${config.hoverColor}
                                text-white font-bold
                                shadow-lg hover:shadow-xl
                                transform hover:scale-105
                                transition-all duration-200
                            `}
                        >
                            <span className="text-5xl">{config.letter}</span>
                            <span className="text-sm mt-1">{config.label}</span>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
