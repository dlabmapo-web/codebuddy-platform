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

  it('uses the same fixed wrapper for the placeholder', () => {
    const html = renderToStaticMarkup(
      <ProfileAvatar name="Cove Manager" size="xl" />,
    );

    expect(html).toContain('width:96px');
    expect(html).toContain('height:96px');
    // The stand-in fills the wrapper rather than sizing itself, so one drawing
    // serves the 32px roster disc and the 96px profile header alike.
    expect(html).toContain('data-avatar="placeholder"');
    expect(html).toContain('<svg');
    expect(html).toContain('absolute inset-0 h-full w-full');
  });

  it('hides the placeholder from assistive technology', () => {
    // The name is always written beside it; describing the figure too would
    // announce the person twice.
    const html = renderToStaticMarkup(<ProfileAvatar name="Cove Manager" />);
    expect(html).toContain('aria-hidden');
  });

  it('prefers a real photo over the placeholder', () => {
    const html = renderToStaticMarkup(
      <ProfileAvatar externalAvatarUrl="https://oauth.test/p.jpg" name="Kim" />,
    );
    expect(html).toContain('data-avatar="external"');
    expect(html).not.toContain('<svg');
  });
});
