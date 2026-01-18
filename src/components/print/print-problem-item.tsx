import { Problem } from "@prisma/client";

interface PrintProblemItemProps {
    problem: Problem & { customId?: string | null };
    index: number; // 0-based index in the entire list for default numbering
    customId?: string | null;
    isMeasurement?: boolean;
}

export function PrintProblemItem({ problem, index, customId, isMeasurement = false }: PrintProblemItemProps) {
    return (
        <div className={`flex gap-4 ${isMeasurement ? 'pb-4' : 'break-inside-avoid'}`}>
            <div className="font-bold min-w-[4.5rem] text-right whitespace-nowrap shrink-0">
                {customId || index + 1}.
            </div>
            <div className={`flex-1 pt-0.5 text-lg leading-relaxed whitespace-pre-wrap ${isMeasurement ? 'border-b border-gray-200' : 'border-b border-gray-200 pb-4'}`}>
                {problem.question}
            </div>
        </div>
    );
}
