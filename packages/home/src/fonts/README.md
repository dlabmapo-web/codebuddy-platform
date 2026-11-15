# Space Grotesk

`SpaceGrotesk-Variable.ttf` is the unmodified variable font from [Google Fonts](https://github.com/google/fonts/blob/00a38a53f92aef923b9353f40128e8f4552ddae4/ofl/spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf), pinned to commit `00a38a53f92aef923b9353f40128e8f4552ddae4`. Its SHA-256 is `acad6de1fc93436f5c0f1f4137751ef04f1aea3063e7036535970ffcfbd79f72`.

The adjacent `OFL.txt` contains the original SIL Open Font License and copyright notice (whitespace normalized). A deployed copy is served at `/fonts/space-grotesk/OFL.txt`. The font includes its original glyph coverage and weight axis (300–700); the home layout retains its existing 500–700 weights, CSS variable and swap behavior.

The font is loaded through `next/font/local` because current Google Fonts CSS can return extensionless font URLs that Next 16.4.1's Google loader cannot parse. Vendoring removes that build-time dependency while continuing to serve the font from our own site.
