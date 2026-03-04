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
                autoPrint={false}
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
                autoPrint={false}
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
                autoPrint={false}
                backFallbackPath="/dashboard"
            />
        )

        fireEvent.click(screen.getByRole('button', { name: '戻る' }))

        expect(mockRouter.back).toHaveBeenCalledTimes(1)
        expect(closeSpy).not.toHaveBeenCalled()
        expect(mockRouter.push).not.toHaveBeenCalled()
    })
})
