/** Null is an intentionally empty optional field; NaN is an invalid draft. */
export function parseNumberField(text: string, min: number, max: number, precision: number, optional = false): number | null {
  if (!text.trim()) return optional ? null : Number.NaN;
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text.trim())) return Number.NaN;
  const fraction = text.trim().split('.')[1]?.replace(/0+$/, '') ?? '';
  if (fraction.length > precision) return Number.NaN;
  const value = Number(text);
  if (!Number.isFinite(value) || value < min || value > max || Number(value.toFixed(precision)) !== value) return Number.NaN;
  return value;
}

export function stepNumberField(value: number | null, direction: -1 | 1, step: number, min: number, max: number, precision: number): number {
  if (value === null || !Number.isFinite(value)) return min;
  return Number(Math.min(max, Math.max(min, value + direction * step)).toFixed(precision));
}
