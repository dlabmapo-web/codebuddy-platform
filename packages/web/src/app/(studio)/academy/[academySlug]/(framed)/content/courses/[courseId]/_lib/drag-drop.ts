import { locateItem, type CourseTree, type MoveLocation } from './course-tree';

/** Anything in the outline that can be picked up. */
export type DragKind = 'module' | 'lecture' | 'exercise';

export type DragItem = { kind: DragKind; id: string; title: string };

/**
 * What one drop target is, for each kind of item that may land on it.
 *
 * A lecture header is two targets at once: a place *between lectures* for a
 * dragged lecture, and the *end of its problem list* for a dragged problem —
 * which is also how a problem reaches a lecture that is collapsed or empty.
 * A chapter header is the same for chapters and lectures.
 */
export type DropTarget = {
  /** The row itself, as a sibling a dragged item of this kind lands beside. */
  row?: { kind: DragKind; id: string };
  /** The parent whose list a dragged item of this kind is appended to. */
  container?: { accepts: DragKind; parentId: string };
};

export type DropEdge = 'before' | 'after' | 'inside';

export function acceptsKind(target: DropTarget | undefined, kind: DragKind) {
  return target?.row?.kind === kind || target?.container?.accepts === kind;
}

/** How the target would receive this item, or `null` if it would not. */
export function dropEdge(
  target: DropTarget | undefined,
  kind: DragKind,
  pointerBelowMiddle: boolean,
): DropEdge | null {
  if (target?.row?.kind === kind) return pointerBelowMiddle ? 'after' : 'before';
  if (target?.container?.accepts === kind) return 'inside';
  return null;
}

/**
 * The move a drop describes, or `null` when it would change nothing.
 *
 * Indices are computed against the destination *without* the dragged item,
 * which is the contract every move takes: dropping a problem after its own
 * next sibling is one step down, not two.
 */
export function resolveDrop(
  tree: CourseTree,
  item: Pick<DragItem, 'kind' | 'id'>,
  target: DropTarget | undefined,
  edge: DropEdge | null,
): { kind: DragKind; itemId: string; to: MoveLocation } | null {
  if (!target || !edge) return null;
  const from = locate(tree, item.kind, item.id);
  if (!from) return null;

  let parentId: string;
  let rawIndex: number;
  if (edge === 'inside') {
    if (target.container?.accepts !== item.kind) return null;
    parentId = target.container.parentId;
    rawIndex = childIds(tree, item.kind, parentId).length;
  } else {
    if (target.row?.kind !== item.kind || target.row.id === item.id) return null;
    const over = locate(tree, item.kind, target.row.id);
    if (!over) return null;
    parentId = over.parentId;
    rawIndex = over.index + (edge === 'after' ? 1 : 0);
  }

  // Lifting the item out shifts everything after it up by one.
  const index = parentId === from.parentId && rawIndex > from.index ? rawIndex - 1 : rawIndex;
  if (parentId === from.parentId && index === from.index) return null;
  return { kind: item.kind, itemId: item.id, to: { parentId, index } };
}

function locate(tree: CourseTree, kind: DragKind, id: string): MoveLocation | null {
  if (kind === 'module') {
    const index = tree.modules.findIndex((item) => item.id === id);
    return index < 0 ? null : { parentId: tree.course.id, index };
  }
  return locateItem(tree, kind, id);
}

function childIds(tree: CourseTree, kind: DragKind, parentId: string): string[] {
  if (kind === 'module') return tree.modules.map((item) => item.id);
  if (kind === 'lecture') {
    return tree.modules.find((item) => item.id === parentId)?.lectures.map((item) => item.id) ?? [];
  }
  for (const courseModule of tree.modules) {
    const lecture = courseModule.lectures.find((item) => item.id === parentId);
    if (lecture) return lecture.materials.map((item) => item.id);
  }
  return [];
}
