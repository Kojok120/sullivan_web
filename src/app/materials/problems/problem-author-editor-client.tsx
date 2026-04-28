'use client';

import {
    ProblemEditorClient,
    type ProblemEditorClientProps,
} from '@/app/admin/problems/problem-editor-client';

type ProblemAuthorEditorClientProps = Omit<ProblemEditorClientProps, 'variant'>;

export function ProblemAuthorEditorClient({
    routeBase = '/materials/problems',
    ...props
}: ProblemAuthorEditorClientProps) {
    return <ProblemEditorClient {...props} routeBase={routeBase} variant="author" />;
}
