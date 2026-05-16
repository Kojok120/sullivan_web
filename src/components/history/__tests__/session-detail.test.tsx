import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { SessionDetail } from '../session-detail'
import * as analytics from '@/lib/analytics'
import * as surveyActions from '@/actions/survey'
import * as auth from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import fs from 'fs'
import type { MouseEventHandler, ReactNode } from 'react'
import jaMessages from '@/messages/ja.json'

type LinkProps = {
    children?: ReactNode
    href: string
}

type CardProps = {
    children?: ReactNode
    className?: string
}

type BadgeProps = {
    children?: ReactNode
    variant?: string
}

type ButtonProps = {
    children?: ReactNode
    onClick?: MouseEventHandler<HTMLButtonElement>
}

type VideoPlayerDialogProps = {
    videoUrl?: string | null
    isWatched?: boolean
}

type LectureVideoButtonProps = {
    videos?: { title: string; url: string }[]
    coreProblemName?: string
}

type DateDisplayProps = {
    date: Date
}

type SurveyModalProps = {
    userId: string
}

type SessionReviewTrackerProps = {
    groupId: string
}

type SessionDetailMock = {
    id: string
    evaluation: 'A' | 'B' | 'C' | 'D'
    userAnswer: string
    feedback: string
    answeredAt: Date
    isVideoWatched: boolean
    problem: {
        question?: string
        answer: string | null
        customId: string
        videoUrl: string | null
        publishedRevision?: {
            structuredContent: unknown
            correctAnswer: string | null
            acceptedAnswers: string[]
        } | null
        coreProblems: {
            name: string
            subject: {
                name: string
            }
            lectureVideos: { title: string; url: string }[]
        }[]
    }
}

function buildPublishedRevisionFromMock(problem: SessionDetailMock['problem']): SessionDetailMock['problem']['publishedRevision'] {
    if (problem.publishedRevision !== undefined) {
        return problem.publishedRevision
    }
    if (!problem.question) {
        return null
    }
    return {
        structuredContent: {
            version: 1,
            blocks: [
                { id: 'block-1', type: 'paragraph', text: problem.question },
            ],
        },
        correctAnswer: problem.answer ?? null,
        acceptedAnswers: [],
    }
}

type SessionDetailsResult = Awaited<ReturnType<typeof analytics.getSessionDetails>>

function IntlWrapper({ children }: { children: ReactNode }) {
    return (
        <NextIntlClientProvider locale="ja" messages={jaMessages}>
            {children}
        </NextIntlClientProvider>
    )
}

function renderWithIntl(ui: ReactNode) {
    return render(ui, { wrapper: IntlWrapper })
}

// Mock external dependencies
vi.mock('@/lib/analytics', () => ({
    getSessionDetails: vi.fn(),
    markSessionAsReviewed: vi.fn(),
}))

vi.mock('next-intl/server', async () => {
    const messages = (await import('@/messages/ja.json')).default as unknown as Record<string, Record<string, string>>

    return {
        getTranslations: vi.fn(async (namespace: string) => {
            const namespaceMessages = messages[namespace]

            return (key: string, values?: Record<string, string | number>) => {
                const message = namespaceMessages[key]

                if (!values) {
                    return message
                }

                return Object.entries(values).reduce(
                    (current, [name, value]) => current.replaceAll(`{${name}}`, String(value)),
                    message
                )
            }
        }),
    }
})

vi.mock('@/actions/survey', () => ({
    checkSurveyEligibility: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
    getSession: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
    prisma: {
        user: {
            findUnique: vi.fn(),
        },
    },
}))

vi.mock('fs', () => ({
    default: {
        readFileSync: vi.fn(),
    },
}))

vi.mock('next/link', () => ({
    default: ({ children, href }: LinkProps) => <a href={href}>{children}</a>,
}))

vi.mock('@/components/ui/card', () => ({
    Card: ({ children, className }: CardProps) => <div className={className}>{children}</div>,
    CardContent: ({ children }: CardProps) => <div>{children}</div>,
    CardHeader: ({ children }: CardProps) => <div>{children}</div>,
    CardTitle: ({ children }: CardProps) => <h3>{children}</h3>,
}))

vi.mock('@/components/ui/badge', () => ({
    Badge: ({ children, variant }: BadgeProps) => <span data-variant={variant}>{children}</span>,
}))

vi.mock('@/components/ui/button', () => ({
    Button: ({ children, onClick }: ButtonProps) => <button onClick={onClick}>{children}</button>,
}))

