import Link from 'next/link';

export function TeXHelpLink() {
    return (
        <Link
            href="/problem-authoring/tex-help"
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-blue-600 underline underline-offset-4"
        >
            TeX数式の書き方ヘルプ
        </Link>
    );
}
