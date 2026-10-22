'use client';

import { useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/studio/button';
import { useTurtleTranslation } from './use-turtle-translation';
import styles from './turtle-trial.module.css';

// One native input keeps paste, selection, Backspace and screen readers working
// normally. The six boxes are only a visual representation of that input.
export function TurtlePinInput({ value, onChange, disabled, invalid }: {
  value: string; onChange: (value: string) => void; disabled: boolean; invalid: boolean;
}) {
  const { t } = useTurtleTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [visible, setVisible] = useState(false);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  function select(start: number, end = start) {
    input.current?.setSelectionRange(start, end);
    setSelection({ start, end });
  }
  return <div className={styles.pinField}>
    <div className={styles.pinLabel}>
      <label htmlFor="turtle-pin">{t('classroom_code')}</label>
      <Button variant="ghost" size="sm" type="button" disabled={disabled} className={styles.pinVisibility}
        aria-controls="turtle-pin" aria-pressed={visible} onClick={() => setVisible(v => !v)}>
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        {t(visible ? 'hide_access_code' : 'show_access_code')}
      </Button>
    </div>
    <div className={styles.pinBoxes} data-invalid={invalid} data-disabled={disabled}>
      <input ref={input} id="turtle-pin" name="turtle-pin" autoComplete="off" type={visible ? 'text' : 'password'}
        inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={value} disabled={disabled} required
        aria-invalid={invalid} aria-describedby={`turtle-pin-hint${invalid ? ' trial-error' : ''}`}
        onChange={e => onChange(e.currentTarget.value.replace(/[^0-9]/g, '').slice(0, 6))}
        onSelect={e => setSelection({ start: e.currentTarget.selectionStart ?? 0, end: e.currentTarget.selectionEnd ?? 0 })}
        onClick={e => {
          const rect = e.currentTarget.getBoundingClientRect();
          const index = Math.min(value.length, Math.max(0, Math.floor((e.clientX - rect.left) / (rect.width / 6))));
          // Preserve native drag selection and double/triple-click selection.
          if (e.detail === 1 && e.currentTarget.selectionStart === e.currentTarget.selectionEnd) select(index);
        }}
        onPaste={e => {
          e.preventDefault();
          const digits = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 6);
          if (!digits) return;
          const start = e.currentTarget.selectionStart ?? value.length;
          const end = e.currentTarget.selectionEnd ?? start;
          const next = digits.length === 6 ? digits : (value.slice(0, start) + digits + value.slice(end)).slice(0, 6);
          onChange(next);
          // The controlled value must commit before restoring the native caret.
          requestAnimationFrame(() => select(digits.length === 6 ? 6 : Math.min(start + digits.length, 6)));
        }} />
      <div className={styles.pinSlots} aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => <span key={i} data-filled={!!value[i]}
          data-active={selection.start === selection.end && i === Math.min(selection.start, 5)}
          data-selected={i >= selection.start && i < selection.end}>
          {value[i] ? visible ? value[i] : '•' : <span className={styles.pinPlaceholder} />}
        </span>)}
      </div>
    </div>
    <p id="turtle-pin-hint" className={styles.pinHint}>{t('ask_teacher_for_code')}</p>
  </div>;
}
