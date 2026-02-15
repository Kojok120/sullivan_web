import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./vitest.setup.ts'],
        include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
        exclude: ['node_modules', '.next', 'e2e'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: ['src/lib/**/*.ts'],
            exclude: ['src/lib/prisma.ts', 'src/lib/redis.ts', 'src/lib/supabase/**'],
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
})
