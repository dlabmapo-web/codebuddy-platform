'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { PointerMarker } from '@/components/collab/PointerOverlay';
import {
  collaborationSurfaceSelector,
  type CollaborationPointerRole,
  type CollaborationSurface,
  type PointerMovePayload,
} from '@/lib/collab/pointerSurfaces';

const POINTER_IDLE_HIDE_MS = 3000;

// 상대의 포인터가 내 화면에 없는 영역(예: 닫아둔 교육과정 패널)에 있을 때 대신 보여줄 문구
const SURFACE_ACTIVITY_LABEL: Record<
  CollaborationPointerRole,
  Record<CollaborationSurface, string>
> = {
  student: {
    header: '학생이 상단 메뉴를 보고 있습니다',
    curriculum: '학생이 교육과정을 보고 있습니다',
    statement: '학생이 문제 설명을 보고 있습니다',
    editor: '학생이 코드 편집기를 보고 있습니다',
    terminal: '학생이 터미널을 사용하고 있습니다',
  },
  teacher: {
    header: '선생님이 상단 메뉴를 보고 있습니다',
    curriculum: '선생님이 교육과정을 보고 있습니다',
    statement: '선생님이 문제 설명을 보고 있습니다',
    editor: '선생님이 코드 편집기를 보고 있습니다',
    terminal: '선생님이 터미널을 보고 있습니다',
  },
};

type OverlayPosition = {
  left: number;
  top: number;
  unavailable: boolean;
};

export type WholePagePointerOverlayHandle = {
  show: (pointer: PointerMovePayload) => void;
  clear: () => void;
};

export const WholePagePointerOverlay = forwardRef<
  WholePagePointerOverlayHandle,
  { enabled: boolean; role: CollaborationPointerRole }
>(function WholePagePointerOverlay({ enabled, role }, ref) {
  const [pointer, setPointer] = useState<PointerMovePayload | null>(null);
  const [position, setPosition] = useState<OverlayPosition | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    setPointer(null);
    setPosition(null);
  }, []);

  const show = useCallback((nextPointer: PointerMovePayload) => {
    setPointer(nextPointer);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(clear, POINTER_IDLE_HIDE_MS);
  }, [clear]);

  useImperativeHandle(ref, () => ({ show, clear }), [clear, show]);

  useEffect(() => {
    if (!enabled) clear();
  }, [clear, enabled]);

  useEffect(() => () => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
  }, []);

  useEffect(() => {
    if (!enabled || !pointer) return;

    let frame = 0;
    const updatePosition = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const surface = document.querySelector<HTMLElement>(
          collaborationSurfaceSelector(pointer.surface)
        );
        const rect = surface?.getBoundingClientRect();
        const visible = rect
          && rect.width > 0
          && rect.height > 0
          && rect.bottom > 0
          && rect.right > 0
          && rect.top < window.innerHeight
          && rect.left < window.innerWidth;

        if (!rect || !visible) {
          setPosition({ left: 0, top: 0, unavailable: true });
          return;
        }

        setPosition({
          left: rect.left + pointer.xPct * rect.width,
          top: rect.top + pointer.yPct * rect.height,
          unavailable: false,
        });
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [enabled, pointer]);

  if (!enabled || !pointer || !position) return null;

  if (position.unavailable) {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-1/2 top-14 z-[90] -translate-x-1/2 rounded-full px-3 py-1.5 shadow-lg"
        style={{
          backgroundColor: 'var(--color-card)',
          border: '1px solid var(--tint-accent-line)',
          color: 'var(--color-primary-hover)',
          fontSize: 11,
          fontWeight: 650,
        }}
        data-testid={`${role}-pointer-surface-activity`}
      >
        {SURFACE_ACTIVITY_LABEL[role][pointer.surface]}
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed z-[90] motion-reduce:transition-none"
      data-testid={`${role}-whole-page-pointer`}
      data-pointer-surface={pointer.surface}
      style={{
        left: position.left,
        top: position.top,
        transform: 'translate3d(0, 0, 0)',
        transition: 'left 0.06s linear, top 0.06s linear',
        willChange: 'left, top',
      }}
    >
      <PointerMarker name={pointer.name} role={role} />
    </div>
  );
});
