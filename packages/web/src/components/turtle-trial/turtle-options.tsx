'use client';

import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import type { TurtleStarterId } from '@cove/shared';
import { ChoiceSelector } from '@/components/studio/choice-selector';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/studio/overlays';
import { useTurtleTranslation } from './use-turtle-translation';
import styles from './turtle-trial.module.css';

export function TurtleOptions({ starter, font, saved, busy, onStarterChange, onFontChange, onReset, onHelp, onDownload, onProject, onFullscreen, onExit }: {
  starter: TurtleStarterId; font: number; saved: boolean; busy: boolean;
  onStarterChange: (id: TurtleStarterId) => void;
  onFontChange: (size: number) => void;
  onReset: () => void; onHelp: () => void; onDownload: () => void;
  onProject: () => void; onFullscreen: () => void; onExit: () => void;
}) {
  const { t } = useTurtleTranslation();
  const [open, setOpen] = useState(false);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  function action(callback: () => void) { setOpen(false); callback(); }
  const starters = [
    { id: 'drawing', name: t('draw_shapes') },
    { id: 'race', name: t('turtle_race') },
    { id: 'free', name: t('free_practice') },
  ];
  return <Popover open={open} onOpenChange={next => {
    if (next) setContainer(document.fullscreenElement as HTMLElement | null);
    setOpen(next);
  }}>
    <PopoverTrigger asChild>
      <button type="button" className={styles.optionsTrigger} aria-label={t('more_options')}><MoreHorizontal size={22} /></button>
    </PopoverTrigger>
    <PopoverContent align="end" portalContainer={container} className={styles.optionsPanel} aria-label={t('more_options')}>
      <div className={styles.settingsField}>
        <span>{t('example')}</span>
        <ChoiceSelector label={t('choose_a_starter')} list={starters} selectedId={starter} onSelect={item => onStarterChange(item.id as TurtleStarterId)} />
      </div>
      <div className={styles.settingsField}>
        <span>{t('font_size')}</span>
        <ChoiceSelector label={t('font_size')} list={[14, 16, 18, 20, 22, 24, 26, 28].map(size => ({ id: String(size), name: `${size}px` }))} selectedId={String(font)} onSelect={item => onFontChange(Number(item.id))} />
      </div>
      <div className={styles.optionActions}>
        <button type="button" onClick={() => action(onReset)} disabled={busy}>{t('reset_code')}</button>
        <button type="button" onClick={() => action(onHelp)}>{t('commands')}</button>
        <button type="button" onClick={() => action(onDownload)}>{t('download_code_py')}</button>
        <button type="button" onClick={() => action(onProject)}>{t('project_with_helpers_zip')}</button>
        <button type="button" onClick={() => action(onFullscreen)}>{t('fullscreen')}</button>
        <button type="button" onClick={() => action(onExit)} disabled={busy}>{t('exit')}</button>
      </div>
      <p className={saved ? '' : styles.unsaved}>{saved ? t('saved_in_this_tab') : t('download_to_keep_your_code')}</p>
    </PopoverContent>
  </Popover>;
}
