import type { Metadata } from 'next';
import './globals.css';
import { themeInitScript } from '@/lib/theme';

export const metadata: Metadata = {
  title: '코브 스튜디오',
  description: '실시간 협업 코딩 교육 플랫폼',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* Runs before paint to apply the saved theme and prevent a flash. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
