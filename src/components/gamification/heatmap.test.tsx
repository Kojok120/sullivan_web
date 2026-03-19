import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Heatmap } from '@/components/gamification/heatmap';

describe('Heatmap', () => {
    it('days に応じて表示日数を切り替える', () => {
        const { container, rerender } = render(<Heatmap data={[]} days={90} />);

        expect(container.querySelectorAll('[title]:not([title=""])')).toHaveLength(90);

        rerender(<Heatmap data={[]} />);

        expect(container.querySelectorAll('[title]:not([title=""])')).toHaveLength(365);
    });

    it('内部カードを持たず、横スクロール用のラッパーを返す', () => {
        const { container } = render(<Heatmap data={[]} days={90} />);

        expect(container.querySelector('[data-slot="card"]')).not.toBeInTheDocument();
        expect(container.querySelector('.overflow-x-auto')).toBeInTheDocument();
        expect(container.querySelector('.w-max')).toBeInTheDocument();
    });
});
