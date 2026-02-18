import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

type Accent = 'yellow' | 'green';

type CelebrationOverlayShellProps = {
    accent: Accent;
    maxWidthClassName: string;
    children: React.ReactNode;
};

const accentStyles: Record<Accent, { glow: string; panel: string }> = {
    yellow: {
        glow: 'bg-yellow-400',
        panel: 'bg-gradient-to-br from-yellow-100 to-white border-yellow-400',
    },
    green: {
        glow: 'bg-green-400',
        panel: 'bg-gradient-to-br from-green-100 to-white border-green-400',
    },
};

export function CelebrationOverlayShell({
    accent,
    maxWidthClassName,
    children,
}: CelebrationOverlayShellProps) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        >
            <motion.div
                initial={{ scale: 0.5, rotate: -10 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0.5, rotate: 10, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                className={cn('w-full relative', maxWidthClassName)}
            >
                <div className={cn('absolute inset-0 rounded-full blur-3xl opacity-20 animate-pulse', accentStyles[accent].glow)} />
                <div className={cn('text-center p-8 rounded-3xl shadow-2xl relative border-4', accentStyles[accent].panel)}>
                    {children}
                </div>
            </motion.div>
        </motion.div>
    );
}
