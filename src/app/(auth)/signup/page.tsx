'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, X } from 'lucide-react';

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
  const [form, setForm] = useState({ username: '', password: '', passwordConfirm: '', name: '', role: 'student' as UserType });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const validId = form.username.length >= 5;
  const validPw = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(form.password);
  const validPwConfirm = form.password === form.passwordConfirm && form.passwordConfirm !== '';
  const validName = form.name.length > 0;
  const canSubmit = validId && validPw && validPwConfirm && validName;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError('');
    setLoading(true);

    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: form.username,
        password: form.password,
        name: form.name,
        role: form.role,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? '가입 중 오류가 발생했습니다.');
      return;
    }

    router.push('/login');
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F6F7F9' }}>
      <div
        className="w-full max-w-md rounded-xl bg-white p-8"
        style={{ border: '1px solid #E5E8EC', boxShadow: '0 4px 16px rgba(22,24,29,0.08)' }}
      >
        <div className="mb-6">
          <Link href="/login" style={{ fontSize: '22px', fontWeight: 700, color: '#1B64DA' }}>
            페어코드
          </Link>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#16181D', marginTop: 8 }}>회원가입</h2>
          <p style={{ fontSize: '13px', color: '#5A6270', marginTop: 2 }}>페어코드 계정을 만들어 시작하세요</p>
        </div>

        <div className="mb-5">
          <label style={{ fontSize: '13px', fontWeight: 500, color: '#16181D', display: 'block', marginBottom: 6 }}>
            회원 유형
          </label>
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid #E5E8EC', padding: 3, gap: 3 }}>
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
            <label style={{ fontSize: '13px', fontWeight: 500, color: '#16181D', display: 'block', marginBottom: 6 }}>이름</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="실명을 입력하세요"
              className="w-full px-3 rounded-lg outline-none"
              style={{ height: 40, border: '1px solid #E5E8EC', fontSize: '14px', color: '#16181D' }}
              onFocus={(e) => (e.target.style.borderColor = '#1B64DA')}
              onBlur={(e) => (e.target.style.borderColor = '#E5E8EC')}
            />
          </div>

          <div>
            <label style={{ fontSize: '13px', fontWeight: 500, color: '#16181D', display: 'block', marginBottom: 6 }}>아이디</label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="5자 이상의 아이디"
              className="w-full px-3 rounded-lg outline-none"
              style={{ height: 40, border: '1px solid #E5E8EC', fontSize: '14px', color: '#16181D' }}
              onFocus={(e) => (e.target.style.borderColor = '#1B64DA')}
              onBlur={(e) => (e.target.style.borderColor = '#E5E8EC')}
            />
            {form.username.length > 0 && <Rule ok={validId} text="아이디는 5자 이상이어야 합니다" />}
          </div>

          <div>
            <label style={{ fontSize: '13px', fontWeight: 500, color: '#16181D', display: 'block', marginBottom: 6 }}>비밀번호</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="영문+숫자 조합 8자 이상"
              className="w-full px-3 rounded-lg outline-none"
              style={{ height: 40, border: '1px solid #E5E8EC', fontSize: '14px', color: '#16181D' }}
              onFocus={(e) => (e.target.style.borderColor = '#1B64DA')}
              onBlur={(e) => (e.target.style.borderColor = '#E5E8EC')}
            />
            {form.password.length > 0 && <Rule ok={validPw} text="영문과 숫자를 포함하여 8자 이상이어야 합니다" />}
          </div>

          <div>
            <label style={{ fontSize: '13px', fontWeight: 500, color: '#16181D', display: 'block', marginBottom: 6 }}>비밀번호 확인</label>
            <input
              type="password"
              value={form.passwordConfirm}
              onChange={(e) => setForm({ ...form, passwordConfirm: e.target.value })}
              placeholder="비밀번호를 한 번 더 입력하세요"
              className="w-full px-3 rounded-lg outline-none"
              style={{ height: 40, border: '1px solid #E5E8EC', fontSize: '14px', color: '#16181D' }}
              onFocus={(e) => (e.target.style.borderColor = '#1B64DA')}
              onBlur={(e) => (e.target.style.borderColor = '#E5E8EC')}
            />
            {form.passwordConfirm.length > 0 && <Rule ok={validPwConfirm} text="비밀번호가 일치합니다" />}
          </div>

          {error && <p style={{ fontSize: '13px', color: '#DC2626' }}>{error}</p>}

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
