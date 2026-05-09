'use client';

import { Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ProblemBodyTableData } from '@/lib/problem-editor-model';

const MAX_COLS = 8;
const MAX_ROWS = 20;

type TableEditorProps = {
    value: ProblemBodyTableData;
    onChange: (next: ProblemBodyTableData) => void;
    disabled?: boolean;
};

function normalizeRow(row: string[], columnCount: number): string[] {
    const next = row.slice(0, columnCount);
    while (next.length < columnCount) {
        next.push('');
    }
    return next;
}

function normalizeTableData(value: ProblemBodyTableData): ProblemBodyTableData {
    const headers = [...value.headers];
    if (headers.length === 0) {
        return { headers: [], rows: [] };
    }
    const rows = value.rows.map((row) => normalizeRow(row, headers.length));
    return { headers, rows };
}

export function TableEditor({ value, onChange, disabled }: TableEditorProps) {
    const data = normalizeTableData(value);
    const columnCount = data.headers.length;
    const isEmpty = columnCount === 0;

    const updateHeader = (colIndex: number, nextValue: string) => {
        const headers = [...data.headers];
        headers[colIndex] = nextValue;
        onChange({ ...data, headers });
    };

    const updateCell = (rowIndex: number, colIndex: number, nextValue: string) => {
        const rows = data.rows.map((row, r) => (
            r === rowIndex ? row.map((cell, c) => (c === colIndex ? nextValue : cell)) : row
        ));
        onChange({ ...data, rows });
    };

    const addColumn = () => {
        if (columnCount >= MAX_COLS) return;
        const headers = [...data.headers, ''];
        const rows = data.rows.map((row) => [...row, '']);
        onChange({ headers, rows });
    };

    const removeColumn = (colIndex: number) => {
        if (columnCount <= 1) {
            onChange({ headers: [], rows: [] });
            return;
        }
        const headers = data.headers.filter((_, c) => c !== colIndex);
        const rows = data.rows.map((row) => row.filter((_, c) => c !== colIndex));
        onChange({ headers, rows });
    };

    const addRow = () => {
        if (data.rows.length >= MAX_ROWS) return;
        const rows = [...data.rows, Array.from({ length: columnCount }, () => '')];
        onChange({ ...data, rows });
    };

    const removeRow = (rowIndex: number) => {
        const rows = data.rows.filter((_, r) => r !== rowIndex);
        onChange({ ...data, rows });
    };

    const initializeTable = () => {
        onChange({ headers: ['x', 'y'], rows: [['', '']] });
    };

    if (isEmpty) {
        return (
            <div className="rounded-md border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
                <p className="mb-3">表のヘッダーが空です。</p>
                <Button type="button" variant="outline" size="sm" onClick={initializeTable} disabled={disabled}>
                    <Plus className="mr-2 h-4 w-4" />
                    表を作成
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-3" data-testid="table-editor">
            <div className="overflow-x-auto rounded-md border">
                <table className="w-full border-collapse text-sm">
                    <thead className="bg-muted/40">
                        <tr>
                            {data.headers.map((header, colIndex) => (
                                <th key={colIndex} className="border-b p-2 align-top">
                                    <div className="flex items-center gap-1">
                                        <Input
                                            value={header}
                                            onChange={(event) => updateHeader(colIndex, event.target.value)}
                                            placeholder={`列${colIndex + 1}`}
                                            disabled={disabled}
                                            aria-label={`ヘッダー${colIndex + 1}`}
                                            data-testid={`table-header-${colIndex}`}
                                        />
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                                            onClick={() => removeColumn(colIndex)}
                                            disabled={disabled}
                                            aria-label={`列${colIndex + 1}を削除`}
                                            data-testid={`table-remove-col-${colIndex}`}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </th>
                            ))}
                            <th className="w-10 border-b" aria-hidden />
                        </tr>
                    </thead>
                    <tbody>
                        {data.rows.length === 0 ? (
                            <tr>
                                <td className="p-3 text-center text-xs text-muted-foreground" colSpan={columnCount + 1}>
                                    行を追加してください
                                </td>
                            </tr>
                        ) : (
                            data.rows.map((row, rowIndex) => (
                                <tr key={rowIndex} className="border-t">
                                    {row.map((cell, colIndex) => (
                                        <td key={colIndex} className="p-2 align-top">
                                            <Input
                                                value={cell}
                                                onChange={(event) => updateCell(rowIndex, colIndex, event.target.value)}
                                                placeholder="値"
                                                disabled={disabled}
                                                aria-label={`${rowIndex + 1}行${colIndex + 1}列`}
                                                data-testid={`table-cell-${rowIndex}-${colIndex}`}
                                            />
                                        </td>
                                    ))}
                                    <td className="w-10 p-2 align-top">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                            onClick={() => removeRow(rowIndex)}
                                            disabled={disabled}
                                            aria-label={`${rowIndex + 1}行目を削除`}
                                            data-testid={`table-remove-row-${rowIndex}`}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <div className="flex flex-wrap gap-2">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addRow}
                    disabled={disabled || data.rows.length >= MAX_ROWS}
                    data-testid="table-add-row"
                >
                    <Plus className="mr-1 h-4 w-4" />
                    行を追加
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addColumn}
                    disabled={disabled || columnCount >= MAX_COLS}
                    data-testid="table-add-col"
                >
                    <Plus className="mr-1 h-4 w-4" />
                    列を追加
                </Button>
                <p className="ml-auto text-xs text-muted-foreground">
                    {/* セル中の数式は <code>$x$</code> のように $ で囲って KaTeX が使えます */}
                    セル内は <code className="rounded bg-muted px-1">$式$</code> で数式が書けます（最大 {MAX_COLS} 列 × {MAX_ROWS} 行）
                </p>
            </div>
        </div>
    );
}
