'use client';

import { academyRoles, type AcademyRole } from '@cove/shared';

import { ResponsiveSelector } from '@/components/studio/selector';
import { useLayoutTranslation } from '@/i18n';

/** Academy role picker shared by members, applications, and invitations. */
export function RoleSelector({
  value,
  onChange,
  disabled,
  label,
  roles = academyRoles,
  popoverClassName = 'w-48',
}: {
  value: AcademyRole | null;
  onChange: (role: AcademyRole) => void;
  disabled?: boolean;
  label?: string;
  roles?: readonly AcademyRole[];
  popoverClassName?: string;
}) {
  const { t } = useLayoutTranslation(['academy', 'common']);
  // Rebuilt per render so a language switch is reflected without a remount.
  const roleOptions = roles.map((role) => ({
    id: role,
    name: t(`common:role.${role}`),
  }));

  return (
    <ResponsiveSelector
      disabled={disabled}
      drawerTitle={t('role_selector.drawer_title')}
      label={label ?? t('role_selector.label')}
      list={roleOptions}
      onSelect={(item) => onChange(item.id as AcademyRole)}
      placeholder={t('role_selector.search')}
      popoverClassName={popoverClassName}
      selectedId={value}
    />
  );
}
