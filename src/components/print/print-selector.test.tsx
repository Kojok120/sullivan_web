import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PrintSelector } from './print-selector'
import { useRouter } from 'next/navigation'

vi.mock('next/navigation', () => ({
    useRouter: vi.fn(),
}))

describe('PrintSelector', () => {
    const mockRouter = {
        push: vi.fn(),
        refresh: vi.fn(),
        back: vi.fn(),
        forward: vi.fn(),
        prefetch: vi.fn(),
        replace: vi.fn(),
    }

    const mockFetch = vi.fn()

    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(useRouter).mockReturnValue(mockRouter)
        vi.stubGlobal('fetch', mockFetch)
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
            expect(mockRouter.push).toHaveBeenCalledWith('/dashboard/print?subjectId=subject-1&sets=1')
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
        })

        fireEvent.click(screen.getByRole('button', { name: '講義動画ページへ移動' }))

        await waitFor(() => {
            expect(mockRouter.push).toHaveBeenCalledWith('/unit-focus/cp-1?from=print&subjectId=subject-1&sets=1')
        })
    })
})
