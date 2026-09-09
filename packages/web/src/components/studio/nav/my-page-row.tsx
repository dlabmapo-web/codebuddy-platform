'use client';

import Link from 'next/link';

import { ProfileAvatar } from '@/components/studio/profile-avatar';
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/studio/sidebar';
import { useLayoutTranslation } from '@/i18n';
import { cn } from '@/lib/utils';

/**
 * Whose face the row wears.
 *
 * `academyImageUrl` is optional because the console has no academy to have a
 * photograph in: an operator standing outside every academy has only their
 * global picture, and asking the console to supply a field it cannot have
 * would make the caller invent a null to satisfy the type.
 */
export type MyPageViewer = {
  academyImageUrl?: string | null;
  imageUrl: string | null;
  avatarUrl: string | null;
  name: string | null;
};

/**
 * The one row in the rail that wears a face.
 *
 * `ProfileAvatar` rather than a `lucide` glyph, and that is the whole point of
 * it: every other row names a part of the academy and takes the icon its
 * subject deserves; this one leads to the reader, and their own photograph
 * says so faster than any glyph could — especially on the collapsed rail,
 * where a row is nothing but its icon.
 *
 * The avatar has to fight the collapsed rail's own rule to survive it.
 * `SidebarMenuButton` hides every direct `<span>` child at icon width, so the
 * label disappears — which is correct — and so would the avatar, which is a
 * span too. The override is deliberate and marked important, because the
 * alternative at that width is a row with nothing in it at all.
 *
 * Shared by both rails rather than written twice. The studio's My Page and the
 * console's are the same row about the same person, and the reasoning above is
 * the reason to have one of them: a second copy would lose these notes first
 * and then drift from them.
 *
 * `isActive` is a prop rather than a path test done here, because the two rails
 * answer it differently and only one of them can ever say yes. See the note at
 * the console's call site.
 */
export function MyPageRow({
  href,
  isActive,
  viewer,
}: {
  href: string;
  isActive: boolean;
  viewer: MyPageViewer | null;
}) {
  const { t } = useLayoutTranslation(['nav', 'common']);
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === 'collapsed' && !isMobile;
  const label = t('my_page');

  return (
    <SidebarGroup>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            asChild
            isActive={isActive}
            tooltip={collapsed ? label : undefined}
          >
            <Link href={href} onClick={() => setOpenMobile(false)}>
              {/*
                `xs`, not the header's `sm`. `ProfileAvatar` sets its width and
                height as inline styles, so a `size-*` class cannot shrink it —
                the size has to come from the prop, and asking for the header's
                size here gave the rail a 32px face standing among 17px glyphs
                and matching the avatar two corners away pixel for pixel.
              */}
              <ProfileAvatar
                academyImageUrl={viewer?.academyImageUrl}
                className={cn(
                  'ring-1 ring-sub/30',
                  'group-data-[collapsible=icon]:!inline-flex',
                )}
                externalAvatarUrl={viewer?.avatarUrl}
                globalImageUrl={viewer?.imageUrl}
                name={viewer?.name ?? label}
                size="xs"
              />
              <span>{label}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}
