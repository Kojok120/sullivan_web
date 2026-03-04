import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PrintSelector } from './print-selector'
import { useRouter } from 'next/navigation'

vi.mock('next/navigation', () => ({
    useRouter: vi.fn(),
}))

describe('印刷セレクター', () => {
    const mockRouter = {
        push: vi.fn(),
        refresh: vi.fn(),
        back: vi.fn(),
        forward: vi.fn(),
        prefetch: vi.fn(),
        replace: vi.fn(),
    }

    const mockFetch = vi.fn()
    const mockPopupClose = vi.fn()
    const mockPopup = {
        location: { href: '' },
        closed: false,
        close: mockPopupClose,
    } as unknown as Window

    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(useRouter).mockReturnValue(mockRouter)
        vi.stubGlobal('fetch', mockFetch)
        vi.stubGlobal('open', vi.fn(() => mockPopup))
        mockPopup.location.href = ''
        mockPopupClose.mockClear()
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('印刷可能な場合は印刷ページへ遷移する', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ blocked: false }),
        })

        render(
            <PrintSelector
                subjects={[{ subjectId: 'subject-1', subjectName: '英語' }]}
            />
        )

        fireEvent.click(screen.getByText('English'))
        fireEvent.click(screen.getByRole('button', { name: '印刷する' }))

        await waitFor(() => {
            expect(mockFetch).toHaveBeenCalledWith('/api/print-gate?subjectId=subject-1', {
                method: 'GET',
                cache: 'no-store',
            })
            expect(window.open).toHaveBeenCalledWith('', '_blank')
            expect(mockPopup.location.href).toBe('/dashboard/print?subjectId=subject-1&sets=1&gateChecked=1')
        })
    })

    it('未視聴講義がある場合はモーダルを表示して講義ページへ誘導する', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                blocked: true,
                coreProblemId: 'cp-1',
                coreProblemName: '主語と動詞',
            }),
        })

        render(
            <PrintSelector
                subjects={[{ subjectId: 'subject-1', subjectName: '英語' }]}
            />
        )

        fireEvent.click(screen.getByText('English'))
        fireEvent.click(screen.getByRole('button', { name: '印刷する' }))

        await waitFor(() => {
            expect(screen.getByText('「主語と動詞」がアンロックされました')).toBeInTheDocument()
            expect(screen.getByText('印刷するには「主語と動詞」の講義動画を視聴してください。')).toBeInTheDocument()
            expect(mockPopupClose).toHaveBeenCalledTimes(1)
        })

        fireEvent.click(screen.getByRole('button', { name: '講義動画ページへ移動' }))

        await waitFor(() => {
            expect(mockRouter.push).toHaveBeenCalledWith('/unit-focus/cp-1?from=print&subjectId=subject-1&sets=1')
        })
    })

    it('印刷ゲート判定APIが失敗した場合は印刷ページへ遷移しない', async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            status: 500,
        })

        render(
            <PrintSelector
                subjects={[{ subjectId: 'subject-1', subjectName: '英語' }]}
            />
        )

        fireEvent.click(screen.getByText('English'))
        fireEvent.click(screen.getByRole('button', { name: '印刷する' }))

        await waitFor(() => {
            expect(mockRouter.push).not.toHaveBeenCalled()
            expect(screen.getByText('印刷可否の確認に失敗しました。通信状態を確認して、もう一度お試しください。')).toBeInTheDocument()
        })
    })

    it('科目選択後のモーダル外をタップするとモーダルが閉じる', async () => {
        render(
            <PrintSelector
                subjects={[{ subjectId: 'subject-1', subjectName: '英語' }]}
            />
        )

        fireEvent.click(screen.getByText('English'))
        expect(screen.getByRole('button', { name: '印刷する' })).toBeInTheDocument()

        fireEvent.pointerDown(document.body)

        await waitFor(() => {
            expect(screen.queryByRole('button', { name: '印刷する' })).not.toBeInTheDocument()
        })
    })

    it('同じ科目を再タップするとセット数が増える', async () => {
        render(
            <PrintSelector
                subjects={[{ subjectId: 'subject-1', subjectName: '英語' }]}
            />
        )

        fireEvent.click(screen.getByText('English'))
        expect(screen.getByText('10問 / 1セット')).toBeInTheDocument()

        fireEvent.click(screen.getByText('English'))

        await waitFor(() => {
            expect(screen.getByText('20問 / 2セット')).toBeInTheDocument()
        })
    })
})
