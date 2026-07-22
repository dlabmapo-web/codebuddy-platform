export function AdminToast({ message, type }: { message: string; type: 'ok' | 'err' }) {
  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl text-white z-50"
      style={{ backgroundColor: type === 'ok' ? '#16A34A' : '#DC2626', fontSize: '14px', fontWeight: 600, boxShadow: '0 4px 16px rgba(22,24,29,0.18)' }}
    >
      {message}
    </div>
  );
}
