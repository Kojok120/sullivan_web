import { Badge } from "@/components/ui/badge";

type Role = 'ADMIN' | 'TEACHER' | 'HEAD_TEACHER' | 'PARENT' | 'STUDENT' | string;

interface RoleBadgeProps {
    role: Role;
    className?: string;
}

export function RoleBadge({ role, className }: RoleBadgeProps) {
    const getRoleStyles = (role: string) => {
        switch (role) {
            case 'ADMIN':
                return 'bg-red-100 text-red-800 hover:bg-red-100/80 border-red-200';
            case 'TEACHER':
                return 'bg-purple-100 text-purple-800 hover:bg-purple-100/80 border-purple-200';
            case 'HEAD_TEACHER':
                return 'bg-amber-100 text-amber-800 hover:bg-amber-100/80 border-amber-200';
            case 'PARENT':
                return 'bg-green-100 text-green-800 hover:bg-green-100/80 border-green-200';
            case 'STUDENT':
            default:
                return 'bg-blue-100 text-blue-800 hover:bg-blue-100/80 border-blue-200';
        }
    };

    return (
        <Badge variant="outline" className={`${getRoleStyles(role)} ${className || ''} border-0`}>
            {role}
        </Badge>
    );
}
