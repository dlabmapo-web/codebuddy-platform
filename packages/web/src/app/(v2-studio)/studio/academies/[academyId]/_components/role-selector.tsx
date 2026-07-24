'use client';

import { academyRoles, type AcademyRole } from '@cove/shared';

import { ResponsiveSelector } from '@/components/studio/selector';

export const roleOptions = academyRoles.map((role) => ({
  id: role,
  name: formatRoleName(role),
}));

export function formatRoleName(role: AcademyRole): string {
  return role
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}

/** Academy role picker shared by members, applications, and invitations. */
export function RoleSelector({
  value,
  onChange,
  disabled,
  label = 'Select role',
  popoverClassName = 'w-48',
}: {
  value: AcademyRole | null;
  onChange: (role: AcademyRole) => void;
  disabled?: boolean;
  label?: string;
  popoverClassName?: string;
}) {
  return (
    <ResponsiveSelector
      disabled={disabled}
      drawerTitle="Academy role"
      label={label}
      list={roleOptions}
      onSelect={(item) => onChange(item.id as AcademyRole)}
      placeholder="Search roles…"
      popoverClassName={popoverClassName}
      selectedId={value}
    />
  );
}
