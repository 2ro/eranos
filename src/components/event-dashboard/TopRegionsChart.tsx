import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
} from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import type { LeaderboardEntry, TerritorialLevel } from './types';

interface TopRegionsChartProps {
  data: LeaderboardEntry[];
  territorialLevel: TerritorialLevel;
}

const MEDAL_COLORS: Record<number, string> = {
  0: 'hsl(38, 92%, 50%)',
  1: 'hsl(0, 0%, 65%)',
  2: 'hsl(25, 60%, 45%)',
};

const chartConfig: ChartConfig = {
  count: { label: 'Posts', color: 'hsl(var(--primary))' },
};

export function TopRegionsChart({ data, territorialLevel }: TopRegionsChartProps) {
  const title = territorialLevel === 'states' ? 'Top 5 States' : 'Top 5 Municipalities';

  return (
    <div className="rounded-2xl border border-border p-4 space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      <ChartContainer config={chartConfig} className="aspect-[2/1] w-full">
        <BarChart data={data} layout="vertical" margin={{ left: 4, right: 16 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <YAxis
            dataKey="label"
            type="category"
            tickLine={false}
            axisLine={false}
            width={100}
            tickMargin={4}
            tick={{ fontSize: 12 }}
          />
          <XAxis
            type="number"
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            tick={{ fontSize: 11 }}
          />
          <ChartTooltip content={<ChartTooltipContent hideLabel />} />
          <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={24}>
            {data.map((_, i) => (
              <Cell
                key={i}
                fill={MEDAL_COLORS[i] ?? 'hsl(var(--primary) / 0.7)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}
