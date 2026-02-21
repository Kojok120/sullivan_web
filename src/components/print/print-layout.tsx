'use client';
import { Problem } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Printer, ArrowLeft, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useRef, useLayoutEffect } from 'react';
import { PrintProblemItem } from './print-problem-item';
import QRCode from 'qrcode';
import { compressProblemIds } from '@/lib/qr-utils';

interface PrintLayoutProps {
    studentName: string;
    subjectName: string;
    problems: (Problem & { customId?: string | null })[];
    studentLoginId: string;
    problemSets?: (Problem & { customId?: string | null })[][];
}

// A4は縦297mm。ヘッダー・フッター・余白を除いた安全な描画領域を使う。
const MAX_PAGE_HEIGHT_PX = 900; // 96DPI換算の概算値（A4高さ297mm相当から余白を除いた安全域）

export function PrintLayout({ studentName, subjectName, problems, studentLoginId, problemSets }: PrintLayoutProps) {
    const router = useRouter();
    const targetSets = useMemo(
        () => (problemSets && problemSets.length > 0 ? problemSets : [problems]),
        [problemSets, problems]
    );
    const flatProblems = useMemo(() => targetSets.flat(), [targetSets]);

    // 計算後のページ構成: Set[] -> Page[] -> Problem[]
    const [paginatedSets, setPaginatedSets] = useState<(Problem & { customId?: string | null })[][][]>([]);
    const [isCalculating, setIsCalculating] = useState(true);
    // セットごとのQRコード
    const [qrCodeDataUrls, setQrCodeDataUrls] = useState<string[]>([]);
    const measureRef = useRef<HTMLDivElement>(null);
    const contentMeasureRef = useRef<HTMLDivElement>(null);
    const answerMeasureRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        if (!measureRef.current) return;

        const listStyles = window.getComputedStyle(measureRef.current);
        const listMarginTop = parseFloat(listStyles.marginTop || '0') || 0;
        const measuredContentHeight = contentMeasureRef.current?.getBoundingClientRect().height || 0;
        const maxContentHeight = measuredContentHeight > 0 ? measuredContentHeight : MAX_PAGE_HEIGHT_PX;
        const availableHeight = Math.max(0, maxContentHeight - listMarginTop);

        const calculatedSets: (Problem & { customId?: string | null })[][][] = [];
        const qrUrls: string[] = [];

        // QR生成
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
                console.error('QR生成に失敗しました', e);
                return '';
            }
        };

        const processSets = async () => {
            let globalOffset = 0;
            for (const currentSetProblems of targetSets) {
                // 1. 解答用紙に収まる最大問数を計算
                let safeLimit = currentSetProblems.length;

                if (answerMeasureRef.current) {
                    const answerRow = answerMeasureRef.current.firstElementChild as HTMLElement;
                    if (answerRow) {
                        const rowHeight = answerRow.offsetHeight;
                        const gap = 48; // gap-12 = 3rem
                        const maxQuestions = Math.floor((availableHeight + gap) / (rowHeight + gap));
                        safeLimit = Math.min(currentSetProblems.length, Math.max(1, maxQuestions));
                    }
                }

                const limitedProblems = currentSetProblems.slice(0, safeLimit);

                // 2. 問題ページを組み立て
                const pages: (Problem & { customId?: string | null })[][] = [];
                let currentPage: (Problem & { customId?: string | null })[] = [];
                let currentHeight = 0;

                for (let i = 0; i < limitedProblems.length; i++) {
                    const problem = limitedProblems[i];
                    const globalIndex = globalOffset + i;

                    const problemNodes = measureRef.current?.children;
                    const node = problemNodes?.[globalIndex] as HTMLElement;
                    let height = 120;
                    if (!node) {
                        // 計測DOMと配列の不整合は問題を落とす原因になるため、警告を出しつつフォールバックで継続する
                        console.warn('印刷レイアウト計測でDOM不整合を検知しました', {
                            globalIndex,
                            problemId: problem.id,
                            flatProblemsLength: flatProblems.length,
                            measuredNodesLength: problemNodes?.length ?? 0,
                        });
                    } else {
                        const nodeStyles = window.getComputedStyle(node);
                        const marginTop = parseFloat(nodeStyles.marginTop || '0') || 0;
                        height = node.offsetHeight + (currentPage.length > 0 ? marginTop : 0);
                    }

                    if (currentHeight + height > availableHeight) {
                        if (currentPage.length > 0) {
                            pages.push(currentPage);
                            currentPage = [problem];
                            currentHeight = height;
                        } else {
                            // 1問だけでページ上限を超える場合でも空ページは作らない
                            currentPage.push(problem);
                            currentHeight = height;
                        }
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
                globalOffset += currentSetProblems.length;
            }

            setPaginatedSets(calculatedSets);
            setQrCodeDataUrls(qrUrls);
            setIsCalculating(false);
        };

        processSets();

    }, [flatProblems, studentLoginId, targetSets]);

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="min-h-screen bg-gray-100 p-8 print:p-0 print:bg-white print:min-h-0 print:h-auto">
            {/* 高さ計測コンテナ（全問題をフラットに描画） */}
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
                            {flatProblems.map((problem, index) => (
                                <PrintProblemItem
                                    key={`${problem.id}-${index}`}
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

            {/* 解答用紙の高さ計測コンテナ */}
            <div
                ref={answerMeasureRef}
                className="absolute top-0 left-0 -z-50 opacity-0 pointer-events-none w-[210mm] print:hidden"
                aria-hidden="true"
            >
                {/* 高さ計測用のダミー解答行 */}
                <div className="flex gap-4 items-end break-inside-avoid">
                    <div className="font-bold min-w-[5.5rem] text-right text-xl whitespace-nowrap shrink-0">1.</div>
                    <div className="text-xl font-bold mb-1">A.</div>
                    <div className="flex-1 border-b-2 border-gray-800 mb-1"></div>
                </div>
            </div>

            {/* 印刷時は非表示の操作領域 */}
            <div className="max-w-[210mm] mx-auto mb-8 flex justify-between items-center print:hidden">
                <Button variant="outline" onClick={() => router.back()}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> 戻る
                </Button>
                <div className="flex gap-4">
                    <div className="text-sm text-muted-foreground self-center">
                        A4縦で印刷してください ({paginatedSets.length}セット / 計{flatProblems.length}問)
                    </div>
                    <Button onClick={handlePrint} disabled={isCalculating}>
                        {isCalculating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
                        印刷する
                    </Button>
                </div>
            </div>

            {/* 印刷コンテンツ */}
            {!isCalculating && (
                <div id="print-root" className="max-w-[210mm] mx-auto bg-white print:max-w-none print:w-full">
                    {paginatedSets.map((setPages, setIndex) => {
                        const totalPagesInSet = setPages.length + 1; // 解答用紙1ページを加算
                        const flatSetProblems = setPages.flat();
                        const qrCode = qrCodeDataUrls[setIndex];
                        const setLabel = paginatedSets.length > 1 ? ` (Set ${setIndex + 1})` : '';
                        const shouldBreakBeforeAnswer = setPages.length > 0 || setIndex > 0;

                        return (
                            <div key={`set-${setIndex}`}>
                                {/* 問題ページ */}
                                {setPages.map((pageProblems, pageIndex) => {
                                    // セット内で連番になるよう、このページ先頭の開始番号を計算
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

                                {/* 解答用紙ページ */}
                                <div className={`print-page p-[15mm] relative flex flex-col ${shouldBreakBeforeAnswer ? 'break-before-page' : ''}`}>
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
                                            <Image
                                                src={qrCode}
                                                alt="QR"
                                                width={100}
                                                height={100}
                                                className="w-full h-full"
                                                unoptimized
                                            />
                                        </div>
                                    )}

                                    <div className="flex-1 mt-16">
                                        <div className="flex flex-col gap-12">
                                            {flatSetProblems.map((problem, index) => (
                                                <div key={`${problem.id}-${index}`} className="flex gap-4 items-end break-inside-avoid">
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
        position: relative;
        box-sizing: border-box;
        overflow: hidden;
    }
    .break-before-page {
        page-break-before: always !important;
        break-before: page !important;
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
            Sullivan
        </div>
    );
}
