'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="bg-white rounded-modal shadow-[0_8px_32px_rgba(22,24,29,0.18)] w-full max-w-md mx-4">
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <span className="text-[16px] font-semibold text-ink">{title}</span>
            <Button variant="ghost" size="sm" onClick={onClose} className="w-8 h-8 p-0">
              <X size={16} />
            </Button>
          </div>
        )}
        <div className="px-6 py-5">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">{footer}</div>
        )}
      </div>
    </div>
  );
}
