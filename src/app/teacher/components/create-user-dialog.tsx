'use client';

import { useState, useTransition } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

import { createClassroomScopedUser } from '@/app/teacher/actions';
import { NONE_SELECTION_VALUE, normalizeOptionalSelection } from '@/lib/form-selection';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type CreateRole = 'STUDENT' | 'TEACHER';

type CreateUserDialogProps = {
  canCreateTeacher: boolean;
  groups: string[];
  onCreated?: () => void;
};

export function CreateUserDialog({ canCreateTeacher, groups, onCreated }: CreateUserDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState('');
  const [role, setRole] = useState<CreateRole>('STUDENT');
  const [group, setGroup] = useState(NONE_SELECTION_VALUE);

  const isStudent = role === 'STUDENT';

  const handleSubmit = () => {
    const normalizedName = name.trim();
    if (!normalizedName) {
      toast.error('名前を入力してください');
      return;
    }

    startTransition(async () => {
      const result = await createClassroomScopedUser({
        name: normalizedName,
        role,
        group: isStudent ? normalizeOptionalSelection(group) : undefined,
      });

      if (!result.success) {
        toast.error(result.error || 'ユーザー作成に失敗しました');
        return;
      }

      toast.success(`作成完了: ${result.loginId} / 初期PW: ${result.initialPassword}`);
      setName('');
      setRole('STUDENT');
      setGroup(NONE_SELECTION_VALUE);
      setOpen(false);
      router.refresh();
      onCreated?.();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="min-h-11 gap-2 sm:min-h-10">
          <Plus className="h-4 w-4" />
          ユーザー追加
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>教室ユーザー追加</DialogTitle>
          <DialogDescription>
            この教室に新規ユーザーを追加します。初期パスワードは固定で <code>password123</code> です。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="new-user-name">名前</Label>
            <Input
              id="new-user-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例: 山田 太郎"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-user-role">役割</Label>
            <Select
              value={role}
              onValueChange={(value: CreateRole) => {
                setRole(value);
                if (value !== 'STUDENT') {
                  setGroup(NONE_SELECTION_VALUE);
                }
              }}
            >
              <SelectTrigger id="new-user-role">
                <SelectValue placeholder="役割を選択" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="STUDENT">生徒</SelectItem>
                {canCreateTeacher && <SelectItem value="TEACHER">講師</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          {isStudent && (
            <div className="space-y-2">
              <Label htmlFor="new-user-group">グループ（任意）</Label>
              <Select value={group} onValueChange={setGroup}>
                <SelectTrigger id="new-user-group">
                  <SelectValue placeholder="グループを選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_SELECTION_VALUE}>未設定</SelectItem>
                  {groups.map((groupName) => (
                    <SelectItem key={groupName} value={groupName}>
                      {groupName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending} className="min-h-11 sm:min-h-10">
            キャンセル
          </Button>
          <Button onClick={handleSubmit} disabled={isPending} className="min-h-11 sm:min-h-10">
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            作成
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
