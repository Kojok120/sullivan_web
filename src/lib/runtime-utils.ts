export function isWorkerRuntime(): boolean {
    return (process.env.SERVICE_ROLE || '').toLowerCase() === 'worker';
}
