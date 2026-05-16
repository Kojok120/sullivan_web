'use client';

import { useState, useTransition } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

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
  const t = useTranslations('CreateUserDialog');
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
      toast.error(t('nameRequired'));
      return;
    }

    startTransition(async () => {
      const result = await createClassroomScopedUser({
        name: normalizedName,
        role,
        group: isStudent ? normalizeOptionalSelection(group) : undefined,
      });

      if (!result.success) {
        toast.error(result.error || t('createFailed'));
        return;
      }

      toast.success(t('createSuccess', {
        loginId: result.loginId,
        initialPassword: result.initialPassword,
      }));
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
          {t('trigger')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {t('description')} <code>password123</code> {t('descriptionSuffix')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="new-user-name">{t('nameLabel')}</Label>
            <Input
              id="new-user-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('namePlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-user-role">{t('roleLabel')}</Label>
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
                <SelectValue placeholder={t('rolePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="STUDENT">{t('roleStudent')}</SelectItem>
                {canCreateTeacher && <SelectItem value="TEACHER">{t('roleTeacher')}</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          {isStudent && (
            <div className="space-y-2">
              <Label htmlFor="new-user-group">{t('groupLabel')}</Label>
              <Select value={group} onValueChange={setGroup}>
                <SelectTrigger id="new-user-group">
                  <SelectValue placeholder={t('groupPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_SELECTION_VALUE}>{t('unset')}</SelectItem>
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
            {t('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isPending} className="min-h-11 sm:min-h-10">
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
