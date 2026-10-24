'use client';

import { exerciseSolutionEntrySchema, exerciseSolutionsSchema, type ExerciseSolutionEntry } from '@cove/shared';
import { BadgeCheck } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EDITOR_FONT_FAMILY, registerPaircodeTheme } from '@/lib/monaco/theme';
import { useLayoutTranslation } from '@/i18n';
import { SectionCard } from './authoring-fields';

const MonacoEditor = dynamic(() => import('@/lib/monaco/editor'), { ssr: false });

export function SolutionCodeEditor({ value, onChange, error }: {
  value: ExerciseSolutionEntry[];
  onChange: (value: ExerciseSolutionEntry[]) => void;
  error: string | null;
}) {
  const { t } = useTranslation('solutions');
  const { t: common } = useLayoutTranslation('common');
  const nextKey = useRef(value.length);
  const [keys, setKeys] = useState(() => value.map((_, index) => index));
  const focusNew = useRef(false);
  const current = useRef(value);
  const currentKeys = useRef(keys);
  useLayoutEffect(() => { current.current = value; currentKeys.current = keys; }, [value, keys]);
  function commit(entries: ExerciseSolutionEntry[], entryKeys = currentKeys.current) {
    current.current = entries;
    currentKeys.current = entryKeys;
    setKeys(entryKeys);
    onChange(entries);
  }
  // Monaco can emit before its effect has installed the latest onChange callback.
  // Resolve a stable entry key against current data rather than a captured index.
  function change(key: number, patch: Partial<ExerciseSolutionEntry>) {
    const index = currentKeys.current.indexOf(key);
    if (index < 0) return;
    commit(current.current.map((entry, position) => position === index ? { ...entry, ...patch } : entry));
  }
  function move(index: number, target: number) {
    const entries = [...current.current];
    [entries[index], entries[target]] = [entries[target], entries[index]];
    const reorderedKeys = [...currentKeys.current];
    [reorderedKeys[index], reorderedKeys[target]] = [reorderedKeys[target], reorderedKeys[index]];
    commit(entries, reorderedKeys);
  }
  const button = 'rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-40';
  return <SectionCard title={t('title')} description={t('help')} icon={BadgeCheck}>
    <div className="space-y-5" data-testid="solution-editors">
      {value.map((entry, index) => <section key={keys[index]} className="space-y-3 rounded-xl border border-border p-3" aria-label={t('answer', { number: index + 1 })}>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="mr-auto font-semibold">{t('answer', { number: index + 1 })}</h3>
          <button type="button" className={button} disabled={index === 0} onClick={() => move(index, index - 1)}>{t('up')}</button>
          <button type="button" className={button} disabled={index === value.length - 1} onClick={() => move(index, index + 1)}>{t('down')}</button>
          <button type="button" className={button} disabled={value.length === 1} onClick={() => {
            if (entry.code.trim() && !window.confirm(t('confirm'))) return;
            commit(current.current.filter((_, position) => position !== index), currentKeys.current.filter((_, position) => position !== index));
          }}>{t('remove')}</button>
        </div>
        <label className="block text-sm">{t('name')}
          <input className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2" maxLength={80} value={entry.title ?? ''} onChange={event => change(keys[index], { title: event.target.value || null })} />
        </label>
        <div className="overflow-hidden rounded-lg border border-border">
          <MonacoEditor loading={common('state.loading')} beforeMount={registerPaircodeTheme} height="280px" language="python" theme="paircode-dark" value={entry.code}
            onMount={editor => { if (focusNew.current && index === value.length - 1) { editor.focus(); focusNew.current = false; } }}
            onChange={code => change(keys[index], { code: code ?? '' })}
            options={{ ariaLabel: t('answer', { number: index + 1 }), automaticLayout: true, fontFamily: EDITOR_FONT_FAMILY, fontSize: 13, lineNumbers: 'on', minimap: { enabled: false }, scrollBeyondLastLine: false, tabSize: 4, wordWrap: 'off' }} />
        </div>
        {!exerciseSolutionEntrySchema.safeParse(entry).success && <p role="alert" className="text-sm text-danger">{t('invalid')}</p>}
      </section>)}
      {(!exerciseSolutionsSchema.safeParse(value).success || !value.length) && <p role="alert" className="text-sm text-danger">{t('total')}</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <button type="button" className={button} disabled={value.length >= 10} onClick={() => {
        focusNew.current = true;
        commit([...current.current, { title: null, code: '' }], [...currentKeys.current, nextKey.current++]);
      }}>{t('add')}</button>
    </div>
  </SectionCard>;
}
