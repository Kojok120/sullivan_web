import { describe, expect, it } from 'vitest';

import { getProblemBodyCardUiPolicy } from './problem-body-card-ui-policy';

describe('getProblemBodyCardUiPolicy', () => {
    it('英語では本文確認を表示せず添付も無効にする', () => {
        expect(getProblemBodyCardUiPolicy('英語')).toEqual({
            showTextPreview: false,
            previewPlacement: 'below',
            allowAttachments: false,
        });
    });

    it('国語では本文確認を表示せず添付も無効にする', () => {
        expect(getProblemBodyCardUiPolicy('国語')).toEqual({
            showTextPreview: false,
            previewPlacement: 'below',
            allowAttachments: false,
        });
    });

    it('数学では本文確認を右側に表示して添付も有効にする', () => {
        expect(getProblemBodyCardUiPolicy('数学')).toEqual({
            showTextPreview: true,
            previewPlacement: 'right',
            allowAttachments: true,
        });
    });

    it('理科では本文確認を右側に表示して添付も有効にする', () => {
        expect(getProblemBodyCardUiPolicy('理科')).toEqual({
            showTextPreview: true,
            previewPlacement: 'right',
            allowAttachments: true,
        });
    });

    it('未知の科目では従来どおり本文確認を下に表示する', () => {
        expect(getProblemBodyCardUiPolicy('社会')).toEqual({
            showTextPreview: true,
            previewPlacement: 'below',
            allowAttachments: true,
        });
    });
});
