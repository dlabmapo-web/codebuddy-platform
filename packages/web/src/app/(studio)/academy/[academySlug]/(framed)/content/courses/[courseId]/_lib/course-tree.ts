import type { CourseTree as SharedCourseTree } from '@cove/shared';

export type CourseTree = SharedCourseTree;
export type CourseModule = CourseTree['modules'][number];
export type CourseLecture = CourseModule['lectures'][number];

/**
 * Shared so saving a problem can invalidate the exact tree the builder reads.
 * Without this the builder would serve its cached copy for a full staleTime.
 */
export function courseTreeQueryKey(academyId: string, courseId: string) {
  return ['academy', academyId, 'course', courseId] as const;
}

/**
 * The list with one item moved to another index.
 *
 * Deliberately not a swap. Moving the eighth item to second shifts the six
 * between them down one place, which is what a reader means by "move it
 * there"; a swap would exchange two items and leave the rest where they were.
 *
 * `to` is the index the item should end up at, read after the move. Both
 * indices are clamped rather than trusted, so a stale list cannot drop an item
 * from the ordering the server is about to be given — it must receive every
 * id it already has.
 */
export function reordered<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (from < 0 || from >= next.length) return next;
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved!);
  return next;
}

export function countLectures(tree: CourseTree) {
  return tree.modules.reduce(
    (total, courseModule) => total + courseModule.lectures.length,
    0,
  );
}

/* ------------------------------------------------------------------ moving */

/**
 * What the move dialog moves. Chapters are not here: they only ever move
 * within their course, and keep the sibling list in `MoveModal`.
 */
export type MoveKind = 'lecture' | 'exercise';

/** One place an item can be moved into: a chapter for a lecture, a lecture for a problem. */
export type MoveParent = {
  id: string;
  title: string;
  /** Lectures in a chapter, or problems in a lecture — the item itself excluded. */
  childCount: number;
  /** Not reachable by students, whether by its own flag or an ancestor's. */
  hidden: boolean;
  current: boolean;
};

/** Destinations grouped as the outline shows them. */
export type MoveGroup = {
  id: string;
  title: string;
  hidden: boolean;
  parents: MoveParent[];
};

export type MoveLocation = { parentId: string; index: number };

/** Where a lecture or problem is now, or `null` when the tree no longer holds it. */
export function locateItem(
  tree: CourseTree,
  kind: MoveKind,
  itemId: string,
): (MoveLocation & { title: string }) | null {
  for (const courseModule of tree.modules) {
    if (kind === 'lecture') {
      const index = courseModule.lectures.findIndex((item) => item.id === itemId);
      if (index >= 0) {
        return { parentId: courseModule.id, index, title: courseModule.lectures[index]!.title };
      }
      continue;
    }
    for (const lecture of courseModule.lectures) {
      const index = lecture.materials.findIndex((item) => item.id === itemId);
      if (index >= 0) {
        return { parentId: lecture.id, index, title: lecture.materials[index]!.title };
      }
    }
  }
  return null;
}

/**
 * Every place the item could go, in outline order, with the current one marked.
 *
 * A lecture chooses among chapters, presented as a single group named after
 * the course; a problem chooses among lectures, grouped by their chapter.
 */
export function moveDestinations(
  tree: CourseTree,
  kind: MoveKind,
  itemId: string,
): MoveGroup[] {
  const location = locateItem(tree, kind, itemId);
  const courseVisible = tree.course.isVisible;
  if (kind === 'lecture') {
    return [
      {
        id: tree.course.id,
        title: tree.course.title,
        hidden: !courseVisible,
        parents: tree.modules.map((courseModule) => ({
          id: courseModule.id,
          title: courseModule.title,
          childCount: courseModule.lectures.filter((item) => item.id !== itemId).length,
          hidden: !(courseVisible && courseModule.isVisible),
          current: courseModule.id === location?.parentId,
        })),
      },
    ];
  }
  return tree.modules.map((courseModule) => {
    const moduleVisible = courseVisible && courseModule.isVisible;
    return {
      id: courseModule.id,
      title: courseModule.title,
      hidden: !moduleVisible,
      parents: courseModule.lectures.map((lecture) => ({
        id: lecture.id,
        title: lecture.title,
        childCount: lecture.materials.filter((item) => item.id !== itemId).length,
        hidden: !(moduleVisible && lecture.isVisible),
        current: lecture.id === location?.parentId,
      })),
    };
  });
}

/** How many destinations a dialog lists; search appears above this many. */
export function destinationCount(groups: readonly MoveGroup[]) {
  return groups.reduce((total, group) => total + group.parents.length, 0);
}

