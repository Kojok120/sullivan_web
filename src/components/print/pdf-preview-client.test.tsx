import type { ReactNode } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useRouter } from 'next/navigation'

import jaMessages from '@/messages/ja.json'
import { PdfPreviewClient } from './pdf-preview-client'

const { getPreferredPrintViewMock } = vi.hoisted(() => ({
    getPreferredPrintViewMock: vi.fn(() => 'pdf'),
}))

vi.mock('next/navigation', () => ({
    useRouter: vi.fn(),
}))

vi.mock('@/lib/print-view', async () => {
    const actual = await vi.importActual<typeof import('@/lib/print-view')>('@/lib/print-view')

    return {
        ...actual,
        getPreferredPrintView: getPreferredPrintViewMock,
    }
})

function renderWithIntl(ui: ReactNode) {
    const result = render(
        <NextIntlClientProvider locale="ja" messages={jaMessages}>
            {ui}
        </NextIntlClientProvider>
    )
    return {
        ...result,
        rerender: (nextUi: ReactNode) => result.rerender(
            <NextIntlClientProvider locale="ja" messages={jaMessages}>
                {nextUi}
            </NextIntlClientProvider>
        ),
    }
}

describe('PDFプレビューの戻る動作', () => {
    let originalVisibilityStateDescriptor: PropertyDescriptor | undefined
    let originalMatchMediaDescriptor: PropertyDescriptor | undefined
    let originalRequestAnimationFrameDescriptor: PropertyDescriptor | undefined
    let originalCancelAnimationFrameDescriptor: PropertyDescriptor | undefined

    const mockRouter = {
        push: vi.fn(),
        refresh: vi.fn(),
        back: vi.fn(),
        forward: vi.fn(),
        prefetch: vi.fn(),
        replace: vi.fn(),
    }

    beforeEach(() => {
        vi.clearAllMocks()
        vi.useFakeTimers()
        getPreferredPrintViewMock.mockReturnValue('pdf')
        vi.mocked(useRouter).mockReturnValue(mockRouter)
        originalVisibilityStateDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState')
        originalMatchMediaDescriptor = Object.getOwnPropertyDescriptor(window, 'matchMedia')
        originalRequestAnimationFrameDescriptor = Object.getOwnPropertyDescriptor(window, 'requestAnimationFrame')
        originalCancelAnimationFrameDescriptor = Object.getOwnPropertyDescriptor(window, 'cancelAnimationFrame')
        Object.defineProperty(window, 'opener', {
            configurable: true,
            writable: true,
            value: null,
        })
        Object.defineProperty(window, 'requestAnimationFrame', {
            configurable: true,
            writable: true,
            value: vi.fn(() => 1),
        })
        Object.defineProperty(window, 'cancelAnimationFrame', {
            configurable: true,
            writable: true,
            value: vi.fn(),
        })
    })

    afterEach(() => {
        try {
            vi.runOnlyPendingTimers()
        } catch {
            // 実タイマーに切り替えたケースでは pending timers を処理しない
        }
        vi.useRealTimers()
        vi.restoreAllMocks()

        if (originalVisibilityStateDescriptor) {
            Object.defineProperty(document, 'visibilityState', originalVisibilityStateDescriptor)
        } else {
            delete (document as { visibilityState?: DocumentVisibilityState }).visibilityState
        }

        if (originalMatchMediaDescriptor) {
            Object.defineProperty(window, 'matchMedia', originalMatchMediaDescriptor)
        } else {
            delete (window as { matchMedia?: typeof window.matchMedia }).matchMedia
        }

        if (originalRequestAnimationFrameDescriptor) {
            Object.defineProperty(window, 'requestAnimationFrame', originalRequestAnimationFrameDescriptor)
        } else {
            delete (window as { requestAnimationFrame?: typeof window.requestAnimationFrame }).requestAnimationFrame
        }

        if (originalCancelAnimationFrameDescriptor) {
            Object.defineProperty(window, 'cancelAnimationFrame', originalCancelAnimationFrameDescriptor)
        } else {
            delete (window as { cancelAnimationFrame?: typeof window.cancelAnimationFrame }).cancelAnimationFrame
        }
    })

    it('読み込み完了後も自動印刷を試みない', () => {
        renderWithIntl(
            <PdfPreviewClient
                pdfUrl="/api/print/pdf?subjectId=subject-1&sets=1&seed=seed-1&cb=initial"
                backFallbackPath="/dashboard"
            />
        )

        const iframe = screen.getByTitle('印刷プレビュー')
        const printSpy = vi.fn()
        Object.defineProperty(iframe, 'contentWindow', {
            configurable: true,
            value: {
                focus: vi.fn(),
                print: printSpy,
            },
        })

        fireEvent.load(iframe)
        act(() => {
            vi.advanceTimersByTime(1000)
        })

        expect(printSpy).not.toHaveBeenCalled()
    })

    it('pageshow persisted=true のとき iframe を再読み込みする', () => {
        renderWithIntl(
            <PdfPreviewClient
                pdfUrl="/api/print/pdf?subjectId=subject-1&sets=1&seed=seed-1&cb=initial"
                backFallbackPath="/dashboard"
            />
        )

        const iframe = screen.getByTitle('印刷プレビュー')
        const initialSrc = iframe.getAttribute('src')
        fireEvent.load(iframe)

        const event = new Event('pageshow')
        Object.defineProperty(event, 'persisted', {
            configurable: true,
            value: true,
        })

        act(() => {
            window.dispatchEvent(event)
        })

        const nextSrc = iframe.getAttribute('src')
        expect(nextSrc).not.toBe(initialSrc)
        expect(nextSrc).toContain('/api/print/pdf?')
        expect(nextSrc).toContain('subjectId=subject-1')
        expect(nextSrc).toContain('sets=1')
        expect(nextSrc).toContain('seed=seed-1')
        expect(nextSrc).not.toContain('cb=initial')
    })

    it('visible に戻ったとき iframe を再読み込みする', () => {
        renderWithIntl(
            <PdfPreviewClient
                pdfUrl="/api/print/pdf?subjectId=subject-1&sets=1&seed=seed-1&cb=initial"
                backFallbackPath="/dashboard"
            />
        )

        const iframe = screen.getByTitle('印刷プレビュー')
        const initialSrc = iframe.getAttribute('src')
        fireEvent.load(iframe)

        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => 'visible',
        })

        act(() => {
            document.dispatchEvent(new Event('visibilitychange'))
        })

        const nextSrc = iframe.getAttribute('src')
        expect(nextSrc).not.toBe(initialSrc)
        expect(nextSrc).toContain('/api/print/pdf?')
        expect(nextSrc).toContain('subjectId=subject-1')
        expect(nextSrc).toContain('sets=1')
        expect(nextSrc).toContain('seed=seed-1')
        expect(nextSrc).not.toContain('cb=initial')
    })

    it('pdfUrl が変わると iframe を新しい URL で再初期化する', () => {
        const { rerender } = renderWithIntl(
            <PdfPreviewClient
                pdfUrl="/api/print/pdf?subjectId=subject-1&sets=1&seed=seed-1&cb=initial"
                backFallbackPath="/dashboard"
            />
        )

        fireEvent.load(screen.getByTitle('印刷プレビュー'))

        rerender(
            <PdfPreviewClient
                pdfUrl="/api/print/pdf?subjectId=subject-2&sets=2&seed=seed-2&cb=next"
                backFallbackPath="/dashboard"
            />
        )

        const iframe = screen.getByTitle('印刷プレビュー')
        expect(iframe.getAttribute('src')).toContain('subjectId=subject-2')
        expect(iframe.getAttribute('src')).toContain('sets=2')
        expect(iframe.getAttribute('src')).toContain('seed=seed-2')
        expect(screen.getByText('PDFを読み込み中です...')).toBeTruthy()
    })

    it('印刷アシスト優先時は専用導線を表示する', async () => {
        vi.useRealTimers()

        renderWithIntl(
            <PdfPreviewClient
                pdfUrl="/api/print/pdf?subjectId=subject-1&sets=1"
                assistViewUrl="/dashboard/print?subjectId=subject-1&sets=1&view=assist"
                backFallbackPath="/dashboard"
                serverPreferredPrintView="assist"
            />
        )

        expect(await screen.findByRole('link', { name: '印刷アシストを開く' })).toHaveAttribute(
            'href',
            '/dashboard/print?subjectId=subject-1&sets=1&view=assist',
        )
        expect(screen.queryByTitle('印刷プレビュー')).not.toBeInTheDocument()
    })

    it('サーバー初期値が pdf でもクライアント判定で assist に切り替える', async () => {
        vi.useRealTimers()
        getPreferredPrintViewMock.mockReturnValue('assist')
        const requestAnimationFrameMock = vi.fn((callback: FrameRequestCallback) => {
            callback(0)
            return 1
        })
        Object.defineProperty(window, 'requestAnimationFrame', {
            configurable: true,
            writable: true,
            value: requestAnimationFrameMock,
        })

        renderWithIntl(
            <PdfPreviewClient
                pdfUrl="/api/print/pdf?subjectId=subject-1&sets=1"
                assistViewUrl="/dashboard/print?subjectId=subject-1&sets=1&view=assist"
                backFallbackPath="/dashboard"
                serverPreferredPrintView="auto"
            />
        )

        expect(await screen.findByRole('link', { name: '印刷アシストを開く' })).toHaveAttribute(
            'href',
            '/dashboard/print?subjectId=subject-1&sets=1&view=assist',
        )
        expect(screen.queryByTitle('印刷プレビュー')).not.toBeInTheDocument()
    })

    it('サーバー判定が未確定の間は PDF iframe を出さずにローディングを表示する', () => {
        renderWithIntl(
            <PdfPreviewClient
                pdfUrl="/api/print/pdf?subjectId=subject-1&sets=1"
                assistViewUrl="/dashboard/print?subjectId=subject-1&sets=1&view=assist"
                backFallbackPath="/dashboard"
                serverPreferredPrintView="auto"
            />
        )

        expect(screen.getByText('印刷方法を判定中です...')).toBeInTheDocument()
        expect(screen.queryByTitle('印刷プレビュー')).not.toBeInTheDocument()
    })

    it('openerがある場合は元タブをフォーカスして現在タブを閉じる', () => {
        const openerFocus = vi.fn()
        const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {})

        Object.defineProperty(window, 'opener', {
            configurable: true,
            writable: true,
            value: { focus: openerFocus, closed: false },
        })

        renderWithIntl(
            <PdfPreviewClient
                pdfUrl="/api/print/pdf?subjectId=subject-1&sets=1"
                backFallbackPath="/dashboard"
            />
        )

        fireEvent.click(screen.getByRole('button', { name: '戻る' }))

        expect(openerFocus).toHaveBeenCalledTimes(1)
        expect(closeSpy).toHaveBeenCalledTimes(1)
        expect(mockRouter.back).not.toHaveBeenCalled()
    })

    it('openerがなく履歴がない場合はタブを閉じてフォールバック遷移する', () => {
        const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {})
        vi.spyOn(window.history, 'length', 'get').mockReturnValue(1)

        renderWithIntl(
            <PdfPreviewClient
                pdfUrl="/api/print/pdf?subjectId=subject-1&sets=1"
                backFallbackPath="/dashboard"
            />
        )

        fireEvent.click(screen.getByRole('button', { name: '戻る' }))
        act(() => {
            vi.advanceTimersByTime(150)
        })

        expect(closeSpy).toHaveBeenCalledTimes(1)
        expect(mockRouter.push).toHaveBeenCalledWith('/dashboard')
        expect(mockRouter.back).not.toHaveBeenCalled()
    })

    it('openerがなく履歴がある場合は通常の戻るを実行する', () => {
        const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {})
        vi.spyOn(window.history, 'length', 'get').mockReturnValue(2)

        renderWithIntl(
            <PdfPreviewClient
                pdfUrl="/api/print/pdf?subjectId=subject-1&sets=1"
                backFallbackPath="/dashboard"
            />
        )

        fireEvent.click(screen.getByRole('button', { name: '戻る' }))

        expect(mockRouter.back).toHaveBeenCalledTimes(1)
        expect(closeSpy).not.toHaveBeenCalled()
        expect(mockRouter.push).not.toHaveBeenCalled()
    })
})
