'use client';

import { CoreProblem, Unit, Subject } from '@prisma/client';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Save, Video, VideoOff } from 'lucide-react';
import { updateCoreProblemVideo } from './actions';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

type CoreProblemWithRelations = CoreProblem & {
    unit: Unit & {
        subject: Subject;
    };
};

interface VideoManagerProps {
    coreProblems: CoreProblemWithRelations[];
}

export function VideoManager({ coreProblems }: VideoManagerProps) {
    const [query, setQuery] = useState('');
    const [filterMissing, setFilterMissing] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editUrl, setEditUrl] = useState('');

    const filtered = coreProblems.filter(cp => {
        const matchesQuery =
            cp.name.includes(query) ||
            cp.unit.name.includes(query) ||
            cp.unit.subject.name.includes(query);
        const matchesMissing = filterMissing ? !cp.sharedVideoUrl : true;
        return matchesQuery && matchesMissing;
    });

    const handleEdit = (cp: CoreProblem) => {
        setEditingId(cp.id);
        setEditUrl(cp.sharedVideoUrl || '');
    };

    const handleSave = async (id: string) => {
        const result = await updateCoreProblemVideo(id, editUrl || null);
        if (result.success) {
            toast.success('動画URLを更新しました');
            setEditingId(null);
        } else {
            toast.error(result.error);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex gap-4 items-center">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="検索..."
                        className="pl-8"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                </div>
                <Button
                    variant={filterMissing ? "secondary" : "outline"}
                    onClick={() => setFilterMissing(!filterMissing)}
                >
                    {filterMissing ? <VideoOff className="mr-2 h-4 w-4" /> : <Video className="mr-2 h-4 w-4" />}
                    動画未設定のみ
                </Button>
            </div>

            <div className="grid gap-4">
                {filtered.map((cp) => (
                    <Card key={cp.id}>
                        <CardContent className="p-4 flex items-center gap-4">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <Badge variant="outline">{cp.unit.subject.name}</Badge>
                                    <span className="text-xs text-muted-foreground">{cp.unit.name}</span>
                                </div>
                                <div className="font-medium">{cp.name}</div>
                            </div>

                            <div className="flex-1 max-w-md">
                                {editingId === cp.id ? (
                                    <div className="flex gap-2">
                                        <Input
                                            value={editUrl}
                                            onChange={(e) => setEditUrl(e.target.value)}
                                            placeholder="https://youtube.com/..."
                                        />
                                        <Button size="icon" onClick={() => handleSave(cp.id)}>
                                            <Save className="h-4 w-4" />
                                        </Button>
                                        <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}>
                                            ✕
                                        </Button>
                                    </div>
                                ) : (
                                    <div
                                        className="text-sm text-muted-foreground truncate cursor-pointer hover:text-foreground flex items-center gap-2"
                                        onClick={() => handleEdit(cp)}
                                    >
                                        {cp.sharedVideoUrl ? (
                                            <>
                                                <Video className="h-4 w-4 text-blue-500" />
                                                <span className="truncate max-w-[300px]">{cp.sharedVideoUrl}</span>
                                            </>
                                        ) : (
                                            <span className="text-orange-400 flex items-center gap-1">
                                                <VideoOff className="h-4 w-4" /> 未設定
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                ))}
                {filtered.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                        条件に一致するCoreProblemが見つかりません
                    </div>
                )}
            </div>
        </div>
    );
}
