import dynamic from 'next/dynamic';
import { FileCode2, X } from 'lucide-react';
import { formatDate, STATUS_CONFIG } from '../_lib/presentation';
import type { CodeModal } from '../_lib/types';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

export function SubmissionCodeModal({ modal, onClose }: { modal: CodeModal | null; onClose: () => void }) {
  if (!modal) return null;
  const status = STATUS_CONFIG[modal.submission.status];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-2xl flex flex-col overflow-hidden" style={{ width: '60vw', height: '80vh', maxWidth: 900 }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #E5E8EC', flexShrink: 0 }}>
          <div className="flex items-center gap-3 min-w-0">
            <FileCode2 size={18} style={{ color: '#1B64DA' }} />
            <div className="min-w-0">
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#16181D' }}>
                {modal.submission.problems?.problem_no}. {modal.submission.problems?.title}
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span style={{ fontSize: '12px', color: '#8A8F98' }}>{modal.studentName}</span>
                <span style={{ fontSize: '11px', color: '#BCC0C7' }}>·</span>
                <span style={{ fontSize: '12px', color: '#8A8F98' }}>{formatDate(modal.submission.submitted_at)}</span>
                <span style={{ fontSize: '11px', color: '#BCC0C7' }}>·</span>
                <span className="flex items-center gap-1" style={{ fontSize: '12px', fontWeight: 600, color: status.color }}>
                  <status.Icon size={12} /> {status.label}
                </span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="flex items-center justify-center rounded-lg transition-colors hover:bg-gray-100 shrink-0" style={{ width: 32, height: 32, color: '#8A8F98' }}>
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-hidden" style={{ backgroundColor: '#1E1E1E' }}>
          <MonacoEditor
            height="100%"
            language="python"
            theme="vs-dark"
            value={modal.submission.code}
            options={{ readOnly: true, fontSize: 13, fontFamily: "'Fira Code', Consolas, monospace", minimap: { enabled: false }, scrollBeyondLastLine: false, lineNumbers: 'on', padding: { top: 16, bottom: 16 }, automaticLayout: true }}
          />
        </div>
      </div>
    </div>
  );
}
