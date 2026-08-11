/**
 * The v1 login and signup screens.
 *
 * Pinned to the light palette like the other v1-era groups: their colour is
 * almost entirely inline `style` hex, so a themed surface underneath it would
 * darken while the text stayed near-black. See `.theme-light` in globals.css.
 * The v2 screens under `(v2-auth)` are fully tokenised and follow the theme.
 */
export default function LegacyAuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="theme-light contents">{children}</div>;
}
