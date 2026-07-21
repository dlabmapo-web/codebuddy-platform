const TYPE_STYLE: Record<string, { bg: string; color: string }> = {
  for: { bg: '#EAF1FD', color: '#1450B5' },
  while: { bg: '#F3E8FF', color: '#7C3AED' },
};

const DEFAULT_TYPE_STYLE = { bg: '#ECFDF5', color: '#047857' };

export function getTypeStyle(type: string) {
  return TYPE_STYLE[type] ?? DEFAULT_TYPE_STYLE;
}
