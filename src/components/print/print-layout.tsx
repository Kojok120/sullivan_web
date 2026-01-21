'use client';
import { Problem } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Printer, ArrowLeft, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { PrintProblemItem } from './print-problem-item';
import QRCode from 'qrcode';
import { compressProblemIds } from '@/lib/qr-utils';

interface PrintLayoutProps {
    studentName: string;
    subjectName: string;
    problems: (Problem & { customId?: string | null })[];
    studentLoginId: string;
}

// ... (MAX_PAGE_HEIGHT_PX remains same)

// A4 height is 297mm. 
// We reserve space for Header (~30mm) and Footer (~20mm) and margins.
// Safe content height per page ~ 220mm.
const MAX_PAGE_HEIGHT_PX = 900; // Approximate pixel height for A4 content area at 96DPI (297mm is ~1123px, minus margins)

export function PrintLayout({ studentName, subjectName, problems, studentLoginId }: PrintLayoutProps) {
    const router = useRouter();

    const [paginatedProblems, setPaginatedProblems] = useState<(Problem & { customId?: string | null })[][]>([]);
    const [isCalculating, setIsCalculating] = useState(true);
    const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
    const measureRef = useRef<HTMLDivElement>(null);
    const contentMeasureRef = useRef<HTMLDivElement>(null);
    const answerMeasureRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        if (!measureRef.current) return;
        setIsCalculating(true);

        const listStyles = window.getComputedStyle(measureRef.current);
        const listMarginTop = parseFloat(listStyles.marginTop || '0') || 0;
        const measuredContentHeight = contentMeasureRef.current?.getBoundingClientRect().height || 0;
        const maxContentHeight = measuredContentHeight > 0 ? measuredContentHeight : MAX_PAGE_HEIGHT_PX;
        const availableHeight = Math.max(0, maxContentHeight - listMarginTop);

        // 1. Calculate Max Answer Sheet Capacity (Strict Height Calculation)
        let safeLimit = problems.length;

        if (answerMeasureRef.current) {
            const answerRow = answerMeasureRef.current.firstElementChild as HTMLElement;
            if (answerRow) {
                const rowHeight = answerRow.offsetHeight;
                const gap = 32; // gap-8 = 2rem = 32px
                // Formula: N * h + (N-1) * gap <= MAX_HEIGHT
                // N(h+g) - g <= MAX
                // N <= (MAX + g) / (h+g)
                const maxQuestions = Math.floor((availableHeight + gap) / (rowHeight + gap));
                safeLimit = Math.min(problems.length, maxQuestions);

                // Debug log (optional)
                // console.log(`Answer Sheet Capacity: ${maxQuestions}, Safe Limit: ${safeLimit}`);
            }
        }

        const limitedProblems = problems.slice(0, safeLimit);
        const problemNodes = measureRef.current.children;
        const pages: (Problem & { customId?: string | null })[][] = [];
        let currentPage: (Problem & { customId?: string | null })[] = [];
        let currentHeight = 0;

        // 2. Paginate Question Pages using the LIMITED problem set
        // Note: problemNodes corresponds to the full 'problems' list. We only iterate up to safeLimit.
        for (let i = 0; i < limitedProblems.length; i++) {
            const node = problemNodes[i] as HTMLElement;
            const nodeStyles = window.getComputedStyle(node);
            const marginTop = parseFloat(nodeStyles.marginTop || '0') || 0;
            const height = node.offsetHeight + (currentPage.length > 0 ? marginTop : 0);

            // Include item margins so pagination matches the printed layout.

            if (currentHeight + height > availableHeight) {
                pages.push(currentPage);
                currentPage = [limitedProblems[i]];
                currentHeight = height;
            } else {
                currentPage.push(limitedProblems[i]);
                currentHeight += height;
            }
        }

        if (currentPage.length > 0) {
            pages.push(currentPage);
        }

        setPaginatedProblems(pages);

        // 3. Generate QR Code based on the FINAL limited list
        const generateQR = async () => {
            const problemIds = limitedProblems.map(p => p.customId || p.id);
            const compressed = compressProblemIds(problemIds);
            const qrData = {
                s: studentLoginId,
                ...compressed
            };
            const json = JSON.stringify(qrData);
            try {
                const url = await QRCode.toDataURL(json, {
                    errorCorrectionLevel: 'M',
                    width: 300,
                    margin: 4
                });
                setQrCodeDataUrl(url);
            } catch (e) {
                console.error("Failed to generate QR", e);
            }
            setIsCalculating(false);
        };

        generateQR();

    }, [problems, studentLoginId]);

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
                className="absolute top-0 left-0 -z-50 opacity-0 pointer-events-none w-[210mm] h-[297mm] p-[15mm] print:hidden"
                aria-hidden="true"
            >
                <div className="h-full flex flex-col">
                    <Header
                        studentName={studentName}
                        studentLoginId={studentLoginId}
                        subjectName={subjectName}
                        pageNum={1}
                        totalPages={1}
                        type="問題"
                    />
                    <div ref={contentMeasureRef} className="flex-1 min-h-0 overflow-hidden">
                        <div ref={measureRef} className="mt-6 space-y-4">
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
                    </div>
                    <Footer />
                </div>
            </div>

            {/* Hidden Answer Sheet Measurement Container */}
            <div
                ref={answerMeasureRef}
                className="absolute top-0 left-0 -z-50 opacity-0 pointer-events-none w-[210mm] print:hidden"
                aria-hidden="true"
            >
                {/* Mock Answer Row to measure height */}
                <div className="flex gap-4 items-end break-inside-avoid">
                    <div className="font-bold min-w-[5.5rem] text-right text-xl whitespace-nowrap shrink-0">1.</div>
                    <div className="text-xl font-bold mb-1">A.</div>
                    <div className="flex-1 border-b-2 border-gray-800 mb-1"></div>
                </div>
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
                                    studentLoginId={studentLoginId}
                                    subjectName={subjectName}
                                    pageNum={pageIndex + 1}
                                    totalPages={totalPages}
                                    type="問題"
                                />
                                <div className="flex-1 mt-6 space-y-4">
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
                    <div className="print-page p-[15mm] relative flex flex-col break-before-page answer-sheet-page">
                        <Header
                            studentName={studentName}
                            studentLoginId={studentLoginId}
                            subjectName={subjectName}
                            pageNum={totalPages}
                            totalPages={totalPages}
                            type="解答用紙"
                        />

                        {qrCodeDataUrl && (
                            <div className="absolute top-[10mm] right-[10mm] w-25 h-25">
                                <img src={qrCodeDataUrl} alt="QR" className="w-full h-full" />
                            </div>
                        )}

                        <div className="flex-1 mt-8">
                            <div className="flex flex-col gap-8">
                                {finalProblems.map((problem, index) => (
                                    <div key={problem.id} className="flex gap-4 items-end break-inside-avoid">
                                        <div className="font-bold min-w-[5.5rem] text-right text-xl whitespace-nowrap shrink-0">{problem.customId || index + 1}.</div>
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
        box-sizing: border-box;
        overflow: hidden;
    }

    .print-page:last-child {
        page-break-after: auto;
        break-after: auto;
    }

    .answer-sheet-page {
        page-break-before: always !important;
        break-before: page !important;
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

function Header({ studentName, studentLoginId, subjectName, pageNum, totalPages, type }: {
    studentName: string, studentLoginId: string, subjectName: string, pageNum: number, totalPages: number, type: string
}) {
    return (
        <div className="border-b-2 border-gray-800 pb-2 flex justify-between items-end">
            <div className="flex gap-8 items-end">
                <h1 className="text-lg font-bold">{subjectName} {type}</h1>
                <div className="text-base font-bold">氏名：{studentName}（ID: {studentLoginId}）</div>
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
