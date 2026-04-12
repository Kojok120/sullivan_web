import { motion } from 'framer-motion';
import { Trophy, Star } from 'lucide-react';

type CelebrationIntroProps = {
    title: string;
    description: React.ReactNode;
    badgeText: string;
};

export function CelebrationIntro({
    title,
    description,
    badgeText,
}: CelebrationIntroProps) {
    return (
        <>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1, duration: 0.2 }}
                className="inline-block p-5 rounded-full bg-primary/20 mb-6"
            >
                <Trophy className="h-16 w-16 text-primary" />
            </motion.div>

            <motion.h2
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.2 }}
                className="text-2xl font-bold text-foreground mb-2"
            >
                {title}
            </motion.h2>

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.2 }}
                className="mb-6 space-y-2"
            >
                {description}
            </motion.div>

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.2 }}
                className="inline-flex items-center gap-2 px-6 py-2 rounded-full font-bold text-lg bg-primary text-white"
            >
                <Star className="h-5 w-5 fill-current" />
                {badgeText}
            </motion.div>
        </>
    );
}
