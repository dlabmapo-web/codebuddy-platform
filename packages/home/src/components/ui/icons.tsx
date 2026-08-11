import type { SVGProps } from "react";

/*
 * The site's icon set, drawn locally at lucide's proportions — 24px box,
 * 1.75 stroke, round caps — so it sits beside the product's lucide icons
 * without looking like a second family.
 *
 * Not lucide itself: as of v1.25 its `Icon.mjs` imports `context.mjs`, which
 * emits `"use strict"` above `"use client"`. That makes the directive inert, so
 * importing any icon — even the individual `icons/book-open.mjs` module —
 * pulls `createContext` into the RSC graph and fails the build. Every page here
 * is a server component. (`language-switch.tsx` is a client component and does
 * use lucide directly, which is fine.)
 *
 * All decorative: every caller supplies the accessible name.
 */

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

/* ── Navigation and chrome ─────────────────────────────────────────────── */

export function ArrowRight(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Icon>
  );
}

export function ArrowLeft(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </Icon>
  );
}

export function ChevronRight(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m9 6 6 6-6 6" />
    </Icon>
  );
}

export function Phone(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6.6 3h-2A1.6 1.6 0 0 0 3 4.7C3 13.1 10.9 21 19.3 21a1.6 1.6 0 0 0 1.7-1.6v-2a1.1 1.1 0 0 0-.85-1.07l-3.2-.72a1.1 1.1 0 0 0-1.1.4l-.85 1.06a13.3 13.3 0 0 1-5.2-5.2l1.06-.85a1.1 1.1 0 0 0 .4-1.1l-.72-3.2A1.1 1.1 0 0 0 6.6 3Z" />
    </Icon>
  );
}

export function Menu(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 6h18M3 12h18M3 18h18" />
    </Icon>
  );
}

export function X(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Icon>
  );
}

/* ── 사업 영역 ─────────────────────────────────────────────────────────── */

/** AI·코딩 교육 — a book, opened. */
export function BookOpen(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 7v13" />
      <path d="M3 5.5A1.5 1.5 0 0 1 4.6 4c2.6 0 6 .6 7.4 2 1.4-1.4 4.8-2 7.4-2A1.5 1.5 0 0 1 21 5.5v11a1.5 1.5 0 0 1-1.6 1.5c-2.6 0-6 .6-7.4 2-1.4-1.4-4.8-2-7.4-2A1.5 1.5 0 0 1 3 16.5Z" />
    </Icon>
  );
}

/** 교육 솔루션 — a window with a play control: the platform itself. */
export function MonitorPlay(props: IconProps) {
  return (
    <Icon {...props}>
      <rect height="13" rx="2" width="18" x="3" y="4" />
      <path d="M8 21h8M12 17v4" />
      <path d="m11 8.5 3.5 2-3.5 2Z" />
    </Icon>
  );
}

/** 기업·기관 교육 — a building. */
export function Building(props: IconProps) {
  return (
    <Icon {...props}>
      <rect height="18" rx="1.5" width="13" x="4" y="3" />
      <path d="M17 9h3v10a2 2 0 0 1-2 2h-1" />
      <path d="M8 7h2M13 7h2M8 11h2M13 11h2M8 15h2M13 15h2" />
    </Icon>
  );
}

/** 대학 — a graduation cap. */
export function GraduationCap(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m12 4 9.5 4.5L12 13 2.5 8.5 12 4Z" />
      <path d="M6.5 10.8V16c0 1.6 2.5 3 5.5 3s5.5-1.4 5.5-3v-5.2" />
      <path d="M21 9v5" />
    </Icon>
  );
}

/** 위치 — a pin. */
export function MapPin(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.6" />
    </Icon>
  );
}

/** Time saved. */
export function Clock(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.2l3.4 2" />
    </Icon>
  );
}

/** A team working on its own. */
export function Sparkles(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m12 3 1.7 4.6L18.3 9.3 13.7 11 12 15.6 10.3 11 5.7 9.3l4.6-1.7L12 3Z" />
      <path d="M18.5 15.5 19.3 17.7 21.5 18.5 19.3 19.3 18.5 21.5 17.7 19.3 15.5 18.5 17.7 17.7Z" />
    </Icon>
  );
}

/* ── Cove Studio ───────────────────────────────────────────────────────── */

/** Runs in the browser with nothing to install. */
export function Zap(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13 2 4.5 13.5H11l-.5 8.5L19 10.5h-6.5Z" />
    </Icon>
  );
}

/** Graded on submit. */
export function CircleCheck(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </Icon>
  );
}

/** Live monitoring. */
export function Eye(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

/** Progress data. */
export function ChartBar(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 21h18" />
      <rect height="7" rx="1" width="4" x="5" y="12" />
      <rect height="12" rx="1" width="4" x="11" y="7" />
      <rect height="17" rx="1" width="4" x="17" y="2" />
    </Icon>
  );
}

/* ── How it fits ───────────────────────────────────────────────────────── */

/** Curriculum. */
export function Layers(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m12 3 9 5-9 5-9-5Z" />
      <path d="m3 13 9 5 9-5" />
      <path d="m3 17.5 9 5 9-5" />
    </Icon>
  );
}

/** A class. */
export function Users(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16.5 5.2a3.5 3.5 0 0 1 0 6.6M18 14.5a6.5 6.5 0 0 1 3.5 5.5" />
    </Icon>
  );
}

/** The lesson. */
export function Code(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m9 8-4 4 4 4M15 8l4 4-4 4" />
    </Icon>
  );
}

/** Results over time. */
export function TrendingUp(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 17.5 9.5 11l4 4L21 7.5" />
      <path d="M15.5 7.5H21v5.5" />
    </Icon>
  );
}

/* ── Details ───────────────────────────────────────────────────────────── */

/** Two languages. */
export function Globe(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3.2 9h17.6M3.2 15h17.6" />
      <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18Z" />
    </Icon>
  );
}

/** Light and dark. */
export function Contrast(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none" />
    </Icon>
  );
}

/** Any browser. */
export function Window(props: IconProps) {
  return (
    <Icon {...props}>
      <rect height="16" rx="2" width="18" x="3" y="4" />
      <path d="M3 9h18M6.5 6.5h.01M9.5 6.5h.01" />
    </Icon>
  );
}

/** Scoped per institution. */
export function ShieldCheck(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 21s7-3.2 7-9V6l-7-3-7 3v6c0 5.8 7 9 7 9Z" />
      <path d="m9 12 2 2 4-4" />
    </Icon>
  );
}
