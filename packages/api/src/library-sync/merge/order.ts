/**
 * Merging the order of one parent's children, or of one keyed list
 * (design §9.2). Pure.
 *
 * Relative order is compared only on keys present in base, ours and theirs:
 * additions, removals and moves in or out are placement questions, not
 * reorders. The chosen order of those shared keys follows the five rules; the
 * remaining members are then inserted after their nearest preceding shared
 * key on their own side, library additions before academy ones at the same
 * anchor. No member is ever lost or duplicated.
 */

export type OrderMerge = {
  order: string[];
  outcome: "CONVERGED" | "APPLIED" | "KEPT" | "CONFLICT";
};

const same = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length &&
  left.every((key, index) => key === right[index]);

export function mergeOrder(input: {
  base: readonly string[];
  ours: readonly string[];
  theirs: readonly string[];
  /** Every key that ends up in this parent, in any order. */
  members: ReadonlySet<string>;
}): OrderMerge {
  const inBase = new Set(input.base);
  const inOurs = new Set(input.ours);
  const inTheirs = new Set(input.theirs);
  const shared = (list: readonly string[]) =>
    list.filter(
      (key) =>
        inBase.has(key) &&
        inOurs.has(key) &&
        inTheirs.has(key) &&
        input.members.has(key),
    );

  const baseShared = shared(input.base);
  const oursShared = shared(input.ours);
  const theirsShared = shared(input.theirs);

  let chosen: string[];
  let outcome: OrderMerge["outcome"];
  if (same(oursShared, theirsShared)) {
    chosen = oursShared;
    outcome = "CONVERGED";
  } else if (same(oursShared, baseShared)) {
    chosen = theirsShared;
    outcome = "APPLIED";
  } else if (same(theirsShared, baseShared)) {
    chosen = oursShared;
    outcome = "KEPT";
  } else {
    chosen = oursShared;
    outcome = "CONFLICT";
  }

  const placed = new Set(chosen);
  const START = "\u0000start";
  const libraryAfter = new Map<string, string[]>();
  const academyAfter = new Map<string, string[]>();
  const anchorIn = (list: readonly string[], index: number) => {
    for (let cursor = index - 1; cursor >= 0; cursor -= 1)
      if (placed.has(list[cursor]!)) return list[cursor]!;
    return START;
  };
  const pending = new Set([...input.members].filter((key) => !placed.has(key)));

  input.theirs.forEach((key, index) => {
    if (!pending.has(key)) return;
    pending.delete(key);
    const anchor = anchorIn(input.theirs, index);
    libraryAfter.set(anchor, [...(libraryAfter.get(anchor) ?? []), key]);
  });
  input.ours.forEach((key, index) => {
    if (!pending.has(key)) return;
    pending.delete(key);
    const anchor = anchorIn(input.ours, index);
    academyAfter.set(anchor, [...(academyAfter.get(anchor) ?? []), key]);
  });
  // A member on neither side's list (it cannot happen through the planner,
  // but the function must not drop one): last, in a stable order.
  const stragglers = [...pending].sort();

  const order: string[] = [];
  const emit = (anchor: string) => {
    order.push(
      ...(libraryAfter.get(anchor) ?? []),
      ...(academyAfter.get(anchor) ?? []),
    );
  };
  emit(START);
  for (const key of chosen) {
    order.push(key);
    emit(key);
  }
  order.push(...stragglers);
  return { order, outcome };
}
