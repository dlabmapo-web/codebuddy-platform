// Both diagnostic configurations fit the existing combined 2 GiB / 2.25 CPU
// grading allowance. They redistribute it; they are not production settings.
export function prototypeBudget(capacity = 2) {
  if (![2, 4].includes(capacity)) throw new Error('Only reviewed two/four-worker prototype budgets are supported');
  const guestCount = capacity + 1;
  const guestMemoryMiB = capacity === 2 ? 384 : 320;
  const controllerMemoryMiB = capacity === 2 ? 768 : 448;
  const totalMemoryMiB = guestCount * guestMemoryMiB + controllerMemoryMiB;
  if (totalMemoryMiB > 2048 || guestMemoryMiB < 256 + 64) throw new Error('Prototype budget does not fit');
  return { capacity, spare: 1, guestCount, guestMemoryMiB, guestCpu: 1.5 / guestCount,
    controllerMemoryMiB, controllerCpu: 0.75, totalMemoryMiB, totalCpu: 2.25 };
}
