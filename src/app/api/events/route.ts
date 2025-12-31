import { NextResponse } from 'next/server';
import { serverEvents, EVENTS } from '@/lib/server-events';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    // SECURITY: Require authentication for SSE events
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return new Response('Unauthorized', { status: 401 });
    }

    const encoder = new TextEncoder();

    // Create a streaming response
    const customReadable = new ReadableStream({
        start(controller) {
            // Send initial connection message
            controller.enqueue(encoder.encode('data: {"type":"connected"}\n\n'));

            // Listener for grading completion
            const onGradingCompleted = (data: any) => {
                // SECURITY: Filter events to ensure users only receive their own data
                if (data.studentId && data.studentId !== user.id) {
                    return;
                }
                const message = JSON.stringify({ type: EVENTS.GRADING_COMPLETED, ...data });
                controller.enqueue(encoder.encode(`data: ${message}\n\n`));
            };

            // Register listener
            serverEvents.on(EVENTS.GRADING_COMPLETED, onGradingCompleted);

            // Listener for gamification updates
            const onGamificationUpdate = (data: any) => {
                // SECURITY: Filter events
                if (data.userId && data.userId !== user.id) {
                    return;
                }
                const message = JSON.stringify({ type: EVENTS.GAMIFICATION_UPDATE, ...data });
                controller.enqueue(encoder.encode(`data: ${message}\n\n`));
            };
            serverEvents.on(EVENTS.GAMIFICATION_UPDATE, onGamificationUpdate);

            // Cleanup on close
            request.signal.addEventListener('abort', () => {
                serverEvents.off(EVENTS.GRADING_COMPLETED, onGradingCompleted);
                serverEvents.off(EVENTS.GAMIFICATION_UPDATE, onGamificationUpdate);
            });
        }
    });

    return new Response(customReadable, {
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Connection': 'keep-alive',
            'Cache-Control': 'no-cache, no-transform',
            'Content-Encoding': 'none',
        },
    });
}
