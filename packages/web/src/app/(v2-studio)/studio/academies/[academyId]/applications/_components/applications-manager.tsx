'use client';

import { useApplicationsManager } from '../_hooks/use-applications-manager';
import { ApplicationsList } from './applications-list';

export function ApplicationsManager({ academyId }: { academyId: string }) {
  const manager = useApplicationsManager(academyId);
  return <ApplicationsList manager={manager} />;
}
