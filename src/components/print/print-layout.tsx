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

export function PrintLayout({ studentName, subjectName, problems, studentLoginId, problemSets }: PrintLayoutProps & { problemSets?: (Problem & { customId?: string | null })[][] }) {
    const router = useRouter();

    // State now holds valid sets of paginated pages.
    // Structure: Set[] -> Page[] -> Problem[]
    const [paginatedSets, setPaginatedSets] = useState<(Problem & { customId?: string | null })[][][]>([]);
    const [isCalculating, setIsCalculating] = useState(true);
    // QR codes for each set.
    const [qrCodeDataUrls, setQrCodeDataUrls] = useState<string[]>([]);
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

        // Define sets to process. If problemSets is provided, use it. Otherwise, treat 'problems' as a single set.
        const targetSets = problemSets && problemSets.length > 0 ? problemSets : [problems];

        const calculatedSets: (Problem & { customId?: string | null })[][][] = [];
        const qrUrls: string[] = [];

        // Helper to generate QR
        const generateQR = async (setProblems: (Problem & { customId?: string | null })[]) => {
            const problemIds = setProblems.map(p => p.customId || p.id);
            const compressed = compressProblemIds(problemIds);
            const qrData = {
                s: studentLoginId,
                ...compressed
            };
            const json = JSON.stringify(qrData);
            try {
                return await QRCode.toDataURL(json, {
                    errorCorrectionLevel: 'M',
                    width: 300,
                    margin: 4
                });
            } catch (e) {
                console.error("Failed to generate QR", e);
                return '';
            }
        };

        const processSets = async () => {
            for (const currentSetProblems of targetSets) {
                // 1. Calculate Max Answer Sheet Capacity (Strict Height Calculation)
                let safeLimit = currentSetProblems.length;

                if (answerMeasureRef.current) {
                    const answerRow = answerMeasureRef.current.firstElementChild as HTMLElement;
                    if (answerRow) {
                        const rowHeight = answerRow.offsetHeight;
                        const gap = 32; // gap-8 = 2rem = 32px
                        const maxQuestions = Math.floor((availableHeight + gap) / (rowHeight + gap));
                        safeLimit = Math.min(currentSetProblems.length, maxQuestions);
                    }
                }

                const limitedProblems = currentSetProblems.slice(0, safeLimit);

                // We need to measure against the HIDDEN container which has ALL problems rendered flat.
                // However, we are iterating sets. The hidden container `measureRef` renders `problems` (all combined).
                // But we need to measure specific items.
                // Current architectural limitation: `measureRef` maps 1:1 to `problems`.
                // Use a workaround: We assume the hidden `PrintProblemItem` are uniform enough or we re-render?
                // Actually `PrintLayout` renders `problems` in the hidden area. `problems` prop IS the flat list of all problems.
                // So if we find the index of the problem in the flat list, we can find its node.

                // Construct pages for this set
                const pages: (Problem & { customId?: string | null })[][] = [];
                let currentPage: (Problem & { customId?: string | null })[] = [];
                let currentHeight = 0;

                // Find global index start
                // This assumes `problems` (flat list) order matches `targetSets` flattened order.
                // We'll iterate the `limitedProblems` and find their counterpart in the DOM.

                // Optimization: Just assume standard height? No, problems vary in height.
                // Critical: `problems` prop MUST contain all problems from all sets for the measurement to work.

                for (let i = 0; i < limitedProblems.length; i++) {
                    const problem = limitedProblems[i];
                    // Find node by ID? Or just use global index if we map it correctly.
                    // Let's use `problems.findIndex` but that's slow. 
                    // Better: The hidden `measureRef` children correspond exactly to `problems` array.
                    // We need to know which index in `problems` corresponds to `problem`.
                    const globalIndex = problems.findIndex(p => p.id === problem.id);
                    if (globalIndex === -1) continue;

                    const problemNodes = measureRef.current?.children;
                    const node = problemNodes?.[globalIndex] as HTMLElement;

                    if (!node) continue;

                    const nodeStyles = window.getComputedStyle(node);
                    const marginTop = parseFloat(nodeStyles.marginTop || '0') || 0;
                    const height = node.offsetHeight + (currentPage.length > 0 ? marginTop : 0);

                    if (currentHeight + height > availableHeight) {
                        pages.push(currentPage);
                        currentPage = [problem];
                        currentHeight = height;
                    } else {
                        currentPage.push(problem);
                        currentHeight += height;
                    }
                }

                if (currentPage.length > 0) {
                    pages.push(currentPage);
                }

                calculatedSets.push(pages);
                qrUrls.push(await generateQR(limitedProblems));
            }

            setPaginatedSets(calculatedSets);
            setQrCodeDataUrls(qrUrls);
            setIsCalculating(false);
        };

        processSets();

    }, [problems, problemSets, studentLoginId]);

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="min-h-screen bg-gray-100 p-8 print:p-0 print:bg-white print:min-h-0 print:h-auto">
            {/* Hidden Measurement Container - Renders ALL problems flat */}
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
                        A4縦で印刷してください ({paginatedSets.length}セット / 計{problems.length}問)
                    </div>
                    <Button onClick={handlePrint} disabled={isCalculating}>
                        {isCalculating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
                        印刷する
                    </Button>
                </div>
            </div>

            {/* Print Content Container */}
            {!isCalculating && (
                <div id="print-root" className="max-w-[210mm] mx-auto bg-white print:max-w-none print:w-full">
                    {paginatedSets.map((setPages, setIndex) => {
                        const totalPagesInSet = setPages.length + 1; // +1 for answer sheet
                        const flatSetProblems = setPages.flat();
                        const qrCode = qrCodeDataUrls[setIndex];
                        const setLabel = paginatedSets.length > 1 ? ` (Set ${setIndex + 1})` : '';

                        return (
                            <div key={`set-${setIndex}`}>
                                {/* Question Pages */}
                                {setPages.map((pageProblems, pageIndex) => {
                                    // Calculate start index relative to this page
                                    // But we want continuous numbering per set, usually starting at 1.
                                    const startIndex = setPages.slice(0, pageIndex).reduce((acc, p) => acc + p.length, 0);

                                    return (
                                        <div key={`set-${setIndex}-page-${pageIndex}`} className={`print-page p-[15mm] relative flex flex-col ${pageIndex > 0 || setIndex > 0 ? 'break-before-page' : ''}`}>
                                            <Header
                                                studentName={studentName}
                                                studentLoginId={studentLoginId}
                                                subjectName={subjectName + setLabel}
                                                pageNum={pageIndex + 1}
                                                totalPages={totalPagesInSet}
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

                                {/* Answer Sheet Page */}
                                <div className={`print-page p-[15mm] relative flex flex-col break-before-page answer-sheet-page`}>
                                    <Header
                                        studentName={studentName}
                                        studentLoginId={studentLoginId}
                                        subjectName={subjectName + setLabel}
                                        pageNum={totalPagesInSet}
                                        totalPages={totalPagesInSet}
                                        type="解答用紙"
                                    />

                                    {qrCode && (
                                        <div className="absolute top-[10mm] right-[10mm] w-25 h-25">
                                            <img src={qrCode} alt="QR" className="w-full h-full" />
                                        </div>
                                    )}

                                    <div className="flex-1 mt-8">
                                        <div className="flex flex-col gap-8">
                                            {flatSetProblems.map((problem, index) => (
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
                        );
                    })}
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
    header, nav, footer, .print\\:hidden {
        display: none!important;
    }
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