export const MOVE_SEARCH_THRESHOLD = 8;

/**
 * Destinations whose title, or whose group's title, contains the query.
 *
 * Case-insensitive substring matching, which is also the right rule for Hangul:
 * authors search for a word they remember from the title. A group whose own
 * title matches keeps all of its destinations.
 */
export function filterDestinations(
  groups: readonly MoveGroup[],
  query: string,
): MoveGroup[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [...groups];
  return groups
    .map((group) =>
      group.title.toLocaleLowerCase().includes(needle)
        ? group
        : {
            ...group,
            parents: group.parents.filter((parent) =>
              parent.title.toLocaleLowerCase().includes(needle),
            ),
          },
    )
    .filter((group) => group.parents.length > 0);
}

export type PositionOption = {
  /** The index the item ends up at, among the destination's children. */
  index: number;
  label:
    | { kind: 'first' }
    | { kind: 'after'; title: string }
    | { kind: 'last' }
    | { kind: 'only' };
  /** The place the item already holds. */
  current: boolean;
};

/**
 * Where in `parentId` the item can land, and which one to preselect.
 *
 * Positions are listed against the destination *without* the item, so every
 * label describes a place that will exist after the move. In the current
 * parent the item's own place is listed, marked, and preselected, so opening
 * the dialog commits to nothing; anywhere else the last place is preselected.
 */
export function positionOptions(
  tree: CourseTree,
  kind: MoveKind,
  itemId: string,
  parentId: string,
): { options: PositionOption[]; defaultIndex: number } {
  const siblings = childrenOf(tree, kind, parentId).filter((item) => item.id !== itemId);
  const location = locateItem(tree, kind, itemId);
  const currentIndex = location?.parentId === parentId ? location.index : -1;

  if (siblings.length === 0) {
    return {
      options: [{ index: 0, label: { kind: 'only' }, current: currentIndex === 0 }],
      defaultIndex: 0,
    };
  }
  const options: PositionOption[] = [
    { index: 0, label: { kind: 'first' }, current: currentIndex === 0 },
  ];
  for (let index = 1; index < siblings.length; index += 1) {
    options.push({
      index,
      label: { kind: 'after', title: siblings[index - 1]!.title },
      current: currentIndex === index,
    });
  }
  options.push({
    index: siblings.length,
    label: { kind: 'last' },
    current: currentIndex === siblings.length,
  });
  return {
    options,
    defaultIndex: currentIndex >= 0 ? currentIndex : siblings.length,
  };
}

/**
 * Whether students can reach the item now and after the move, and which
 * ancestor would hide it.
 *
 * Only the destination's ancestors change; the item's own flag is untouched by
 * a move. So an item hidden by its own flag reports no change either way, and
 * `hiddenBy` names the nearest hidden ancestor of the destination.
 */
export function visibilityAfterMove(
  tree: CourseTree,
  kind: MoveKind,
  itemId: string,
  parentId: string,
): { now: boolean; after: boolean; hiddenBy: string | null } {
  const ownVisible = itemOwnVisibility(tree, kind, itemId);
  const location = locateItem(tree, kind, itemId);
  const now = location ? ownVisible && parentReachable(tree, kind, location.parentId) : false;
  const after = ownVisible && parentReachable(tree, kind, parentId);
  return { now, after, hiddenBy: after ? null : hiddenAncestor(tree, kind, parentId) };
}

/** The tree as it will be after the move, for undo and reveal; never rendered early. */
export function movedTree(
  tree: CourseTree,
  kind: MoveKind,
  itemId: string,
  to: MoveLocation,
): CourseTree {
  if (kind === 'lecture') {
    let moving: CourseLecture | undefined;
    const without = tree.modules.map((courseModule) => {
      const found = courseModule.lectures.find((item) => item.id === itemId);
      if (found) moving = found;
      return { ...courseModule, lectures: courseModule.lectures.filter((item) => item.id !== itemId) };
    });
    if (!moving) return tree;
    return {
      ...tree,
      modules: without.map((courseModule) =>
        courseModule.id === to.parentId
          ? { ...courseModule, lectures: insertAt(courseModule.lectures, moving!, to.index) }
          : courseModule,
      ),
    };
  }
  let moving: CourseLecture['materials'][number] | undefined;
  const without = tree.modules.map((courseModule) => ({
    ...courseModule,
    lectures: courseModule.lectures.map((lecture) => {
      const found = lecture.materials.find((item) => item.id === itemId);
      if (found) moving = found;
      return { ...lecture, materials: lecture.materials.filter((item) => item.id !== itemId) };
    }),
  }));
  if (!moving) return tree;
  return {
    ...tree,
    modules: without.map((courseModule) => ({
      ...courseModule,
      lectures: courseModule.lectures.map((lecture) =>
        lecture.id === to.parentId
          ? { ...lecture, materials: insertAt(lecture.materials, moving!, to.index) }
          : lecture,
      ),
    })),
  };
}

