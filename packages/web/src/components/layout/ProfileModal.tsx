'use client';

import { useState, useEffect } from 'react';
import { Check, Eye, EyeOff, X } from 'lucide-react';

interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
  currentName: string;
  onUpdated: (newName: string) => void;
}

type Tab = 'name' | 'password';

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#16181D', marginBottom: 6 }}>
      {children}
    </label>
  );
}

function TextInput({
  type = 'text',
  value,
  onChange,
  placeholder,
  autoComplete,
  suffix,
}: {
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  suffix?: React.ReactNode;
}) {
  return (
    <div className="relative">
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="w-full px-3 rounded-lg outline-none transition-colors"
        style={{
          height: 40,
          border: '1px solid #E5E8EC',
          fontSize: '14px',
          color: '#16181D',
          paddingRight: suffix ? 40 : 12,
        }}
        onFocus={(e) => (e.target.style.borderColor = '#1B64DA')}
        onBlur={(e) => (e.target.style.borderColor = '#E5E8EC')}
      />
      {suffix && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2">{suffix}</span>
      )}
    </div>
  );
}

function EyeToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{ color: '#5A6270', lineHeight: 0 }}
      tabIndex={-1}
    >
      {show ? <EyeOff size={15} /> : <Eye size={15} />}
    </button>
  );
}

function Rule({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className="flex items-center gap-1.5 mt-1">
      {ok
        ? <Check size={12} style={{ color: '#16A34A' }} />
        : <X size={12} style={{ color: '#DC2626' }} />}
      <span style={{ fontSize: '12px', color: ok ? '#16A34A' : '#DC2626' }}>{text}</span>
    </div>
  );
}

export function ProfileModal({ open, onClose, currentName, onUpdated }: ProfileModalProps) {
  const [tab, setTab] = useState<Tab>('name');

  const [name, setName] = useState(currentName);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (open) {
      setName(currentName);
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      setError('');
      setSuccess('');
      setTab('name');
    }
  }, [open, currentName]);

  const validNewPw = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(newPw);
  const validConfirm = newPw === confirmPw && confirmPw !== '';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (tab === 'name') {
      if (!name.trim()) { setError('이름을 입력해주세요.'); return; }
      if (name.trim() === currentName) { setError('변경된 이름이 없습니다.'); return; }
    } else {
      if (!currentPw) { setError('현재 비밀번호를 입력해주세요.'); return; }
      if (!validNewPw) { setError('새 비밀번호는 영문+숫자 8자 이상이어야 합니다.'); return; }
      if (!validConfirm) { setError('새 비밀번호가 일치하지 않습니다.'); return; }
    }

    setLoading(true);

    try {
      const body =
        tab === 'name'
          ? { name: name.trim() }
          : { currentPassword: currentPw, newPassword: newPw };

      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? '변경 중 오류가 발생했습니다.');
        return;
      }

      setSuccess(tab === 'name' ? '이름이 변경되었습니다.' : '비밀번호가 변경되었습니다.');
      if (tab === 'name') onUpdated(data.user.name);

      if (tab === 'password') {
        setCurrentPw('');
        setNewPw('');
        setConfirmPw('');
      }
    } catch {
      setError('네트워크 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.currentTarget === e.target) onClose(); }}
    >
      <div
        className="bg-card w-full max-w-sm mx-4"
        style={{ borderRadius: 12, boxShadow: '0 8px 32px rgba(22,24,29,0.18)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #E5E8EC' }}>
          <span style={{ fontSize: '16px', fontWeight: 600, color: '#16181D' }}>내 정보 변경</span>
          <button onClick={onClose} style={{ color: '#5A6270', lineHeight: 0 }}>
            <X size={18} />
          </button>
        </div>

        <div className="flex px-6 pt-4 gap-1">
          {(['name', 'password'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { setTab(t); setError(''); setSuccess(''); }}
              className="px-4 rounded-lg transition-colors"
              style={{
                height: 34,
                fontSize: '13px',
                fontWeight: 600,
                backgroundColor: tab === t ? '#EAF1FD' : 'transparent',
                color: tab === t ? '#1B64DA' : '#5A6270',
              }}
            >
              {t === 'name' ? '이름 변경' : '비밀번호 변경'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">
          {tab === 'name' ? (
            <div>
              <FieldLabel>새 이름</FieldLabel>
              <TextInput
                value={name}
                onChange={setName}
                placeholder="변경할 이름을 입력하세요"
                autoComplete="name"
              />
            </div>
          ) : (
            <>
              <div>
                <FieldLabel>현재 비밀번호</FieldLabel>
                <TextInput
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPw}
                  onChange={setCurrentPw}
                  placeholder="현재 비밀번호"
                  autoComplete="current-password"
                  suffix={<EyeToggle show={showCurrent} onToggle={() => setShowCurrent(!showCurrent)} />}
                />
              </div>
              <div>
                <FieldLabel>새 비밀번호</FieldLabel>
                <TextInput
                  type={showNew ? 'text' : 'password'}
                  value={newPw}
                  onChange={setNewPw}
                  placeholder="영문+숫자 조합 8자 이상"
                  autoComplete="new-password"
                  suffix={<EyeToggle show={showNew} onToggle={() => setShowNew(!showNew)} />}
                />
                {newPw.length > 0 && <Rule ok={validNewPw} text="영문과 숫자를 포함하여 8자 이상" />}
              </div>
              <div>
                <FieldLabel>새 비밀번호 확인</FieldLabel>
                <TextInput
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPw}
                  onChange={setConfirmPw}
                  placeholder="새 비밀번호를 한 번 더 입력하세요"
                  autoComplete="new-password"
                  suffix={<EyeToggle show={showConfirm} onToggle={() => setShowConfirm(!showConfirm)} />}
                />
                {confirmPw.length > 0 && <Rule ok={validConfirm} text="비밀번호가 일치합니다" />}
              </div>
            </>
          )}

          {error && (
            <div
              className="px-3 py-2 rounded-lg"
              style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}
            >
              <span style={{ fontSize: '13px', color: '#DC2626' }}>{error}</span>
            </div>
          )}
          {success && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0' }}
            >
              <Check size={14} style={{ color: '#16A34A', flexShrink: 0 }} />
              <span style={{ fontSize: '13px', color: '#16A34A' }}>{success}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 rounded-lg transition-colors"
              style={{
                height: 38,
                fontSize: '13px',
                fontWeight: 500,
                border: '1px solid #E5E8EC',
                color: '#5A6270',
              }}
            >
              닫기
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 rounded-lg text-white transition-colors disabled:opacity-50"
              style={{
                height: 38,
                fontSize: '13px',
                fontWeight: 600,
                backgroundColor: '#1B64DA',
              }}
              onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#1450B5'; }}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#1B64DA')}
            >
              {loading ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
