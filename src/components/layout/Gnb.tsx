'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, User, LogOut } from 'lucide-react';
import { ProfileModal } from './ProfileModal';
import { LogoBadge } from '@/components/ui/LogoIcon';
import ThemeToggle from '@/components/ThemeToggle';
import type { UserRole } from '@/lib/types/db';

const ROLE_LABEL: Record<UserRole, string> = {
  student: '학생',
  teacher: '교사',
  admin: '관리자',
};

interface GnbProps {
  user: { name: string; role: UserRole };
}

export function Gnb({ user }: GnbProps) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const homeHref =
    user.role === 'admin'
      ? '/admin/problems'
      : user.role === 'teacher'
      ? '/students'
      : '/problems';

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleLogout() {
    setDropdownOpen(false);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
  }

  function handleOpenProfile() {
    setDropdownOpen(false);
    setProfileOpen(true);
  }

  function handleProfileUpdated(newName: string) {
    setName(newName);
    router.refresh();
  }

  return (
    <>
      <header className="h-14 flex items-center justify-between px-6 bg-card border-b border-border">
        <Link href={homeHref} className="flex items-center gap-2 tracking-tight">
          <LogoBadge size={28} />
          <span className="text-[17px] font-bold text-primary">코브 스튜디오</span>
        </Link>

        <div className="flex items-center gap-1">
        <ThemeToggle />
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen((o) => !o)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors hover:bg-surface"
          >
            <span
              className="flex items-center justify-center w-7 h-7 rounded-full text-white text-[12px] font-bold flex-shrink-0"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {name.charAt(0)}
            </span>
            <span className="flex flex-col items-start">
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-ink)', lineHeight: 1.3 }}>
                {name}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--color-sub)', lineHeight: 1.3 }}>
                {ROLE_LABEL[user.role]}
              </span>
            </span>
            <ChevronDown
              size={14}
              style={{
                color: 'var(--color-sub)',
                transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.15s',
              }}
            />
          </button>

          {dropdownOpen && (
            <div
              className="absolute right-0 top-full mt-1 w-44 bg-card rounded-lg overflow-hidden z-40"
              style={{ border: '1px solid var(--color-border)', boxShadow: '0 4px 16px rgba(22,24,29,0.12)' }}
            >
              <button
                onClick={handleOpenProfile}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-surface"
              >
                <User size={15} style={{ color: 'var(--color-sub)' }} />
                <span style={{ fontSize: '13px', color: 'var(--color-ink)' }}>내 정보 변경</span>
              </button>
              <div style={{ borderTop: '1px solid var(--color-border)' }} />
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-red-50"
              >
                <LogOut size={15} style={{ color: '#DC2626' }} />
                <span style={{ fontSize: '13px', color: '#DC2626' }}>로그아웃</span>
              </button>
            </div>
          )}
        </div>
        </div>
      </header>

      <ProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        currentName={name}
        onUpdated={handleProfileUpdated}
      />
    </>
  );
}
