import { EventEmitter } from 'events';

class ServerEvents extends EventEmitter { }

// Singleton instance
export const serverEvents = new ServerEvents();

export const EVENTS = {
    GRADING_COMPLETED: 'grading_completed',
};
