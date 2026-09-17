'use client';

import {
  closestCenter,
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { GripVertical } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import type { CourseBuilderState } from '../_hooks/use-course-builder';
import {
  acceptsKind,
  dropEdge,
  resolveDrop,
  type DragItem,
  type DragKind,
  type DropEdge,
  type DropTarget,
} from '../_lib/drag-drop';

/**
 * Drag and drop for the course outline, beside the move dialog rather than
 * instead of it.
 *
 * Dragging is the fast path for a move the author can see: two problems apart,
 * or into the lecture below. The dialog stays the path for everything dragging
 * is bad at — a destination four chapters away, a touch screen, a keyboard, a
 * screen reader — so this layer deliberately registers no keyboard sensor and
 * keeps its handles out of the tab order.
 *
 * Nothing moves while dragging. The rows stay where they are and a single line
 * shows where the item would land, because a tree that reflows under the
 * pointer across three nesting levels is harder to aim at than a still one.
 * On drop, the same move the dialog makes is issued, so undo, the reveal, and
 * stale-tree handling behave identically.
 */

type Indicator = { key: string; edge: DropEdge };

type DndState = {
  active: DragItem | null;
  indicator: Indicator | null;
};

const DndStateContext = createContext<DndState>({ active: null, indicator: null });

const dropId = (kind: DragKind, id: string) => `drop:${kind}:${id}`;
const dragId = (kind: DragKind, id: string) => `drag:${kind}:${id}`;

/**
 * Only targets that accept the dragged kind are ever hit.
 *
 * The pointer's own position wins; the nearest accepting target is the
 * fallback for the gaps between rows, so a drop never lands on nothing.
 */
const collisionDetection: CollisionDetection = (args) => {
  const kind = (args.active.data.current as DragItem | undefined)?.kind;
  if (!kind) return [];
  const droppableContainers = args.droppableContainers.filter((container) =>
    acceptsKind(container.data.current as DropTarget | undefined, kind),
  );
  const within = pointerWithin({ ...args, droppableContainers });
  return within.length > 0 ? within : closestCenter({ ...args, droppableContainers });
};

export function BuilderDndProvider({
  builder,
  children,
}: {
  builder: CourseBuilderState;
  children: ReactNode;
}) {
  const { t } = useTranslation('content');
  const [active, setActive] = useState<DragItem | null>(null);
  const [indicator, setIndicator] = useState<Indicator | null>(null);

  const sensors = useSensors(
    // A few pixels of travel before a press becomes a drag, so a click on the
    // handle is still just a click.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Long-press on touch, so scrolling the outline never starts a drag.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );

  const track = useCallback((event: DragMoveEvent) => {
    const item = event.active.data.current as DragItem | undefined;
    const over = event.over;
    const target = over?.data.current as DropTarget | undefined;
    const activeRect = event.active.rect.current.translated;
    if (!item || !over || !activeRect) {
      setIndicator((current) => (current === null ? current : null));
      return;
    }
    const below =
      activeRect.top + activeRect.height / 2 > over.rect.top + over.rect.height / 2;
    const edge = dropEdge(target, item.kind, below);
    const next = edge ? { key: String(over.id), edge } : null;
    setIndicator((current) =>
      current?.key === next?.key && current?.edge === next?.edge ? current : next,
    );
  }, []);

  const reset = () => {
    setActive(null);
    setIndicator(null);
  };

  const onDragStart = (event: DragStartEvent) => {
    setActive((event.active.data.current as DragItem | undefined) ?? null);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const item = event.active.data.current as DragItem | undefined;
    const edge = indicator?.edge ?? null;
    const target = event.over?.data.current as DropTarget | undefined;
    reset();
    if (!item || !event.over || String(event.over.id) !== indicator?.key) return;
    const move = resolveDrop(builder.tree, item, target, edge);
    if (!move) return;
    if (move.kind === 'module') {
      builder.moveModule(move.itemId, move.to.index);
      return;
    }
    void builder.moveFromDrag(move.kind, move.itemId, move.to);
  };

  const state = useMemo(() => ({ active, indicator }), [active, indicator]);

  return (
    <DndStateContext.Provider value={state}>
      <DndContext
        collisionDetection={collisionDetection}
        measuring={{ droppable: { strategy: MeasuringStrategy.WhileDragging } }}
        onDragCancel={reset}
        onDragEnd={onDragEnd}
        onDragMove={track}
        onDragOver={track}
        onDragStart={onDragStart}
        sensors={sensors}
      >
        {children}
        {/* No drop animation: the row it would fly back to is about to move. */}
        <DragOverlay dropAnimation={null}>
          {active ? (
            <div className="flex max-w-sm cursor-grabbing items-center gap-2 rounded-lg bg-card px-3 py-2 text-[14px] font-semibold shadow-xl ring-1 ring-brand/30">
              <GripVertical aria-hidden className="size-4 shrink-0 text-brand" />
              <span className="shrink-0 text-[12px] font-bold text-sub">
                {t(`row.kind_${active.kind}`)}
              </span>
              <span className="min-w-0 truncate">{active.title}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </DndStateContext.Provider>
  );
}

/**
 * One outline row as both something to pick up and somewhere to drop.
 *
 * Returns a single ref for the row, props for its grip, and the edge a drop
 * line should be drawn on. Both roles share the node: the row a reader sees is
 * the row that is measured.
 */
export function useOutlineRowDnd({
  canDrag,
  canDrop = canDrag,
  item,
  target,
}: {
  canDrag: boolean;
  /**
   * Whether anything may land here. Separate from dragging because a lecture
   * header receives problems, which is a different permission from moving the
   * lecture itself.
   */
  canDrop?: boolean;
  item: DragItem;
  target: DropTarget;
}) {
  const { active, indicator } = useContext(DndStateContext);
  const draggable = useDraggable({
    id: dragId(item.kind, item.id),
    data: item,
    disabled: !canDrag,
  });
  const droppableId = dropId(item.kind, item.id);
  const droppable = useDroppable({ id: droppableId, data: target, disabled: !canDrop });
  const { setNodeRef: setDragNode } = draggable;
  const { setNodeRef: setDropNode } = droppable;

  const setNodeRef = useCallback(
    (node: HTMLElement | null) => {
      setDragNode(node);
      setDropNode(node);
    },
    [setDragNode, setDropNode],
  );

  return {
    setNodeRef,
    isDragging: draggable.isDragging,
    dropEdge: active && indicator?.key === droppableId ? indicator.edge : null,
    handle: canDrag
      ? {
          setActivatorNodeRef: draggable.setActivatorNodeRef,
          listeners: draggable.listeners,
        }
      : null,
  };
}

/**
 * The grip a row is dragged by.
 *
 * Out of the tab order and hidden from assistive technology: this layer has no
 * keyboard sensor, and the row menu's "Move to…" is the accessible way to do
 * the same thing, so announcing a control that cannot be operated would be a
 * lie.
 */
export function DragHandle({
  handle,
  className,
}: {
  handle: ReturnType<typeof useOutlineRowDnd>['handle'];
  className?: string;
}) {
  const { t } = useTranslation('content');
  if (!handle) return null;
  const { listeners, setActivatorNodeRef } = handle;
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-6 shrink-0 cursor-grab touch-none place-items-center rounded text-sub/50 transition-colors hover:bg-canvas hover:text-ink active:cursor-grabbing',
        className,
      )}
      ref={setActivatorNodeRef}
      title={t('row.drag_handle')}
      {...listeners}
    >
      <GripVertical className="size-4" />
    </span>
  );
}

/** The line, or the outline, that says where a drop would land. */
export function DropIndicator({ edge }: { edge: DropEdge | null }) {
  if (!edge) return null;
  if (edge === 'inside') {
    return (
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] bg-brand/5 ring-2 ring-inset ring-brand"
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-x-2 z-10 h-0.5 rounded-full bg-brand',
        edge === 'before' ? 'top-0 -translate-y-1/2' : 'bottom-0 translate-y-1/2',
      )}
    >
      <span className="absolute -left-1 top-1/2 size-2 -translate-y-1/2 rounded-full bg-brand" />
    </span>
  );
}
