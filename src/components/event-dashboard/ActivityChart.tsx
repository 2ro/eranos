import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Line,
} from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { TimeSeriesBucket } from './types';

interface ActivityChartProps {
  data: TimeSeriesBucket[];
}

const chartConfig: ChartConfig = {
  posts: { label: 'Posts', color: 'hsl(var(--primary))' },
  posters: { label: 'Unique Posters', color: 'hsl(142, 71%, 45%)' },
};

export function ActivityChart({ data }: ActivityChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">Publishing Activity (5-min intervals)</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-[2.5/1] w-full">
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="time"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              allowDecimals={false}
              tick={{ fontSize: 11 }}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Area
              type="monotone"
              dataKey="posts"
              stroke="var(--color-posts)"
              fill="var(--color-posts)"
              fillOpacity={0.15}
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="posters"
              stroke="var(--color-posters)"
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={false}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
