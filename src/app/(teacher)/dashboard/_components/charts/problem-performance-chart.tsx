'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ProblemPerformancePoint } from '@/lib/types/teacherDashboard';
import { CHART_COLORS, TOOLTIP_STYLE } from './chart-theme';

function shorten(value: string) {
  return value.length > 18 ? `${value.slice(0, 18)}…` : value;
}

export default function ProblemPerformanceChart({ data }: { data: ProblemPerformancePoint[] }) {
  return (
    <div role="img" aria-label="해결률이 낮은 문제 분석" style={{ width: '100%', height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 0 }} accessibilityLayer>
          <CartesianGrid stroke={CHART_COLORS.grid} horizontal={false} />
          <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fill: CHART_COLORS.axis, fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="label" width={128} tickFormatter={shorten} tick={{ fill: CHART_COLORS.axis, fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value, _name, item) => {
              const point = item?.payload as ProblemPerformancePoint | undefined;
              return [`${value}%`, point?.pathLabel ? point.pathLabel : '학생 해결률'];
            }}
            labelFormatter={(label) => String(label)}
            cursor={{ fill: '#F6F7F9' }}
          />
          <Bar dataKey="solveRate" name="학생 해결률" fill={CHART_COLORS.primary} radius={[0, 5, 5, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
