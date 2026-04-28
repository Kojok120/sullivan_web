export type ProblemBodyCardPreviewPlacement = 'right' | 'below';

export type ProblemBodyCardUiPolicy = {
    showTextPreview: boolean;
    previewPlacement: ProblemBodyCardPreviewPlacement;
    allowAttachments: boolean;
};

const DEFAULT_POLICY: ProblemBodyCardUiPolicy = {
    showTextPreview: true,
    previewPlacement: 'below',
    allowAttachments: true,
};

function includesSubjectName(subjectName: string | null | undefined, keyword: string) {
    return subjectName?.includes(keyword) ?? false;
}

export function getProblemBodyCardUiPolicy(subjectName?: string | null): ProblemBodyCardUiPolicy {
    if (includesSubjectName(subjectName, '英語') || includesSubjectName(subjectName, '国語')) {
        return {
            showTextPreview: false,
            previewPlacement: 'below',
            allowAttachments: false,
        };
    }

    if (includesSubjectName(subjectName, '数学') || includesSubjectName(subjectName, '理科')) {
        return {
            showTextPreview: true,
            previewPlacement: 'right',
            allowAttachments: true,
        };
    }

    return DEFAULT_POLICY;
}
