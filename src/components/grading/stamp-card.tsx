'use client';

import { motion } from 'framer-motion';
import { Star } from 'lucide-react';

interface StampCardProps {
    totalStamps: number;
    newStamps: number; // How many new stamps to animate this session
}

export function StampCard({ totalStamps, newStamps }: StampCardProps) {
    // Grid of 10 stamps per card
    const STAMPS_PER_CARD = 10;
    const currentCardPage = Math.floor((totalStamps - 1) / STAMPS_PER_CARD);
    // Stamps on the current card (1-10)

    // We want to show the card that contains the *newest* stamps.
    // If we just crossed a boundary, we might want to show the old one then the new one?
    // For simplicity, let's just show the current active card.

    return (
        <div className="bg-[#fcf8e3] rounded-xl p-6 shadow-xl border-4 border-[#e6d0a1] max-w-sm w-full mx-auto relative overflow-hidden">
            {/* Texture/Pattern background could go here */}
            <div className="absolute top-0 right-0 p-2 opacity-10 pointer-events-none">
                <Star size={120} className="text-orange-500" />
            </div>

            <div className="text-center mb-6">
                <h3 className="text-xl font-bold text-orange-800 tracking-wider border-b-2 border-orange-200 inline-block pb-1">
                    がんばりスタンプ帳
                </h3>
                <p className="text-xs text-orange-600 mt-1">
                    {currentCardPage + 1}枚目
                </p>
            </div>

            <div className="grid grid-cols-5 gap-3">
                {Array.from({ length: STAMPS_PER_CARD }).map((_, i) => {
                    const stampIndex = currentCardPage * STAMPS_PER_CARD + i + 1;
                    const isStamped = stampIndex <= totalStamps;
                    // Is this one of the "new" ones?
                    const isNew = stampIndex > (totalStamps - newStamps) && isStamped;

                    return (
                        <div key={i} className="aspect-square relative flex items-center justify-center border-2 border-dashed border-[#dabba9] rounded-full bg-white/50">
                            <span className="text-[10px] text-[#dabba9] font-bold absolute top-1">{stampIndex}</span>

                            {isStamped && (
                                <StampMark isNew={isNew} index={i} />
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="mt-6 text-center">
                <p className="text-sm font-bold text-[#8c6b5d]">
                    あと {STAMPS_PER_CARD - (totalStamps % STAMPS_PER_CARD)} 個でゴール！
                </p>
            </div>
        </div>
    );
}

function StampMark({ isNew, index }: { isNew: boolean, index: number }) {
    return (
        <motion.div
            initial={isNew ? { scale: 2, opacity: 0, rotate: -30 } : { scale: 1, opacity: 1, rotate: Math.random() * 20 - 10 }}
            animate={isNew ? { scale: 1, opacity: 1, rotate: Math.random() * 20 - 10 } : {}}
            transition={isNew ? {
                type: "spring",
                stiffness: 300,
                damping: 15,
                delay: index * 0.2 // Stagger the new ones based on position? Or just wait? 
                // Getting `index` here is 0-9. If we have multiple new stamps, we want them to appear sequentially.
                // But `isNew` doesn't tell us *which* new stamp it is in the sequence (1st, 2nd, 3rd new).
                // For simplified visual, let's just pop them.
                // Or better, pass the 'delay' prop.
            } : {}}
            className="text-red-500"
        >
            {/* Simple Flower/Hanamaru SVG */}
            <svg width="40" height="40" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="50" cy="50" r="40" stroke="currentColor" strokeWidth="3" fill="rgba(255, 99, 71, 0.1)" />
                <path d="M30 50 L45 65 L70 35" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        </motion.div>
    );
}