vi.mock('@/components/video-player-dialog', () => ({
    VideoPlayerDialog: ({ videoUrl, isWatched }: VideoPlayerDialogProps) => (
        <div data-testid="video-player" data-url={videoUrl} data-watched={isWatched}>
            Video Player
        </div>
    ),
}))

vi.mock('@/components/lecture-video-button', () => ({
    LectureVideoButton: ({ videos = [], coreProblemName }: LectureVideoButtonProps) => (
        <div data-testid="lecture-video" data-count={videos.length}>
            Lecture: {coreProblemName}
        </div>
    ),
}))

vi.mock('@/components/ui/date-display', () => ({
    DateDisplay: ({ date }: DateDisplayProps) => <span>{date.toISOString()}</span>,
}))

vi.mock('@/components/voice/phone-tutor-button', () => ({
    PhoneTutorButton: () => <button>Phone Tutor</button>,
}))

vi.mock('@/components/voice/chat-tutor-button', () => ({
    ChatTutorButton: () => <button>Chat Tutor</button>,
}))

vi.mock('@/components/survey/SurveyModal', () => ({
    SurveyModal: ({ userId }: SurveyModalProps) => <div data-testid="survey-modal" data-user-id={userId}>Survey Modal</div>,
}))

vi.mock('@/components/history/session-review-tracker', () => ({
    SessionReviewTracker: ({ groupId }: SessionReviewTrackerProps) => (
        <div data-testid="session-review-tracker" data-group-id={groupId}>
            Session Review Tracker
        </div>
    ),
}))

