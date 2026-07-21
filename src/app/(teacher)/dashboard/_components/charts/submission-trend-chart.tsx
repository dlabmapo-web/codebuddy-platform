'use client';

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { SubmissionTrendPoint } from '@/lib/types/teacherDashboard';
import { CHART_COLORS, TOOLTIP_STYLE } from './chart-theme';

export default function SubmissionTrendChart({ data }: { data: SubmissionTrendPoint[] }) {
  return (
    <div role="img" aria-label="기간별 정답 및 오답 제출 추이" style={{ width: '100%', height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }} accessibilityLayer>
          <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: CHART_COLORS.axis, fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={18} />
          <YAxis allowDecimals={false} tick={{ fill: CHART_COLORS.axis, fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#F6F7F9' }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: CHART_COLORS.axis }} />
          <Bar dataKey="pass" name="정답" stackId="submissions" fill={CHART_COLORS.success} radius={[0, 0, 3, 3]} maxBarSize={32} />
          <Bar dataKey="fail" name="오답" stackId="submissions" fill={CHART_COLORS.danger} radius={[3, 3, 0, 0]} maxBarSize={32} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
