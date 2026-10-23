'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Modal, ModalContent, Input } from '@/components/studio/primitives';
import { Button } from '@/components/studio/button';
import { sourceFileNameError } from './source-file-name';
import { useManualTranslation } from './use-manual-translation';

export function AddSourceFile({ files, onAdd, className }: { files: Record<string, string>; onAdd: (name: string) => void; className?: string }) {
  const { t } = useManualTranslation();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [attempted, setAttempted] = useState(false);
  const error = sourceFileNameError(name, files);
  return <>
    <Button size="sm" variant="ghost" className={className} onClick={() => { setName(''); setAttempted(false); setOpen(true); }}><Plus />{t('file')}</Button>
    <Modal open={open} onOpenChange={setOpen}>
      <ModalContent title={t('add_python_file')}>
        <form className="space-y-4 p-6" onSubmit={event => {
          event.preventDefault(); setAttempted(true);
          if (!error) { onAdd(name); setOpen(false); }
        }}>
          <label className="block space-y-2 text-sm font-semibold">{t('python_file_name')}
            <Input value={name} placeholder="helper.py" autoComplete="off" spellCheck={false}
              aria-invalid={attempted && Boolean(error)} aria-describedby="source-file-help"
              onChange={event => setName(event.target.value)} />
          </label>
          <p id="source-file-help" role={attempted && error ? 'alert' : undefined} className={attempted && error ? 'text-sm text-danger' : 'text-sm text-sub'}>{t(attempted && error ? error : 'file_hint')}</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>{t('cancel')}</Button>
            <Button type="submit">{t('create_file')}</Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  </>;
}
