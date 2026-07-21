import { useState } from 'react';
import { ChevronDown, Eye, EyeOff, UserCheck, UserX, X } from 'lucide-react';
import type { EditUserForm, UserRow } from '../_lib/types';

export function EditUserModal({ user, onClose, onSave }: {
  user: UserRow;
  onClose: () => void;
  onSave: (user: UserRow, form: EditUserForm) => Promise<string | null>;
}) {
  const [form, setForm] = useState<EditUserForm>({ name: user.name, role: user.role === 'admin' ? 'student' : user.role, is_active: user.is_active, new_password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!form.name.trim()) { setError('이름을 입력해주세요.'); return; }
    if (form.new_password && form.new_password.length < 8) { setError('비밀번호는 8자 이상이어야 합니다.'); return; }
    setSaving(true);
    setError('');
    const saveError = await onSave(user, form);
    setSaving(false);
    if (saveError) setError(saveError);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(22,24,29,0.5)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl w-full mx-4" style={{ maxWidth: 440, boxShadow: '0 8px 40px rgba(22,24,29,0.18)' }} onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid #E5E8EC' }}><div><h2 style={{ fontSize: '17px', fontWeight: 700, color: '#16181D' }}>사용자 정보 수정</h2><p style={{ fontSize: '13px', color: '#5A6270', marginTop: 2 }}>{user.username}</p></div><button onClick={onClose} className="flex items-center justify-center rounded-xl transition-colors hover:bg-[#F6F7F9]" style={{ width: 36, height: 36 }}><X size={18} style={{ color: '#5A6270' }} /></button></div>
        <div className="px-6 py-5 flex flex-col gap-4">
          <div><label style={{ fontSize: '13px', fontWeight: 600, color: '#16181D', display: 'block', marginBottom: 6 }}>이름</label><input className="w-full rounded-xl px-4 focus:outline-none" style={{ height: 44, border: '1px solid #E5E8EC', fontSize: '14px', color: '#16181D' }} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} onFocus={(event) => (event.target.style.borderColor = '#1B64DA')} onBlur={(event) => (event.target.style.borderColor = '#E5E8EC')} /></div>
          <div><label style={{ fontSize: '13px', fontWeight: 600, color: '#16181D', display: 'block', marginBottom: 6 }}>역할</label><div className="relative"><select className="w-full rounded-xl px-4 appearance-none focus:outline-none" style={{ height: 44, border: '1px solid #E5E8EC', fontSize: '14px', color: '#16181D', backgroundColor: '#FFFFFF' }} value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as EditUserForm['role'] }))}><option value="student">학생</option><option value="teacher">선생님</option></select><ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" style={{ color: '#5A6270' }} /></div></div>
          <div className="flex items-center justify-between rounded-xl px-4" style={{ height: 52, border: '1px solid #E5E8EC', backgroundColor: form.is_active ? '#F0FDF4' : '#FFF5F5' }}><div className="flex items-center gap-2">{form.is_active ? <UserCheck size={18} style={{ color: '#16A34A' }} /> : <UserX size={18} style={{ color: '#DC2626' }} />}<span style={{ fontSize: '14px', fontWeight: 600, color: form.is_active ? '#16A34A' : '#DC2626' }}>{form.is_active ? '활성 계정' : '비활성 계정'}</span>{!form.is_active && <span style={{ fontSize: '12px', color: '#DC2626' }}>— 로그인 불가</span>}</div><button onClick={() => setForm((current) => ({ ...current, is_active: !current.is_active }))} className="relative rounded-full transition-colors" style={{ width: 44, height: 24, backgroundColor: form.is_active ? '#16A34A' : '#E5E8EC' }}><span className="absolute top-0.5 rounded-full bg-white transition-all" style={{ width: 20, height: 20, left: form.is_active ? 22 : 2 }} /></button></div>
          <div><label style={{ fontSize: '13px', fontWeight: 600, color: '#16181D', display: 'block', marginBottom: 6 }}>새 비밀번호 <span style={{ fontSize: '12px', color: '#BCC0C7', fontWeight: 400 }}>(변경 시에만 입력)</span></label><div className="relative"><input className="w-full rounded-xl px-4 focus:outline-none pr-11" style={{ height: 44, border: '1px solid #E5E8EC', fontSize: '14px', color: '#16181D' }} type={showPassword ? 'text' : 'password'} placeholder="8자 이상" value={form.new_password} onChange={(event) => setForm((current) => ({ ...current, new_password: event.target.value }))} onFocus={(event) => (event.target.style.borderColor = '#1B64DA')} onBlur={(event) => (event.target.style.borderColor = '#E5E8EC')} /><button onClick={() => setShowPassword((current) => !current)} className="absolute right-3 top-1/2 -translate-y-1/2">{showPassword ? <EyeOff size={16} style={{ color: '#BCC0C7' }} /> : <Eye size={16} style={{ color: '#BCC0C7' }} />}</button></div></div>
          {error && <p style={{ fontSize: '13px', color: '#DC2626' }}>{error}</p>}
        </div>
        <div className="flex gap-2 px-6 pb-6"><button onClick={onClose} className="flex-1 rounded-xl transition-colors" style={{ height: 48, border: '1px solid #E5E8EC', fontSize: '15px', fontWeight: 600, color: '#16181D' }}>취소</button><button onClick={handleSave} disabled={saving} className="flex-1 rounded-xl text-white transition-colors disabled:opacity-50" style={{ height: 48, backgroundColor: '#1B64DA', fontSize: '15px', fontWeight: 600 }}>{saving ? '저장 중...' : '저장'}</button></div>
      </div>
    </div>
  );
}
