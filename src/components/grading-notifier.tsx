"use client";

import { useEffect } from 'react';
import { toast } from "sonner";
import { useRouter } from 'next/navigation';

export function GradingNotifier() {
    const router = useRouter();

    useEffect(() => {
        console.log("Connecting to SSE...");
        const eventSource = new EventSource('/api/events');

        eventSource.onopen = () => {
            // console.log("SSE connected");
        };

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                if (data.type === 'grading_completed') {
                    const { studentId, groupId, timestamp } = data;

                    toast.success("採点が完了しました！", {
                        description: "クリックして結果を確認する",
                        action: {
                            label: "見る",
                            onClick: () => {
                                // Navigate to the specific history page if groupId is available
                                if (groupId) {
                                    router.push(`/dashboard/history/${groupId}`);
                                } else {
                                    router.push(`/dashboard/history`);
                                }
                            }
                        },
                        duration: 5000,
                    });
                }
            } catch (error) {
                console.error("Error parsing SSE data", error);
            }
        };

        eventSource.onerror = (error) => {
            // console.error("SSE Error:", error);
            // Browser usually auto-reconnects, but we might want to close if fatal
            // eventSource.close();
        };

        return () => {
            eventSource.close();
        };
    }, [router]);

    return null; // This component handles side-effects only (notifications)
}
