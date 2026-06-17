'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { UserRole } from '@/lib/types/db';

interface GnbProps {
  user: { name: string; role: UserRole };
}

export function Gnb({ user }: GnbProps) {
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  const homeHref =
    user.role === 'admin'
      ? '/admin/problems'
      : user.role === 'teacher'
      ? '/students'
      : '/problems';

  return (
    <header
      className="h-14 flex items-center justify-between px-6 bg-white border-b border-border"
    >
      <Link href={homeHref} className="text-[17px] font-bold text-primary tracking-tight">
        페어코드
      </Link>
      <div className="flex items-center gap-4">
        <span className="text-[13px] text-sub">
          <span className="text-ink font-medium">{user.name}</span>
          &nbsp;·&nbsp;
          {user.role === 'student' ? '학생' : user.role === 'teacher' ? '교사' : '관리자'}
        </span>
        <button
          onClick={handleLogout}
          className="text-[13px] text-sub hover:text-ink transition-colors"
        >
          로그아웃
        </button>
      </div>
    </header>
  );
}
