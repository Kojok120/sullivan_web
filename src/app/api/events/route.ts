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
                const message = JSON.stringify({ type: EVENTS.GRADING_COMPLETED, ...data });
                controller.enqueue(encoder.encode(`data: ${message}\n\n`));
            };

            // Register listener
            serverEvents.on(EVENTS.GRADING_COMPLETED, onGradingCompleted);

            // Cleanup on close is tricky in Next.js App Router route handlers
            // Ideally, we detect disconnect, but for now we rely on the stream closure mechanism if possible
            // or just let it be. However, memory leaks are possible if we don't remove listener.
            // Since we can't easily detect "close" in this simple ReadableStream setup without AbortSignal check loop:

            request.signal.addEventListener('abort', () => {
                serverEvents.off(EVENTS.GRADING_COMPLETED, onGradingCompleted);
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
