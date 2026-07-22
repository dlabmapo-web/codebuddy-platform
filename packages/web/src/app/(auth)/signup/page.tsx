'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, X, Eye, EyeOff } from 'lucide-react';
import { LogoBadge } from '@/components/ui/LogoIcon';

type UserType = 'student' | 'teacher';

function Rule({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className="flex items-center gap-1.5 mt-1">
      {ok ? <Check size={12} style={{ color: '#16A34A' }} /> : <X size={12} style={{ color: '#DC2626' }} />}
      <span style={{ fontSize: '12px', color: ok ? '#16A34A' : '#DC2626' }}>{text}</span>
    </div>
  );
}

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    username: '',
    password: '',
    passwordConfirm: '',
    name: '',
    role: 'student' as UserType,
  });
  const [showPw, setShowPw] = useState(false);
  const [showPwConfirm, setShowPwConfirm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const validId = /^[a-zA-Z0-9]{5,}$/.test(form.username);
  const validIdLen = form.username.length >= 5;
  const validIdAlnum = /^[a-zA-Z0-9]+$/.test(form.username);
  const validPw = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(form.password);
  const validPwConfirm = form.password === form.passwordConfirm && form.passwordConfirm !== '';
  const validName = form.name.trim().length > 0;
  const canSubmit = validId && validPw && validPwConfirm && validName;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.username,
          password: form.password,
          name: form.name.trim(),
          role: form.role,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error?.message ?? '가입 중 오류가 발생했습니다.');
        return;
      }

      setSuccess(true);
      setTimeout(() => router.replace('/login'), 1500);
    } catch {
      setError('네트워크 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F6F7F9' }}>
        <div
          className="w-full max-w-md rounded-xl bg-white p-8 text-center"
          style={{ border: '1px solid #E5E8EC', boxShadow: '0 4px 16px rgba(22,24,29,0.08)' }}
        >
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: '#DCFCE7' }}
          >
            <Check size={28} style={{ color: '#16A34A' }} />
          </div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#16181D' }}>가입이 완료되었습니다</h2>
          <p style={{ fontSize: '13px', color: '#5A6270', marginTop: 6 }}>잠시 후 로그인 페이지로 이동합니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F6F7F9' }}>
      <div
        className="w-full max-w-md rounded-xl bg-white p-8"
        style={{ border: '1px solid #E5E8EC', boxShadow: '0 4px 16px rgba(22,24,29,0.08)' }}
      >
        <div className="mb-6">
          <Link href="/login" className="flex items-center gap-2" style={{ fontSize: '22px', fontWeight: 700, color: '#1B64DA' }}>
            <LogoBadge size={28} />
            페어코드
          </Link>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#16181D', marginTop: 8 }}>회원가입</h2>
          <p style={{ fontSize: '13px', color: '#5A6270', marginTop: 2 }}>페어코드 계정을 만들어 시작하세요</p>
        </div>

        <div className="mb-5">
          <label style={{ fontSize: '13px', fontWeight: 500, color: '#16181D', display: 'block', marginBottom: 6 }}>
            회원 유형
          </label>
          <div
            className="flex rounded-lg overflow-hidden"
            style={{ border: '1px solid #E5E8EC', padding: 3, gap: 3 }}
          >
            {(['student', 'teacher'] as UserType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setForm({ ...form, role: t })}
                className="flex-1 rounded transition-colors"
                style={{
                  height: 36,
                  fontSize: '13px',
                  fontWeight: 600,
                  backgroundColor: form.role === t ? '#1B64DA' : 'transparent',
                  color: form.role === t ? '#FFFFFF' : '#5A6270',
                }}
              >
                {t === 'student' ? '학생' : '교사'}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label style={{ fontSize: '13px', fontWeight: 500, color: '#16181D', display: 'block', marginBottom: 6 }}>
              이름
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="실명을 입력하세요"
              autoComplete="name"
              className="w-full px-3 rounded-lg outline-none"
              style={{ height: 40, border: '1px solid #E5E8EC', fontSize: '14px', color: '#16181D' }}
              onFocus={(e) => (e.target.style.borderColor = '#1B64DA')}
              onBlur={(e) => (e.target.style.borderColor = '#E5E8EC')}
            />
          </div>

          <div>
            <label style={{ fontSize: '13px', fontWeight: 500, color: '#16181D', display: 'block', marginBottom: 6 }}>
              아이디
            </label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="영문·숫자 조합 5자 이상"
              autoComplete="username"
              className="w-full px-3 rounded-lg outline-none"
              style={{ height: 40, border: '1px solid #E5E8EC', fontSize: '14px', color: '#16181D' }}
              onFocus={(e) => (e.target.style.borderColor = '#1B64DA')}
              onBlur={(e) => (e.target.style.borderColor = '#E5E8EC')}
            />
            {form.username.length > 0 && (
              <div className="mt-1 flex flex-col gap-0.5">
                <Rule ok={validIdLen} text="5자 이상" />
                <Rule ok={validIdAlnum} text="영문·숫자만 사용 가능" />
              </div>
            )}
          </div>

          <div>
            <label style={{ fontSize: '13px', fontWeight: 500, color: '#16181D', display: 'block', marginBottom: 6 }}>
              비밀번호
            </label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="영문+숫자 조합 8자 이상"
                autoComplete="new-password"
                className="w-full px-3 pr-10 rounded-lg outline-none"
                style={{ height: 40, border: '1px solid #E5E8EC', fontSize: '14px', color: '#16181D' }}
                onFocus={(e) => (e.target.style.borderColor = '#1B64DA')}
                onBlur={(e) => (e.target.style.borderColor = '#E5E8EC')}
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: '#5A6270' }}
                tabIndex={-1}
              >
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {form.password.length > 0 && (
              <Rule ok={validPw} text="영문과 숫자를 포함하여 8자 이상" />
            )}
          </div>

          <div>
            <label style={{ fontSize: '13px', fontWeight: 500, color: '#16181D', display: 'block', marginBottom: 6 }}>
              비밀번호 확인
            </label>
            <div className="relative">
              <input
                type={showPwConfirm ? 'text' : 'password'}
                value={form.passwordConfirm}
                onChange={(e) => setForm({ ...form, passwordConfirm: e.target.value })}
                placeholder="비밀번호를 한 번 더 입력하세요"
                autoComplete="new-password"
                className="w-full px-3 pr-10 rounded-lg outline-none"
                style={{ height: 40, border: '1px solid #E5E8EC', fontSize: '14px', color: '#16181D' }}
                onFocus={(e) => (e.target.style.borderColor = '#1B64DA')}
                onBlur={(e) => (e.target.style.borderColor = '#E5E8EC')}
              />
              <button
                type="button"
                onClick={() => setShowPwConfirm(!showPwConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: '#5A6270' }}
                tabIndex={-1}
              >
                {showPwConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {form.passwordConfirm.length > 0 && (
              <Rule ok={validPwConfirm} text="비밀번호가 일치합니다" />
            )}
          </div>

          {error && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}
            >
              <span style={{ fontSize: '13px', color: '#DC2626' }}>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit || loading}
            className="w-full rounded-lg text-white mt-2 transition-colors disabled:opacity-40"
            style={{ height: 44, backgroundColor: '#1B64DA', fontSize: '14px', fontWeight: 600 }}
            onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#1450B5'; }}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#1B64DA')}
          >
            {loading ? '가입 중...' : '가입 완료'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <span style={{ fontSize: '13px', color: '#5A6270' }}>이미 계정이 있으신가요?</span>{' '}
          <Link href="/login" style={{ fontSize: '13px', color: '#1B64DA', fontWeight: 500 }}>로그인</Link>
        </div>
      </div>
    </div>
  );
}
