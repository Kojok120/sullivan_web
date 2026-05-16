import type { SessionPayload } from './auth';

export class PackAccessError extends Error {
    constructor(message = 'Pack access denied') {
        super(message);
        this.name = 'PackAccessError';
    }
}

export function hasPackAccess(session: SessionPayload | null, packId: string): boolean {
    if (!session) return false;
    return session.allowedPackIds.includes(packId);
}

export function assertPackAccess(session: SessionPayload | null, packId: string): asserts session is SessionPayload {
    if (!hasPackAccess(session, packId)) {
        throw new PackAccessError();
    }
}

export function resolvePackId(session: SessionPayload | null, requestedPackId?: string | null): string {
    if (!session) {
        throw new PackAccessError('Authentication required to resolve packId');
    }
    if (requestedPackId) {
        assertPackAccess(session, requestedPackId);
        return requestedPackId;
    }
    return session.defaultPackId;
}