/** The chapter holding a lecture, or the lecture itself for a chapter id. */
export function moduleOfParent(tree: CourseTree, kind: MoveKind, parentId: string) {
  return kind === 'lecture'
    ? tree.modules.find((item) => item.id === parentId)
    : tree.modules.find((item) => item.lectures.some((lecture) => lecture.id === parentId));
}

function childrenOf(tree: CourseTree, kind: MoveKind, parentId: string): Array<{ id: string; title: string }> {
  if (kind === 'lecture') {
    return tree.modules.find((item) => item.id === parentId)?.lectures ?? [];
  }
  for (const courseModule of tree.modules) {
    const lecture = courseModule.lectures.find((item) => item.id === parentId);
    if (lecture) return lecture.materials;
  }
  return [];
}

function itemOwnVisibility(tree: CourseTree, kind: MoveKind, itemId: string) {
  for (const courseModule of tree.modules) {
    for (const lecture of courseModule.lectures) {
      if (kind === 'lecture' && lecture.id === itemId) return lecture.isVisible;
      const material = lecture.materials.find((item) => item.id === itemId);
      if (kind === 'exercise' && material) return material.isVisible;
    }
  }
  return false;
}

function parentReachable(tree: CourseTree, kind: MoveKind, parentId: string) {
  return hiddenAncestor(tree, kind, parentId) === null;
}

function hiddenAncestor(tree: CourseTree, kind: MoveKind, parentId: string): string | null {
  if (!tree.course.isVisible) return tree.course.title;
  const courseModule = moduleOfParent(tree, kind, parentId);
  if (!courseModule) return null;
  if (!courseModule.isVisible) return courseModule.title;
  if (kind === 'lecture') return null;
  const lecture = courseModule.lectures.find((item) => item.id === parentId);
  return lecture && !lecture.isVisible ? lecture.title : null;
}

function insertAt<T>(items: readonly T[], item: T, index: number): T[] {
  const next = [...items];
  next.splice(Math.max(0, Math.min(index, next.length)), 0, item);
  return next;
}

/** The lecture a problem sits in now, or `null` when the course no longer holds it. */
export function lectureHoldingMaterial(tree: CourseTree, materialId: string): string | null {
  return locateItem(tree, 'exercise', materialId)?.parentId ?? null;
}

/** Which level of the outline a visibility flag belongs to. */
export type VisibilityTarget = 'course' | 'module' | 'lecture' | 'exercise';

/**
 * The tree with one visibility flag already flipped.
 *
 * The builder shows this the moment an eye is pressed and the server's answer
 * replaces it when it arrives: the round trip reloads the whole course, and an
 * author waiting on that for a one-bit change reads the product as slow.
 */
export function withVisibility(
  tree: CourseTree,
  target: VisibilityTarget,
  id: string,
  isVisible: boolean,
): CourseTree {
  if (target === 'course') {
    return tree.course.id === id ? { ...tree, course: { ...tree.course, isVisible } } : tree;
  }
  return {
    ...tree,
    modules: tree.modules.map((courseModule) => {
      if (target === 'module') {
        return courseModule.id === id ? { ...courseModule, isVisible } : courseModule;
      }
      return {
        ...courseModule,
        lectures: courseModule.lectures.map((lecture) => {
          if (target === 'lecture') {
            return lecture.id === id ? { ...lecture, isVisible } : lecture;
          }
          return {
            ...lecture,
            materials: lecture.materials.map((material) =>
              material.id === id ? { ...material, isVisible } : material,
            ),
          };
        }),
      };
    }),
  };
}

/**
 * Positions rewritten to match array order, as the server stores them.
 *
 * An optimistic tree keeps its arrays in the new order but its `position`
 * fields in the old one, and the outline prints numbers like `2-1-3` from
 * those fields. Renumbering keeps the numbers right during the round trip.
 */
export function renumbered(tree: CourseTree): CourseTree {
  return {
    ...tree,
    modules: tree.modules.map((courseModule, moduleIndex) => ({
      ...courseModule,
      position: moduleIndex + 1,
      lectures: courseModule.lectures.map((lecture, lectureIndex) => ({
        ...lecture,
        position: lectureIndex + 1,
        materials: lecture.materials.map((material, materialIndex) => ({
          ...material,
          position: materialIndex + 1,
        })),
      })),
    })),
  };
}
