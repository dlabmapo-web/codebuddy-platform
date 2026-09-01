'use client';

import type { ClassSummary } from '@cove/shared';
import { Plus } from 'lucide-react';

import { Button } from '@/components/studio/button';
import { LayoutTrans, useLayoutTranslation } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';

import { useClassesManager } from '../_hooks/use-classes-manager';
import { ClassModal } from './class-modal';
import { ClassesTable } from './classes-table';

export function ClassesManager({
  academyId,
  initialClasses,
}: {
  academyId: string;
  initialClasses: ClassSummary[];
}) {
  const { t } = useLayoutTranslation(['classes', 'common']);
  const errorText = useErrorText();
  const manager = useClassesManager({ academyId, initialClasses });

  return (
    <div className="space-y-4">
      <p className="text-[14px] font-semibold text-sub">
        <LayoutTrans
          components={[<span className="font-mono text-ink" key="count" />]}
          count={manager.classes.length}
          i18nKey="classes:class_count"
          values={{ count: manager.classes.length }}
        />
      </p>

      <ClassModal manager={manager} />

      <ClassesTable
        manager={manager}
        toolbarActions={
          <Button onClick={manager.openCreate}>
            <Plus />
            {t('new_class')}
          </Button>
        }
      />

      {manager.loadError ? (
        <p className="text-[14px] font-semibold text-sub">{t('load_failed')}</p>
      ) : null}
      {manager.statusError ? (
        <p className="text-[14px] font-semibold text-danger">
          {errorText(manager.statusError, t('archive_dialog.failed'))}
        </p>
      ) : null}
    </div>
  );
}
