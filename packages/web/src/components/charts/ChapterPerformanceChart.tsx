'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChapterPerformancePoint } from '@/lib/types/teacherDashboard';
import { CHART_COLORS, TOOLTIP_STYLE } from './chartTheme';

function shorten(value: string) {
  return value.length > 16 ? `${value.slice(0, 16)}…` : value;
}

export default function ChapterPerformanceChart({ data }: { data: ChapterPerformancePoint[] }) {
  return (
    <div role="img" aria-label="챕터별 해결률 분석" style={{ width: '100%', height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 0 }} accessibilityLayer>
          <CartesianGrid stroke={CHART_COLORS.grid} horizontal={false} />
          <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fill: CHART_COLORS.axis, fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis
            type="category"
            dataKey="label"
            width={128}
            tickFormatter={shorten}
            tick={{ fill: CHART_COLORS.axis, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value, _name, item) => {
              const point = item?.payload as ChapterPerformancePoint | undefined;
              return [
                `${value}%`,
                point ? `${point.subjectTitle} / ${point.stageTitle}` : '챕터 해결률',
              ];
            }}
            labelFormatter={(label) => String(label)}
            cursor={{ fill: '#F6F7F9' }}
          />
          <Bar dataKey="solveRate" name="챕터 해결률" fill={CHART_COLORS.primary} radius={[0, 5, 5, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
