import { motion } from 'framer-motion';
import { Trophy, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

type Accent = 'yellow' | 'green';

type CelebrationIntroProps = {
    accent: Accent;
    title: string;
    description: React.ReactNode;
    badgeText: string;
};

const accentClasses: Record<Accent, {
    iconBg: string;
    titleText: string;
    badge: string;
}> = {
    yellow: {
        iconBg: 'bg-yellow-400',
        titleText: 'text-yellow-600',
        badge: 'bg-yellow-500 text-white',
    },
    green: {
        iconBg: 'bg-green-400',
        titleText: 'text-green-600',
        badge: 'bg-green-500 text-white',
    },
};

export function CelebrationIntro({
    accent,
    title,
    description,
    badgeText,
}: CelebrationIntroProps) {
    const styles = accentClasses[accent];

    return (
        <>
            <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring' }}
                className={cn('inline-block p-6 rounded-full shadow-inner mb-6', styles.iconBg)}
            >
                <Trophy className="h-16 w-16 text-white" />
            </motion.div>

            <motion.h2
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className={cn('text-3xl font-black mb-2', styles.titleText)}
            >
                {title}
            </motion.h2>

            <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="mb-6 space-y-2"
            >
                {description}
            </motion.div>

            <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.6, type: 'spring' }}
                className={cn('inline-flex items-center gap-2 px-6 py-2 rounded-full font-bold text-lg shadow-lg', styles.badge)}
            >
                <Star className="h-5 w-5 fill-current" />
                {badgeText}
            </motion.div>
        </>
    );
}
