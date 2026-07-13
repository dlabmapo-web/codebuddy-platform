'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { StudentActivityPoint } from '@/lib/types/teacherDashboard';
import { CHART_COLORS, TOOLTIP_STYLE } from './chartTheme';

export default function StudentActivityChart({ data }: { data: StudentActivityPoint[] }) {
  return (
    <div role="img" aria-label="학생별 제출 및 해결 문제 수" style={{ width: '100%', height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }} accessibilityLayer>
          <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
          <XAxis dataKey="name" tick={{ fill: CHART_COLORS.axis, fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tick={{ fill: CHART_COLORS.axis, fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#F6F7F9' }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: CHART_COLORS.axis }} />
          <Bar dataKey="submissionCount" name="제출 수" fill={CHART_COLORS.primaryLight} radius={[4, 4, 0, 0]} maxBarSize={24} />
          <Bar dataKey="solvedCount" name="해결 문제" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} maxBarSize={24} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
