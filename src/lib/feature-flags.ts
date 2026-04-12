export function isStructuredProblemsEnabled(): boolean {
    return process.env.ENABLE_STRUCTURED_PROBLEMS === 'true';
}

