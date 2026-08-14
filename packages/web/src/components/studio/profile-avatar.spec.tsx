import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ProfileAvatar } from './profile-avatar';

describe('ProfileAvatar sizing', () => {
  it('pins an uploaded xl image to a 96px wrapper', () => {
    const html = renderToStaticMarkup(
      <ProfileAvatar
        academyImageUrl="https://images.test/avatar.webp"
        name="Cove Manager"
        size="xl"
      />,
    );

    expect(html).toContain('width:96px');
    expect(html).toContain('height:96px');
    expect(html).toContain('absolute inset-0 block h-full w-full object-cover');
    expect(html).toContain('crossorigin="anonymous"');
  });

  it('uses the same fixed wrapper for initials', () => {
    const html = renderToStaticMarkup(
      <ProfileAvatar name="Cove Manager" size="xl" />,
    );

    expect(html).toContain('width:96px');
    expect(html).toContain('height:96px');
    expect(html).toContain('CM');
  });
});
