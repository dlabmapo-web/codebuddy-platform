export const CHART_COLORS = {
  primary: '#1B64DA',
  primaryLight: '#7CA7EA',
  success: '#16A34A',
  danger: '#DC2626',
  warning: '#D97706',
  purple: '#7C3AED',
  cyan: '#0891B2',
  grid: '#EEF0F3',
  axis: '#8A8F98',
  ink: '#16181D',
  border: '#E5E8EC',
} as const;

export const PIE_COLORS = [
  CHART_COLORS.primary,
  CHART_COLORS.purple,
  CHART_COLORS.warning,
  CHART_COLORS.success,
  CHART_COLORS.cyan,
  CHART_COLORS.danger,
] as const;

export const TOOLTIP_STYLE = {
  border: `1px solid ${CHART_COLORS.border}`,
  borderRadius: 10,
  boxShadow: '0 4px 14px rgba(22,24,29,0.08)',
  fontSize: 12,
  color: CHART_COLORS.ink,
};
