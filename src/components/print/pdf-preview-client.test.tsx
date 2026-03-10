import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useRouter } from 'next/navigation'

import { PdfPreviewClient } from './pdf-preview-client'

vi.mock('next/navigation', () => ({
    useRouter: vi.fn(),
}))

describe('PDFプレビューの戻る動作', () => {
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
        vi.mocked(useRouter).mockReturnValue(mockRouter)
        Object.defineProperty(window, 'opener', {
            configurable: true,
            writable: true,
            value: null,
        })
    })

    afterEach(() => {
        vi.runOnlyPendingTimers()
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it('読み込み完了後も自動印刷を試みない', () => {
        render(
            <PdfPreviewClient
                pdfUrl="/api/print/pdf?subjectId=subject-1&sets=1&cb=initial"
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
        render(
            <PdfPreviewClient
                pdfUrl="/api/print/pdf?subjectId=subject-1&sets=1&cb=initial"
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
    })

    it('visible に戻ったとき iframe を再読み込みする', () => {
        render(
            <PdfPreviewClient
                pdfUrl="/api/print/pdf?subjectId=subject-1&sets=1&cb=initial"
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
    })

    it('pdfUrl が変わると iframe を新しい URL で再初期化する', () => {
        const { rerender } = render(
            <PdfPreviewClient
                pdfUrl="/api/print/pdf?subjectId=subject-1&sets=1&cb=initial"
                backFallbackPath="/dashboard"
            />
        )

        fireEvent.load(screen.getByTitle('印刷プレビュー'))

        rerender(
            <PdfPreviewClient
                pdfUrl="/api/print/pdf?subjectId=subject-2&sets=2&cb=next"
                backFallbackPath="/dashboard"
            />
        )

        const iframe = screen.getByTitle('印刷プレビュー')
        expect(iframe.getAttribute('src')).toContain('subjectId=subject-2')
        expect(iframe.getAttribute('src')).toContain('sets=2')
        expect(screen.getByText('PDFを読み込み中です...')).toBeTruthy()
    })

    it('openerがある場合は元タブをフォーカスして現在タブを閉じる', () => {
        const openerFocus = vi.fn()
        const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {})

        Object.defineProperty(window, 'opener', {
            configurable: true,
            writable: true,
            value: { focus: openerFocus, closed: false },
        })

        render(
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

        render(
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

        render(
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
