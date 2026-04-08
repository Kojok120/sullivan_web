import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProblemAssetPreview } from './problem-asset-preview';
import type { ProblemFigureDisplay } from '@/lib/structured-problem';

function PreviewHarness() {
    const [display, setDisplay] = React.useState<ProblemFigureDisplay>({
        zoom: 1,
        panX: 0,
        panY: 0,
    });

    return (
        <div>
            <ProblemAssetPreview
                assetId="asset-1"
                assets={[{
                    id: 'asset-1',
                    kind: 'SVG',
                    fileName: 'graph.svg',
                    mimeType: 'image/svg+xml',
                    inlineContent: '<svg width="320" height="240"><circle cx="10" cy="10" r="4" /></svg>',
                }]}
                caption="図1"
                display={display}
                editable
                onDisplayChange={setDisplay}
            />
            <output data-testid="display-state">{JSON.stringify(display)}</output>
        </div>
    );
}

describe('ProblemAssetPreview', () => {
    it('ドラッグ・ズーム・リセットで display を更新できる', () => {
        render(<PreviewHarness />);

        expect(screen.getByText('1.00x')).toBeInTheDocument();
        expect(screen.getByTestId('display-state')).toHaveTextContent('"zoom":1');

        const zoomSlider = screen.getByLabelText('拡大率');
        fireEvent.change(zoomSlider, { target: { value: '2' } });

        expect(screen.getByText('2.00x')).toBeInTheDocument();
        expect(screen.getByTestId('display-state')).toHaveTextContent('"zoom":2');

        const frame = screen.getByTestId('problem-asset-crop-frame');
        Object.defineProperty(frame, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({
                width: 200,
                height: 100,
                top: 0,
                left: 0,
                right: 200,
                bottom: 100,
                x: 0,
                y: 0,
                toJSON: () => ({}),
            }),
        });
        Object.defineProperty(frame, 'setPointerCapture', {
            configurable: true,
            value: vi.fn(),
        });

        fireEvent.pointerDown(frame, { pointerId: 1, clientX: 100, clientY: 50, button: 0, pointerType: 'mouse' });
        fireEvent.pointerMove(frame, { pointerId: 1, clientX: 150, clientY: 0, pointerType: 'mouse' });
        fireEvent.pointerUp(frame, { pointerId: 1, pointerType: 'mouse' });

        expect(screen.getByTestId('display-state')).toHaveTextContent('"panX":0.5');
        expect(screen.getByTestId('display-state')).toHaveTextContent('"panY":-1');

        fireEvent.click(screen.getByRole('button', { name: 'リセット' }));

        expect(screen.getByText('1.00x')).toBeInTheDocument();
        expect(screen.getByTestId('display-state')).toHaveTextContent('"zoom":1');
        expect(screen.getByTestId('display-state')).toHaveTextContent('"panX":0');
        expect(screen.getByTestId('display-state')).toHaveTextContent('"panY":0');

        fireEvent.change(zoomSlider, { target: { value: '0.6' } });
        expect(screen.getByText('0.60x')).toBeInTheDocument();
        expect(screen.getByTestId('display-state')).toHaveTextContent('"zoom":0.6');

        fireEvent.wheel(frame, { deltaY: 200 });
        expect(screen.getByText('0.40x')).toBeInTheDocument();
        expect(screen.getByTestId('display-state')).toHaveTextContent('"zoom":0.4');

        fireEvent.wheel(frame, { deltaY: -300 });
        expect(screen.getByText('0.70x')).toBeInTheDocument();
        expect(screen.getByTestId('display-state')).toHaveTextContent('"zoom":0.7');
    });
});
