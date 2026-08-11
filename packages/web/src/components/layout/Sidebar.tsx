'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  History,
  Users,
  BarChart2,
  LayoutDashboard,
  FileText,
  UserCheck,
  Sparkles,
} from 'lucide-react';
import type { UserRole } from '@/lib/types/db';

interface NavItem {
  icon: React.ReactNode;
  label: string;
  href: string;
}

const studentNav: NavItem[] = [
  { icon: <BookOpen size={16} />, label: '문제 풀이', href: '/problems' },
  { icon: <History size={16} />, label: '내 풀이기록', href: '/me' },
];

const teacherNav: NavItem[] = [
  { icon: <LayoutDashboard size={16} />, label: '대시보드', href: '/dashboard' },
  { icon: <Users size={16} />, label: '학생 현황', href: '/students' },
  { icon: <BarChart2 size={16} />, label: '풀이 현황', href: '/progress' },
];

const adminNav: NavItem[] = [
  { icon: <FileText size={16} />, label: '문제 관리', href: '/admin/problems' },
  { icon: <Sparkles size={16} />, label: 'AI 피드백 기준', href: '/admin/ai-feedback' },
  { icon: <UserCheck size={16} />, label: '사용자 관리', href: '/admin/users' },
];

interface SidebarProps {
  role: UserRole;
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const items = role === 'teacher' ? teacherNav : role === 'admin' ? adminNav : studentNav;

  return (
    <aside className="w-60 flex-shrink-0 bg-card border-r border-border flex flex-col">
      <nav className="flex-1 py-3">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex items-center gap-3 px-4 py-2.5 text-[14px] transition-colors"
              style={{
                backgroundColor: active ? '#EAF1FD' : 'transparent',
                color: active ? '#1B64DA' : '#5A6270',
                fontWeight: active ? 600 : 400,
              }}
            >
              {active && (
                <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r bg-primary" />
              )}
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
