'use client';
import dynamic from 'next/dynamic';
export const PdfReader = dynamic(
  () => import('./pdf-canvas').then((m) => m.PdfCanvas),
  { ssr: false },
);
