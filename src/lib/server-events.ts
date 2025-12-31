import { EventEmitter } from 'events';

class ServerEvents extends EventEmitter { }

// Singleton instance
export const serverEvents = new ServerEvents();
serverEvents.setMaxListeners(100); // Support up to 100 concurrent SSE clients

export const EVENTS = {
    GRADING_COMPLETED: 'grading_completed',
    GRADING_FAILED: 'grading_failed',
};
