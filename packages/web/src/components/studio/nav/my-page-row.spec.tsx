import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n', () => ({
  useLayoutTranslation: () => ({ t: (key: string) => key }),
}));
import { SidebarProvider } from '@/components/studio/sidebar';

import { MyPageRow } from './my-page-row';

/*
 * The real provider rather than a mocked `useSidebar`. `SidebarMenuButton`
 * calls the hook through the module's own binding, so a mock on this side of
 * the import never reaches it — and the row exists to be rendered inside this
 * provider, which is the thing worth asserting.
 */
function render(element: React.ReactNode): string {
  return renderToStaticMarkup(<SidebarProvider>{element}</SidebarProvider>);
}

const member = {
  academyImageUrl: 'https://example.test/in-academy.png',
  imageUrl: 'https://example.test/global.png',
  avatarUrl: null,
  name: 'Cove Operator',
};

describe('the rail row that wears a face', () => {
  it('prefers the academy photograph where the reader has one', () => {
    const html = render(<MyPageRow href="/academy/mapo-dlab/me" isActive viewer={member} />);

    expect(html).toContain('in-academy.png');
    expect(html).toContain('/academy/mapo-dlab/me');
  });

  /*
   * The console has no academy to have a photograph in, so it supplies no
   * `academyImageUrl` at all rather than inventing a null to satisfy a type.
   */
  it('draws an operator who is standing in no academy', () => {
    const operator = {
      imageUrl: member.imageUrl,
      avatarUrl: member.avatarUrl,
      name: member.name,
    };
    const html = render(
      <MyPageRow href="/account?from=admin" isActive={false} viewer={operator} />,
    );

    expect(html).toContain('global.png');
    expect(html).not.toContain('in-academy.png');
    expect(html).toContain('/account?from=admin');
  });

  /*
   * `readViewer` never returns null — it answers with an empty shape when the
   * account lookup fails, precisely so a failed read costs the operator their
   * initials rather than the way back to their account. Both that shape and a
   * genuine null have to render the row.
   */
  it('still draws the row when the account could not be read', () => {
    for (const viewer of [
      null,
      { imageUrl: null, avatarUrl: null, name: null },
    ]) {
      const html = render(
        <MyPageRow href="/account" isActive={false} viewer={viewer} />,
      );

      expect(html).toContain('/account');
      expect(html).toContain('my_page');
    }
  });
});
