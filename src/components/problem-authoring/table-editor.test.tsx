import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { TableEditor } from './table-editor';

describe('TableEditor', () => {
    it('ヘッダーが空のときは作成ボタンを表示する', () => {
        const onChange = vi.fn();
        render(<TableEditor value={{ headers: [], rows: [] }} onChange={onChange} />);

        const button = screen.getByRole('button', { name: '表を作成' });
        fireEvent.click(button);

        expect(onChange).toHaveBeenCalledWith({
            headers: ['x', 'y'],
            rows: [['', '']],
        });
    });

    it('ヘッダーセルの編集で onChange が呼ばれる', () => {
        const onChange = vi.fn();
        render(
            <TableEditor
                value={{ headers: ['a', 'b'], rows: [['1', '2']] }}
                onChange={onChange}
            />,
        );

        const header = screen.getByTestId('table-header-0');
        fireEvent.change(header, { target: { value: 'x' } });

        expect(onChange).toHaveBeenCalledWith({
            headers: ['x', 'b'],
            rows: [['1', '2']],
        });
    });

    it('セルの編集で行は不変、編集セルだけ書き換わる', () => {
        const onChange = vi.fn();
        render(
            <TableEditor
                value={{ headers: ['x', 'y'], rows: [['1', '2'], ['3', '4']] }}
                onChange={onChange}
            />,
        );

        const cell = screen.getByTestId('table-cell-1-0');
        fireEvent.change(cell, { target: { value: '99' } });

        expect(onChange).toHaveBeenCalledWith({
            headers: ['x', 'y'],
            rows: [['1', '2'], ['99', '4']],
        });
    });

    it('行を追加で 1 行が末尾に増える', () => {
        const onChange = vi.fn();
        render(
            <TableEditor
                value={{ headers: ['x', 'y'], rows: [['1', '2']] }}
                onChange={onChange}
            />,
        );

        fireEvent.click(screen.getByTestId('table-add-row'));

        expect(onChange).toHaveBeenCalledWith({
            headers: ['x', 'y'],
            rows: [['1', '2'], ['', '']],
        });
    });

    it('列を追加で 1 列が末尾に増え、既存行も補完される', () => {
        const onChange = vi.fn();
        render(
            <TableEditor
                value={{ headers: ['x', 'y'], rows: [['1', '2']] }}
                onChange={onChange}
            />,
        );

        fireEvent.click(screen.getByTestId('table-add-col'));

        expect(onChange).toHaveBeenCalledWith({
            headers: ['x', 'y', ''],
            rows: [['1', '2', '']],
        });
    });

    it('列を削除すると当該列が消える', () => {
        const onChange = vi.fn();
        render(
            <TableEditor
                value={{ headers: ['x', 'y', 'z'], rows: [['1', '2', '3']] }}
                onChange={onChange}
            />,
        );

        fireEvent.click(screen.getByTestId('table-remove-col-1'));

        expect(onChange).toHaveBeenCalledWith({
            headers: ['x', 'z'],
            rows: [['1', '3']],
        });
    });

    it('最後の列を削除すると空状態に戻る', () => {
        const onChange = vi.fn();
        render(
            <TableEditor
                value={{ headers: ['x'], rows: [['1']] }}
                onChange={onChange}
            />,
        );

        fireEvent.click(screen.getByTestId('table-remove-col-0'));

        expect(onChange).toHaveBeenCalledWith({ headers: [], rows: [] });
    });

    it('行を削除すると当該行が消える', () => {
        const onChange = vi.fn();
        render(
            <TableEditor
                value={{ headers: ['x'], rows: [['1'], ['2'], ['3']] }}
                onChange={onChange}
            />,
        );

        fireEvent.click(screen.getByTestId('table-remove-row-1'));

        expect(onChange).toHaveBeenCalledWith({
            headers: ['x'],
            rows: [['1'], ['3']],
        });
    });

    it('列数上限 8 を超えると追加ボタンが disabled になる', () => {
        const headers = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        render(
            <TableEditor
                value={{ headers, rows: [headers.map(() => '')] }}
                onChange={() => {}}
            />,
        );

        expect(screen.getByTestId('table-add-col')).toBeDisabled();
    });

    it('行数上限 20 を超えると追加ボタンが disabled になる', () => {
        const rows = Array.from({ length: 20 }, () => ['']);
        render(
            <TableEditor
                value={{ headers: ['x'], rows }}
                onChange={() => {}}
            />,
        );

        expect(screen.getByTestId('table-add-row')).toBeDisabled();
    });
});
