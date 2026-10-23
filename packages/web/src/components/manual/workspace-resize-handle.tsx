'use client';

import { useRef } from 'react';
import { useManualTranslation } from './use-manual-translation';
import styles from './manual-workspace.module.css';

const minimum = 20;
const maximum = 65;
export function WorkspaceResizeHandle({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const { t } = useManualTranslation();
  const drag = useRef<{ y: number; value: number; height: number } | null>(null);
  const change = (next: number) => onChange(Math.round(Math.max(minimum, Math.min(maximum, next))));
  return <div role="separator" tabIndex={0} aria-label={t('resize_results')}
    aria-orientation="horizontal" aria-valuemin={minimum} aria-valuemax={maximum} aria-valuenow={value}
    aria-valuetext={t('editor_percentage', { value })} className={styles.resize}
    onPointerDown={event => {
      if (event.button !== 0) return;
      const workspace = event.currentTarget.parentElement;
      const rows = workspace ? getComputedStyle(workspace).gridTemplateRows.split(' ').map(Number.parseFloat) : [];
      const height = rows.length === 5 ? rows[1] + rows[4] : workspace?.getBoundingClientRect().height ?? 0;
      if (!height) return;
      event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { y: event.clientY, value, height };
    }}
    onPointerMove={event => { if (drag.current) change(drag.current.value + (event.clientY - drag.current.y) / drag.current.height * 100); }}
    onPointerUp={event => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
    onPointerCancel={() => { drag.current = null; }}
    onLostPointerCapture={() => { drag.current = null; }}
    onKeyDown={event => {
      if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      change(event.key === 'Home' ? minimum : event.key === 'End' ? maximum : value + (event.key === 'ArrowUp' ? -1 : 1) * (event.shiftKey ? 10 : 2));
    }}
  ><span aria-hidden /></div>;
}
