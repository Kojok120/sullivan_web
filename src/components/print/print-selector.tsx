'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Printer, Minus, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { getSubjectConfig } from '@/lib/subject-config';

export interface PrintSubject {
    subjectId: string;
    subjectName: string;
    // progressPercentage is optional as it's not used in logic, but passing it is fine
    progressPercentage?: number;
}

interface PrintSelectorProps {
    subjects: PrintSubject[];
}

export function PrintSelector({ subjects }: PrintSelectorProps) {
    const router = useRouter();
    const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
    const [sets, setSets] = useState(1);

    const getSubjectStyle = (name: string) => {
        const config = getSubjectConfig(name);
        return { color: config.bgColor, label: config.letter, full: config.fullName };
    };

    const incrementSets = () => setSets(prev => Math.min(prev + 1, 10));
    const decrementSets = () => setSets(prev => Math.max(prev - 1, 1));

    const handleSubjectClick = (id: string) => {
        if (selectedSubjectId === id) {
            // Already selected -> Increment sets
            incrementSets();
        } else {
            // New selection -> Select and reset sets
            setSelectedSubjectId(id);
            setSets(1);
        }
    };

    const handlePrint = () => {
        if (!selectedSubjectId) return;
        router.push(`/dashboard/print?subjectId=${selectedSubjectId}&sets=${sets}`);
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {subjects.map((subject) => {
                const style = getSubjectStyle(subject.subjectName);
                const isSelected = selectedSubjectId === subject.subjectId;

                return (
                    <motion.div
                        key={subject.subjectId}
                        layout
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className="relative"
                    >
                        <Card
                            className={cn(
                                "cursor-pointer transition-all duration-300 border-none overflow-hidden h-full shadow-md",
                                isSelected ? "shadow-xl scale-105 ring-2 ring-offset-2 ring-gray-800" : "hover:scale-105 hover:shadow-lg"
                            )}
                            onClick={() => handleSubjectClick(subject.subjectId)}
                        >
                            <CardContent className={cn("p-6 flex flex-col items-center justify-center min-h-[160px]", style.color)}>
                                <span className="text-6xl font-black text-white mb-2 select-none">{style.label}</span>
                                <span className="text-white/90 font-medium tracking-wider select-none">{style.full}</span>
                            </CardContent>

                            {/* Overlay for non-selected items when one is selected */}
                            {selectedSubjectId && !isSelected && (
                                <div className="absolute inset-0 bg-white/60 z-10" />
                            )}
                        </Card>

                        <AnimatePresence>
                            {isSelected && (
                                <motion.div
                                    initial={{ opacity: 0, y: -20, height: 0 }}
                                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                                    exit={{ opacity: 0, y: -20, height: 0 }}
                                    className="absolute top-full left-0 right-0 mt-4 z-20"
                                >
                                    <Card className="bg-white shadow-xl border-2 border-gray-100">
                                        <CardContent className="p-4 space-y-4">
                                            <div className="flex items-center justify-between bg-gray-50 rounded-lg p-2">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={(e) => { e.stopPropagation(); decrementSets(); }}
                                                    disabled={sets <= 1}
                                                    className="h-8 w-8 hover:bg-white hover:shadow-sm"
                                                >
                                                    <Minus className="h-4 w-4" />
                                                </Button>
                                                <div className="flex flex-col items-center">
                                                    <span className="text-2xl font-bold font-mono">{sets}</span>
                                                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Sets</span>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={(e) => { e.stopPropagation(); incrementSets(); }}
                                                    disabled={sets >= 10}
                                                    className="h-8 w-8 hover:bg-white hover:shadow-sm"
                                                >
                                                    <Plus className="h-4 w-4" />
                                                </Button>
                                            </div>

                                            <Button
                                                className="w-full font-bold text-lg h-12 gap-2 shadow-sm hover:shadow-md transition-all active:scale-95"
                                                size="lg"
                                                onClick={(e) => { e.stopPropagation(); handlePrint(); }}
                                            >
                                                <Printer className="w-5 h-5" />
                                                印刷する
                                            </Button>
                                            <p className="text-xs text-center text-muted-foreground">
                                                {sets * 10}問 / {sets}セット
                                            </p>
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                );
            })}
        </div>
    );
}
