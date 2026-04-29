import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

type CelebrationOverlayShellProps = {
    maxWidthClassName: string;
    children: React.ReactNode;
};

export function CelebrationOverlayShell({
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
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className={cn('w-full relative', maxWidthClassName)}
            >
                <div className="text-center p-8 rounded-lg border-2 border-primary/30 bg-card relative">
                    {children}
                </div>
            </motion.div>
        </motion.div>
    );
}
