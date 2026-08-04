'use client';

import { CURSOR_COLORS } from '@/lib/monaco/cursor';

export function PointerMarker({ name, role }: { name: string; role: string }) {
  const color = CURSOR_COLORS[role] ?? CURSOR_COLORS.teacher;

  return (
    <>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ display: 'block', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))' }}>
        <path d="M4.5 2.5l15 7.2-6.6 1.9-2.1 6.6-6.3-15.7z" fill={color} stroke="white" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
      <span
        style={{
          position: 'absolute',
          left: 15,
          top: 16,
          background: color,
          color: 'white',
          fontSize: 11,
          fontWeight: 700,
          padding: '2px 7px',
          borderRadius: '2px 8px 8px 8px',
          whiteSpace: 'nowrap',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }}
      >
        {name}
      </span>
    </>
  );
}
