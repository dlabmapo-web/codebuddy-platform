'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Lock, User } from 'lucide-react';
import { LogoIcon, LogoBadge } from '@/components/ui/LogoIcon';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('아이디와 비밀번호를 입력해주세요.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error?.message ?? '로그인에 실패했습니다.');
        return;
      }

      const role = data.user.role as string;
      const homeMap: Record<string, string> = {
        student: '/problems',
        teacher: '/students',
        admin: '/admin/problems',
      };
      router.replace(homeMap[role] ?? '/problems');
    } catch {
      setError('네트워크 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <div
        className="w-[40%] flex-shrink-0 flex flex-col justify-between p-12"
        style={{ backgroundColor: 'var(--color-primary)' }}
      >
        <span className="flex items-center gap-2" style={{ color: 'white', fontSize: '22px', fontWeight: 700, letterSpacing: '-0.02em' }}>
          <LogoIcon size={24} color="var(--color-card)" strokeWidth={2} />
          코브 스튜디오
        </span>

        <div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '13px', fontWeight: 500, marginBottom: 8 }}>
            코딩 교육 플랫폼
          </p>
          <h1 style={{ color: 'white', fontSize: '28px', fontWeight: 700, lineHeight: 1.4, letterSpacing: '-0.02em' }}>
            함께 풀어서<br />더 빨리 느는 코딩
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '14px', marginTop: 12 }}>
            선생님과 1:1 실시간으로 함께 코드를 편집하며 배우는 가장 효과적인 방법
          </p>

          <div
            className="mt-10 rounded-lg overflow-hidden"
            style={{ backgroundColor: '#1E1E1E', border: '1px solid rgba(255,255,255,0.12)' }}
          >
            <div className="flex items-center gap-1.5 px-4 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#DC2626' }} />
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#D97706' }} />
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#16A34A' }} />
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginLeft: 8 }}>solution.py</span>
            </div>
            <div className="px-4 py-4" style={{ fontFamily: 'monospace', fontSize: '12px', lineHeight: 1.7 }}>
              <div>
                <span style={{ color: '#569CD6' }}>def</span>{' '}
                <span style={{ color: '#DCDCAA' }}>two_sum</span>
                <span style={{ color: '#D4D4D4' }}>(nums, target):</span>
              </div>
              <div style={{ paddingLeft: 16 }}>
                <span style={{ color: '#569CD6' }}>seen</span>
                <span style={{ color: '#D4D4D4' }}> = {'{}'}</span>
              </div>
              <div style={{ paddingLeft: 16 }}>
                <span style={{ color: '#C586C0' }}>for</span>
                <span style={{ color: '#D4D4D4' }}> i, num </span>
                <span style={{ color: '#C586C0' }}>in</span>
                <span style={{ color: '#DCDCAA' }}> enumerate</span>
                <span style={{ color: '#D4D4D4' }}>(nums):</span>
              </div>
              <div style={{ paddingLeft: 32 }}>
                <span style={{ color: '#D4D4D4' }}>comp = target - num</span>
              </div>              
            </div>
          </div>
        </div>

        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>
          © 2026 CoveEdu AI. All rights reserved.
        </div>
      </div>

      <div className="relative flex-1 flex items-center justify-center bg-card">
        <div className="absolute top-8 right-10 flex flex-col items-end gap-1.5">
          <img
            src="/dlab-logo.svg"
            alt="디랩코딩 D·LAB Coding"
            style={{ height: 52, width: 'auto' }}
          />
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-sub)', letterSpacing: '-0.01em' }}>
            마포캠퍼스
          </span>
        </div>
        <div className="w-full max-w-sm px-8">
          <div className="mb-8">
            <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-ink)' }}>로그인</h2>
            <p style={{ fontSize: '13px', color: 'var(--color-sub)', marginTop: 4 }}>
              계속하려면 계정에 로그인하세요
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--color-ink)', marginBottom: 6 }}>
                아이디
              </label>
              <div className="relative">
                <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-sub)' }} />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="아이디를 입력하세요"
                  autoComplete="username"
                  className="w-full pl-9 pr-3 rounded-lg outline-none transition-colors"
                  style={{ height: 40, border: '1px solid var(--color-border)', fontSize: '14px', color: 'var(--color-ink)' }}
                  onFocus={(e) => (e.target.style.borderColor = 'var(--color-primary)')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--color-ink)', marginBottom: 6 }}>
                비밀번호
              </label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-sub)' }} />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호를 입력하세요"
                  autoComplete="current-password"
                  className="w-full pl-9 pr-10 rounded-lg outline-none transition-colors"
                  style={{ height: 40, border: '1px solid var(--color-border)', fontSize: '14px', color: 'var(--color-ink)' }}
                  onFocus={(e) => (e.target.style.borderColor = 'var(--color-primary)')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--color-sub)' }}
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && (
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-lg"
                style={{ backgroundColor: 'var(--tint-danger)', border: '1px solid #FECACA' }}
              >
                <span style={{ fontSize: '13px', color: '#DC2626' }}>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg text-white transition-colors mt-2 disabled:opacity-50"
              style={{ height: 44, backgroundColor: 'var(--color-primary)', fontSize: '14px', fontWeight: 600 }}
              onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)'; }}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary)')}
            >
              {loading ? '로그인 중...' : '로그인'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <span style={{ fontSize: '13px', color: 'var(--color-sub)' }}>계정이 없으신가요?</span>{' '}
            <Link href="/signup" style={{ fontSize: '13px', color: 'var(--color-primary)', fontWeight: 500 }}>
              회원가입
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
