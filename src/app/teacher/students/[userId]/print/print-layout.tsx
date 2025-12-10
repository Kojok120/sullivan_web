'use client';

import { Problem } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Printer, ArrowLeft, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { PrintProblemItem } from './print-problem-item';

interface PrintLayoutProps {
    studentName: string;
    subjectName: string;
    problems: (Problem & { customId?: string | null })[];
    qrCodeDataUrl?: string;
}

// ... (MAX_PAGE_HEIGHT_PX remains same)

// A4 height is 297mm. 
// We reserve space for Header (~30mm) and Footer (~20mm) and margins.
// Safe content height per page ~ 220mm.
const MAX_PAGE_HEIGHT_PX = 900; // Approximate pixel height for A4 content area at 96DPI (297mm is ~1123px, minus margins)

export function PrintLayout({ studentName, subjectName, problems, qrCodeDataUrl }: PrintLayoutProps) {
    const router = useRouter();
    const dateStr = new Date().toLocaleDateString('ja-JP');

    console.log('PrintLayout received problems:', problems);

    const [paginatedProblems, setPaginatedProblems] = useState<(Problem & { customId?: string | null })[][]>([]);
    const [isCalculating, setIsCalculating] = useState(true);
    const measureRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        if (!measureRef.current) return;

        const problemNodes = measureRef.current.children;
        const pages: (Problem & { customId?: string | null })[][] = [];
        let currentPage: (Problem & { customId?: string | null })[] = [];
        let currentHeight = 0;

        // Dynamic Max Pages if needed, or keep limit but allow dynamic count up to limit
        // Current requirement: "1〜2 ページしかない場合でも1/3...実数に合わせる"
        // So we should calculate total pages based on content.

        for (let i = 0; i < problemNodes.length; i++) {
            const node = problemNodes[i] as HTMLElement;
            const height = node.offsetHeight;

            if (currentHeight + height > MAX_PAGE_HEIGHT_PX) {
                pages.push(currentPage);
                currentPage = [problems[i]];
                currentHeight = height;
            } else {
                currentPage.push(problems[i]);
                currentHeight += height;
            }
        }

        if (currentPage.length > 0) {
            pages.push(currentPage);
        }

        setPaginatedProblems(pages);
        setIsCalculating(false);
    }, [problems]);

    const handlePrint = () => {
        window.print();
    };

    const finalProblems = paginatedProblems.flat();
    // Total pages = Question Pages + 1 Answer Sheet
    const totalPages = paginatedProblems.length + 1;

    return (
        <div className="min-h-screen bg-gray-100 p-8 print:p-0 print:bg-white print:min-h-0 print:h-auto">
            {/* Hidden Measurement Container */}
            <div
                ref={measureRef}
                className="absolute top-0 left-0 -z-50 opacity-0 pointer-events-none w-[210mm] p-[15mm] print:hidden"
                aria-hidden="true"
            >
                {problems.map((problem, index) => (
                    <PrintProblemItem
                        key={problem.id}
                        problem={problem}
                        index={index}
                        customId={problem.customId}
                        isMeasurement={true}
                    />
                ))}
            </div>

            {/* No-Print Controls */}
            <div className="max-w-[210mm] mx-auto mb-8 flex justify-between items-center print:hidden">
                <Button variant="outline" onClick={() => router.back()}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> 戻る
                </Button>
                <div className="flex gap-4">
                    <div className="text-sm text-muted-foreground self-center">
                        A4縦で印刷してください (背景のグラフィックを有効にすると綺麗です)
                    </div>
                    <Button onClick={handlePrint} disabled={isCalculating}>
                        {isCalculating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
                        印刷する
                    </Button>
                </div>
            </div>

            {/* Print Content Container - A4 Width */}
            {!isCalculating && (
                <div id="print-root" className="max-w-[210mm] mx-auto bg-white print:max-w-none print:w-full">

                    {/* Question Pages */}
                    {paginatedProblems.map((pageProblems, pageIndex) => {
                        const startIndex = paginatedProblems.slice(0, pageIndex).reduce((acc, p) => acc + p.length, 0);

                        return (
                            <div key={pageIndex} className={`print-page p-[15mm] relative flex flex-col ${pageIndex > 0 ? 'break-before-page' : ''}`}>
                                <Header
                                    studentName={studentName}
                                    subjectName={subjectName}
                                    date={dateStr}
                                    pageNum={pageIndex + 1}
                                    totalPages={totalPages}
                                    type="問題"
                                />
                                <div className="flex-1 mt-6 space-y-6">
                                    {pageProblems.map((problem, i) => (
                                        <PrintProblemItem
                                            key={problem.id}
                                            problem={problem}
                                            index={startIndex + i}
                                            customId={problem.customId}
                                        />
                                    ))}
                                </div>
                                <Footer />
                            </div>
                        );
                    })}

                    {/* Answer Sheet Page (Always Last Page) */}
                    <div className="print-page p-[15mm] relative flex flex-col break-before-page">
                        <Header studentName={studentName} subjectName={subjectName} date={dateStr} pageNum={totalPages} totalPages={totalPages} type="解答用紙" />

                        {qrCodeDataUrl && (
                            <div className="absolute top-[10mm] right-[10mm] w-24 h-24">
                                <img src={qrCodeDataUrl} alt="QR" className="w-full h-full" />
                            </div>
                        )}

                        <div className="flex-1 mt-6">
                            <div className="flex flex-col gap-8">
                                {finalProblems.map((problem, index) => (
                                    <div key={problem.id} className="flex gap-4 items-end break-inside-avoid">
                                        <div className="font-bold w-16 text-right text-xl">{problem.customId || index + 1}.</div>
                                        <div className="text-xl font-bold mb-1">A.</div>
                                        <div className="flex-1 border-b-2 border-gray-800 mb-1"></div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <Footer />
                    </div>

                </div>
            )}

            <style jsx global>{`
@media print {
    @page {
        size: A4;
        margin: 0;
    }
    body {
        background: white;
    }
    /* Hide Header and other global elements */
    header, nav, footer, .print\\:hidden {
        display: none!important;
    }

    /* Reset margins for the print container */
    #print-root {
        width: 100%;
        margin: 0;
        padding: 0;
    }

    .print-page {
        height: 297mm;
        width: 210mm;
        page-break-after: always;
        break-after: page;
        position: relative;
    }

    .print-page:last-child {
        page-break-after: auto;
        break-after: auto;
    }

    .break-before-page {
        page-break-before: always;
        break-before: page;
    }

    .break-inside-avoid {
        break-inside: avoid;
        page-break-inside: avoid;
    }
}
`}</style>
        </div>
    );
}

function Header({ studentName, subjectName, date, pageNum, totalPages, type }: {
    studentName: string, subjectName: string, date: string, pageNum: number, totalPages: number, type: string
}) {
    return (
        <div className="border-b-2 border-gray-800 pb-2 flex justify-between items-end">
            <div className="flex gap-8 items-end">
                <h1 className="text-2xl font-bold">{subjectName} {type}</h1>
                <div className="text-xl font-bold">氏名：{studentName}</div>
                <div className="text-sm font-medium mb-1">実施日: {date}</div>
            </div>
            <div className="flex gap-6 text-sm font-medium">
                <div>{pageNum} / {totalPages}</div>
            </div>
        </div>
    );
}

function Footer() {
    return (
        <div className="mt-auto pt-4 text-center text-xs text-gray-400 border-t">
            Sullivan Learning System
        </div>
    );
}
