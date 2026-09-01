'use client';

import { ProfileAvatar } from '@/components/studio/profile-avatar';

import { userDisplayName } from '../_lib/user-view';

/**
 * A person's photo in the console, or their initials.
 *
 * `ProfileAvatar` unchanged, given the console's own naming rule. The academy
 * image is deliberately not passed: that is what one academy uploaded for one
 * membership, and a row spanning every academy has no single one to ask. What
 * is left is the account's own external photo and its name — which is exactly
 * the identity this directory deals in.
 */
export function UserAvatar({
  person,
  size = 'sm',
}: {
  person: {
    displayName: string | null;
    username: string | null;
    email: string | null;
    avatarUrl: string | null;
  };
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <ProfileAvatar
      alt=""
      externalAvatarUrl={person.avatarUrl}
      name={userDisplayName(person)}
      size={size}
    />
  );
}
