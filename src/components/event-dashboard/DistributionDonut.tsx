import { PieChart, Pie, Cell } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DistributionSlice } from './types';

interface DistributionDonutProps {
  data: DistributionSlice[];
}

export function DistributionDonut({ data }: DistributionDonutProps) {
  const total = data.reduce((sum, s) => sum + s.value, 0);

  const chartConfig: ChartConfig = Object.fromEntries(
    data.map((slice) => [slice.name, { label: slice.name, color: slice.fill }]),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">Post Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="w-full max-w-[200px]">
            <ChartContainer config={chartConfig} className="aspect-square w-full">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="55%"
                  outerRadius="85%"
                  strokeWidth={2}
                  stroke="hsl(var(--background))"
                >
                  {data.map((slice, i) => (
                    <Cell key={i} fill={slice.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
          </div>
          <div className="flex-1 w-full space-y-2">
            {data.map((slice) => {
              const pct = total > 0 ? Math.round((slice.value / total) * 100) : 0;
              return (
                <div key={slice.name} className="flex items-center gap-2 text-sm">
                  <span
                    className="size-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: slice.fill }}
                  />
                  <span className="flex-1 truncate font-medium">{slice.name}</span>
                  <span className="text-muted-foreground tabular-nums">{pct}%</span>
                  <span className="font-semibold tabular-nums w-10 text-right">{slice.value}</span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
