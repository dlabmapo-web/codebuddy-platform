import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '코브 스튜디오',
  description: '실시간 협업 코딩 교육 플랫폼',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