describe('SessionDetail', () => {
    const mockSystemPrompt = '# System Prompt Content'

    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(fs.readFileSync).mockReturnValue(mockSystemPrompt)
        vi.mocked(auth.getSession).mockResolvedValue({
            userId: 'user1',
            role: 'STUDENT',
            name: '生徒1',
            defaultPackId: 'jp-juken',
            allowedPackIds: ['jp-juken'],
        })
        vi.mocked(prisma.user.findUnique).mockResolvedValue({
            classroom: {
                plan: 'PREMIUM',
            },
        } as never)
    })

    const createMockSessionDetail = (overrides: Partial<SessionDetailMock> = {}): SessionDetailMock => ({
        id: 'history1',
        evaluation: 'A',
        userAnswer: 'ユーザーの回答',
        feedback: 'フィードバック内容',
        answeredAt: new Date('2024-01-15T10:00:00Z'),
        isVideoWatched: false,
        problem: {
            question: '問題文',
            answer: '正答',
            customId: 'E-1',
            videoUrl: 'https://example.com/video.mp4',
            coreProblems: [
                {
                    name: '単元名',
                    subject: {
                        name: '数学',
                    },
                    lectureVideos: [
                        { title: '講義1', url: 'https://example.com/lecture1.mp4' },
                    ],
                },
            ],
        },
        ...overrides,
    })

    const mockSessionDetails = (details: SessionDetailMock[] | null) => {
        if (details === null) {
            vi.mocked(analytics.getSessionDetails).mockImplementation(
                async () => null as unknown as SessionDetailsResult
            )
            return
        }
        const withRevision = details.map((detail) => ({
            ...detail,
            problem: {
                ...detail.problem,
                publishedRevision: buildPublishedRevisionFromMock(detail.problem),
            },
        }))
        vi.mocked(analytics.getSessionDetails).mockResolvedValue(
            withRevision as unknown as SessionDetailsResult
        )
    }

    describe('基本表示', () => {
        it('履歴がない場合、メッセージを表示する', async () => {
            mockSessionDetails([])

            const { container } = renderWithIntl(
                await SessionDetail({ groupId: 'group1', userId: 'user1' })
            )

            expect(container.textContent).toContain('履歴が見つかりません')
        })

        it('履歴がnullの場合、メッセージを表示する', async () => {
            mockSessionDetails(null)

            const { container } = renderWithIntl(
                await SessionDetail({ groupId: 'group1', userId: 'user1' })
            )

            expect(container.textContent).toContain('履歴が見つかりません')
        })

        it('教科名とタイトルを表示する', async () => {
            const mockDetails = [createMockSessionDetail()]
            mockSessionDetails(mockDetails)
            vi.mocked(surveyActions.checkSurveyEligibility).mockResolvedValue(false)

            const { container } = renderWithIntl(
                await SessionDetail({ groupId: 'group1', userId: 'user1' })
            )

            expect(container.textContent).toContain('数学')
            expect(container.textContent).toContain('採点結果')
        })

        it('複数の問題を表示する', async () => {
            const mockDetails = [
                createMockSessionDetail({ id: 'h1', problem: { ...createMockSessionDetail().problem, question: '問題1' } }),
                createMockSessionDetail({ id: 'h2', problem: { ...createMockSessionDetail().problem, question: '問題2' } }),
            ]
            mockSessionDetails(mockDetails)
            vi.mocked(surveyActions.checkSurveyEligibility).mockResolvedValue(false)

            const { container } = renderWithIntl(
                await SessionDetail({ groupId: 'group1', userId: 'user1' })
            )

            expect(container.textContent).toContain('問題1')
            expect(container.textContent).toContain('問題2')
        })
    })

    describe('評価バッジ', () => {
        it('正答（A評価）の場合、defaultバリアントを使用する', async () => {
            const mockDetails = [createMockSessionDetail({ evaluation: 'A' })]
            mockSessionDetails(mockDetails)
            vi.mocked(surveyActions.checkSurveyEligibility).mockResolvedValue(false)

            const { container } = renderWithIntl(
                await SessionDetail({ groupId: 'group1', userId: 'user1' })
            )

            const badge = container.querySelector('[data-variant="default"]')
            expect(badge).toBeTruthy()
            expect(badge?.textContent).toBe('A')
        })

        it('正答（B評価）の場合、defaultバリアントを使用する', async () => {
            const mockDetails = [createMockSessionDetail({ evaluation: 'B' })]
            mockSessionDetails(mockDetails)
            vi.mocked(surveyActions.checkSurveyEligibility).mockResolvedValue(false)

            const { container } = renderWithIntl(
                await SessionDetail({ groupId: 'group1', userId: 'user1' })
            )

            const badge = container.querySelector('[data-variant="default"]')
            expect(badge).toBeTruthy()
            expect(badge?.textContent).toBe('B')
        })

        it('誤答（C評価）の場合、destructiveバリアントを使用する', async () => {
            const mockDetails = [createMockSessionDetail({ evaluation: 'C' })]
            mockSessionDetails(mockDetails)
            vi.mocked(surveyActions.checkSurveyEligibility).mockResolvedValue(false)

            const { container } = renderWithIntl(
                await SessionDetail({ groupId: 'group1', userId: 'user1' })
            )

            const badge = container.querySelector('[data-variant="destructive"]')
            expect(badge).toBeTruthy()
            expect(badge?.textContent).toBe('C')
        })

        it('誤答（D評価）の場合、destructiveバリアントを使用する', async () => {
            const mockDetails = [createMockSessionDetail({ evaluation: 'D' })]
            mockSessionDetails(mockDetails)
            vi.mocked(surveyActions.checkSurveyEligibility).mockResolvedValue(false)

            const { container } = renderWithIntl(
                await SessionDetail({ groupId: 'group1', userId: 'user1' })
            )

            const badge = container.querySelector('[data-variant="destructive"]')
            expect(badge).toBeTruthy()
            expect(badge?.textContent).toBe('D')
        })
    })

    describe('問題表示', () => {
        it('問題文を表示する', async () => {
            const mockDetails = [createMockSessionDetail()]
            mockSessionDetails(mockDetails)
            vi.mocked(surveyActions.checkSurveyEligibility).mockResolvedValue(false)

            const { container } = renderWithIntl(
                await SessionDetail({ groupId: 'group1', userId: 'user1' })
            )

            expect(container.textContent).toContain('問題文')
        })

        it('ユーザーの解答を表示する', async () => {
            const mockDetails = [createMockSessionDetail({ userAnswer: 'ユーザーの解答テスト' })]
            mockSessionDetails(mockDetails)
            vi.mocked(surveyActions.checkSurveyEligibility).mockResolvedValue(false)

            const { container } = renderWithIntl(
                await SessionDetail({ groupId: 'group1', userId: 'user1' })
            )

            expect(container.textContent).toContain('ユーザーの解答テスト')
        })

        it('正答を表示する', async () => {
            const mockDetails = [createMockSessionDetail()]
            mockSessionDetails(mockDetails)
            vi.mocked(surveyActions.checkSurveyEligibility).mockResolvedValue(false)

            const { container } = renderWithIntl(
                await SessionDetail({ groupId: 'group1', userId: 'user1' })
            )

            expect(container.textContent).toContain('正答')
        })

        it('フィードバックを表示する', async () => {
            const mockDetails = [createMockSessionDetail({ feedback: 'フィードバックテスト内容' })]
            mockSessionDetails(mockDetails)
            vi.mocked(surveyActions.checkSurveyEligibility).mockResolvedValue(false)

            const { container } = renderWithIntl(
                await SessionDetail({ groupId: 'group1', userId: 'user1' })
            )

            expect(container.textContent).toContain('フィードバックテスト内容')
        })

        it('customIdがある場合、それを表示する', async () => {
            const mockDetails = [createMockSessionDetail()]
            mockSessionDetails(mockDetails)
            vi.mocked(surveyActions.checkSurveyEligibility).mockResolvedValue(false)

            const { container } = renderWithIntl(
                await SessionDetail({ groupId: 'group1', userId: 'user1' })
            )

            expect(container.textContent).toContain('E-1')
        })
    })

    describe('動画機能', () => {
        it('復習動画がある場合、VideoPlayerDialogを表示する', async () => {
            const mockDetails = [createMockSessionDetail()]
            mockSessionDetails(mockDetails)
            vi.mocked(surveyActions.checkSurveyEligibility).mockResolvedValue(false)

            renderWithIntl(await SessionDetail({ groupId: 'group1', userId: 'user1' }))

            const videoPlayer = screen.getByTestId('video-player')
            expect(videoPlayer).toBeTruthy()
            expect(videoPlayer.getAttribute('data-url')).toBe('https://example.com/video.mp4')
        })

        it('講義動画がある場合、LectureVideoButtonを表示する', async () => {
            const mockDetails = [createMockSessionDetail()]
            mockSessionDetails(mockDetails)
            vi.mocked(surveyActions.checkSurveyEligibility).mockResolvedValue(false)

            renderWithIntl(await SessionDetail({ groupId: 'group1', userId: 'user1' }))

            const lectureVideo = screen.getByTestId('lecture-video')
            expect(lectureVideo).toBeTruthy()
            expect(lectureVideo.getAttribute('data-count')).toBe('1')
        })

        it('動画がない場合、VideoPlayerDialogを表示しない', async () => {
            const mockDetails = [createMockSessionDetail({
                problem: {
                    ...createMockSessionDetail().problem,
                    videoUrl: null,
                }
            })]
            mockSessionDetails(mockDetails)
            vi.mocked(surveyActions.checkSurveyEligibility).mockResolvedValue(false)

            renderWithIntl(await SessionDetail({ groupId: 'group1', userId: 'user1' }))

            const videoPlayers = screen.queryAllByTestId('video-player')
            expect(videoPlayers).toHaveLength(0)
        })
    })

    describe('レビュー済みマーク', () => {
        it('生徒ビューの場合、SessionReviewTrackerを表示する', async () => {
            const mockDetails = [createMockSessionDetail()]
            mockSessionDetails(mockDetails)
            vi.mocked(surveyActions.checkSurveyEligibility).mockResolvedValue(false)

            renderWithIntl(await SessionDetail({ groupId: 'group1', userId: 'user1', isTeacherView: false }))

            const tracker = screen.getByTestId('session-review-tracker')
            expect(tracker).toBeTruthy()
            expect(tracker.getAttribute('data-group-id')).toBe('group1')
        })

        it('教師ビューの場合、SessionReviewTrackerを表示しない', async () => {
            const mockDetails = [createMockSessionDetail()]
            mockSessionDetails(mockDetails)

            renderWithIntl(await SessionDetail({ groupId: 'group1', userId: 'user1', isTeacherView: true }))

            expect(screen.queryByTestId('session-review-tracker')).toBeFalsy()
        })

        it('表示対象が現在ユーザーと異なる場合はSessionReviewTrackerを表示しない', async () => {
            const mockDetails = [createMockSessionDetail()]
            mockSessionDetails(mockDetails)
            vi.mocked(auth.getSession).mockResolvedValue({
                userId: 'other-user',
                role: 'STUDENT',
                name: '別の生徒',
                defaultPackId: 'jp-juken',
                allowedPackIds: ['jp-juken'],
            })
            vi.mocked(surveyActions.checkSurveyEligibility).mockResolvedValue(false)

            renderWithIntl(await SessionDetail({ groupId: 'group1', userId: 'user1', isTeacherView: false }))

            expect(screen.queryByTestId('session-review-tracker')).toBeFalsy()
        })
    })

    describe('アンケート機能', () => {
        it('生徒ビューで対象の場合、SurveyModalを表示する', async () => {
            const mockDetails = [createMockSessionDetail()]
            mockSessionDetails(mockDetails)
            vi.mocked(surveyActions.checkSurveyEligibility).mockResolvedValue(true)

            renderWithIntl(await SessionDetail({ groupId: 'group1', userId: 'user1', isTeacherView: false }))

            const surveyModal = screen.getByTestId('survey-modal')
            expect(surveyModal).toBeTruthy()
            expect(surveyModal.getAttribute('data-user-id')).toBe('user1')
        })

        it('生徒ビューで対象外の場合、SurveyModalを表示しない', async () => {
            const mockDetails = [createMockSessionDetail()]
            mockSessionDetails(mockDetails)
            vi.mocked(surveyActions.checkSurveyEligibility).mockResolvedValue(false)

            renderWithIntl(await SessionDetail({ groupId: 'group1', userId: 'user1', isTeacherView: false }))

            const surveyModal = screen.queryByTestId('survey-modal')
            expect(surveyModal).toBeFalsy()
        })

        it('教師ビューの場合、SurveyModalを表示しない', async () => {
            const mockDetails = [createMockSessionDetail()]
            mockSessionDetails(mockDetails)

            renderWithIntl(await SessionDetail({ groupId: 'group1', userId: 'user1', isTeacherView: true }))

            const surveyModal = screen.queryByTestId('survey-modal')
            expect(surveyModal).toBeFalsy()
        })

        it('教師ビューの場合、checkSurveyEligibilityを呼ばない', async () => {
            const mockDetails = [createMockSessionDetail()]
            mockSessionDetails(mockDetails)

            await SessionDetail({ groupId: 'group1', userId: 'user1', isTeacherView: true })

            expect(surveyActions.checkSurveyEligibility).not.toHaveBeenCalled()
        })
    })

    describe('バックリンク', () => {
        it('デフォルトの戻り先は"/"である', async () => {
            const mockDetails = [createMockSessionDetail()]
            mockSessionDetails(mockDetails)
            vi.mocked(surveyActions.checkSurveyEligibility).mockResolvedValue(false)

            const { container } = renderWithIntl(
                await SessionDetail({ groupId: 'group1', userId: 'user1' })
            )

            const link = container.querySelector('a[href="/"]')
            expect(link).toBeTruthy()
        })

        it('カスタムの戻り先を指定できる', async () => {
            const mockDetails = [createMockSessionDetail()]
            mockSessionDetails(mockDetails)
            vi.mocked(surveyActions.checkSurveyEligibility).mockResolvedValue(false)

            const { container } = renderWithIntl(
                await SessionDetail({ groupId: 'group1', userId: 'user1', backUrl: '/custom-back' })
            )

            const link = container.querySelector('a[href="/custom-back"]')
            expect(link).toBeTruthy()
        })
    })

    describe('音声チューター機能', () => {
        it('PhoneTutorButtonとChatTutorButtonを表示する', async () => {
            const mockDetails = [createMockSessionDetail()]
            mockSessionDetails(mockDetails)
            vi.mocked(surveyActions.checkSurveyEligibility).mockResolvedValue(false)

            const { container } = renderWithIntl(
                await SessionDetail({ groupId: 'group1', userId: 'user1' })
            )

            expect(container.textContent).toContain('Phone Tutor')
            expect(container.textContent).toContain('Chat Tutor')
        })
    })

    describe('プロンプトファイルの読み込み', () => {
        it('phone-tutor.mdとchat-tutor.mdを読み込む', async () => {
            const mockDetails = [createMockSessionDetail()]
            mockSessionDetails(mockDetails)
            vi.mocked(surveyActions.checkSurveyEligibility).mockResolvedValue(false)

            await SessionDetail({ groupId: 'group1', userId: 'user1' })

            expect(fs.readFileSync).toHaveBeenCalledWith(
                expect.stringContaining('phone-tutor.md'),
                'utf-8'
            )
            expect(fs.readFileSync).toHaveBeenCalledWith(
                expect.stringContaining('chat-tutor.md'),
                'utf-8'
            )
        })
    })

    describe('教科不明の処理', () => {
        it('coreProblemがない場合、「教科不明」と表示する', async () => {
            const mockDetails = [createMockSessionDetail({
                problem: {
                    ...createMockSessionDetail().problem,
                    coreProblems: [],
                }
            })]
            mockSessionDetails(mockDetails)
            vi.mocked(surveyActions.checkSurveyEligibility).mockResolvedValue(false)

            const { container } = renderWithIntl(
                await SessionDetail({ groupId: 'group1', userId: 'user1' })
            )

            expect(container.textContent).toContain('教科不明')
        })
    })
})
