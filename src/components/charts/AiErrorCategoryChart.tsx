'use client';

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import type { AiErrorCategoryPoint } from '@/lib/types/teacherDashboard';
import { PIE_COLORS, TOOLTIP_STYLE } from './chartTheme';

export default function AiErrorCategoryChart({ data }: { data: AiErrorCategoryPoint[] }) {
  return (
    <div role="img" aria-label="AI 피드백 주요 오류 유형 분포" style={{ width: '100%', height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart accessibilityLayer>
          <Pie
            data={data}
            dataKey="count"
            nameKey="category"
            cx="50%"
            cy="45%"
            innerRadius={54}
            outerRadius={82}
            paddingAngle={2}
            stroke="none"
          >
            {data.map((item, index) => (
              <Cell key={item.category} fill={PIE_COLORS[index % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => [`${value}회`, '발생']} />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11 }}
            formatter={(value) => value.length > 14 ? `${value.slice(0, 14)}…` : value}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
