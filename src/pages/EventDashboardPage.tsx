import { useState } from 'react';
import { Activity, PanelLeft, PanelLeftClose, Radio, Settings } from 'lucide-react';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { useToast } from '@/hooks/useToast';

import { useEventDashboard } from '@/hooks/useEventDashboard';
import { KpiGrid } from '@/components/event-dashboard/KpiGrid';
import { ActivityChart } from '@/components/event-dashboard/ActivityChart';
import { TopRegionsChart } from '@/components/event-dashboard/TopRegionsChart';
import { DistributionDonut } from '@/components/event-dashboard/DistributionDonut';
import { ParticipantsList } from '@/components/event-dashboard/ParticipantsList';
import { RecentActivityList } from '@/components/event-dashboard/RecentActivityList';
import { DashboardSkeleton } from '@/components/event-dashboard/DashboardSkeleton';
import { ConfigDrawer } from '@/components/event-dashboard/ConfigDrawer';
import type { TerritorialLevel } from '@/components/event-dashboard/types';

/**
 * Dashboard page — public live monitoring dashboard.
 */
export function EventDashboardPage() {
  const [territorialLevel, setTerritorialLevel] = useState<TerritorialLevel>('municipalities');
  const [configOpen, setConfigOpen] = useState(false);
  const { addToSidebar, removeFromSidebar, orderedItems } = useFeedSettings();
  const { toast } = useToast();
  const isInSidebar = orderedItems.includes('dashboard');

  const handleToggleSidebar = () => {
    if (isInSidebar) {
      removeFromSidebar('dashboard');
      toast({ title: 'Removed from sidebar' });
      return;
    }

    addToSidebar('dashboard');
    toast({ title: 'Added to sidebar' });
  };

  // Use wider layout — removes 600px cap but keeps sidebar shell
  useLayoutOptions({ noMaxWidth: true, rightSidebar: null });

  const {
    kpis, timeSeries, leaderboard, distribution, participants, activity,
    status, isLoading, error,
  } = useEventDashboard({ enabled: true, territorialLevel });

  // Status badge
  const statusBadge = (
    <Badge variant={status === 'disconnected' ? 'destructive' : 'outline'} className="gap-1.5 text-xs font-medium">
      <span className="relative flex size-2">
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${status === 'syncing' ? 'bg-yellow-400' : status === 'live' ? 'bg-green-400' : status === 'disconnected' ? 'bg-red-400' : 'bg-gray-400'}`} />
        <span className={`relative inline-flex rounded-full size-2 ${status === 'syncing' ? 'bg-yellow-500' : status === 'live' ? 'bg-green-500' : status === 'disconnected' ? 'bg-red-500' : 'bg-gray-500'}`} />
      </span>
      {status === 'syncing' ? 'Syncing' : status === 'live' ? 'Live' : status === 'disconnected' ? 'Disconnected' : 'Connecting'}
    </Badge>
  );

  const headerActions = (
    <div className="flex items-center gap-1.5">
      {statusBadge}
      <Button
        size="icon"
        variant="ghost"
        className="size-8"
        onClick={handleToggleSidebar}
        aria-label={isInSidebar ? 'Remove from sidebar' : 'Add to sidebar'}
        title={isInSidebar ? 'Remove from sidebar' : 'Add to sidebar'}
      >
        {isInSidebar ? <PanelLeftClose className="size-4" /> : <PanelLeft className="size-4" />}
      </Button>
      <Button size="icon" variant="ghost" className="size-8" onClick={() => setConfigOpen(true)} aria-label="Dashboard settings">
        <Settings className="size-4" />
      </Button>
    </div>
  );

  const headerClassName = 'max-w-5xl mx-auto sm:px-6';

  // Error state
  if (error && kpis.totalPosts === 0) {
    return (
      <main className="min-h-screen pb-16 sidebar:pb-0">
        <PageHeader title="Dashboard" icon={<Activity className="size-5" />} className={headerClassName}>
          {headerActions}
        </PageHeader>
        <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto">
          <Card className="border-destructive/30">
            <CardContent className="py-12 px-8 text-center">
              <div className="max-w-sm mx-auto space-y-4">
                <Radio className="h-10 w-10 text-destructive mx-auto" />
                <p className="text-lg font-semibold">Unable to connect</p>
                <p className="text-sm text-muted-foreground">
                  Could not reach the relay. Check your connection or try again shortly.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
        <ConfigDrawer open={configOpen} onOpenChange={setConfigOpen} />
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-16 sidebar:pb-0">
      <PageHeader title="Dashboard" icon={<Activity className="size-5" />} className={headerClassName}>
        {headerActions}
      </PageHeader>

      <div className="px-4 sm:px-6 pb-8 max-w-5xl mx-auto space-y-6">
        {isLoading ? (
          <DashboardSkeleton />
        ) : (
          <>
            {/* Territorial level toggle */}
            <Tabs
              value={territorialLevel}
              onValueChange={(v) => setTerritorialLevel(v as TerritorialLevel)}
            >
              <TabsList className="bg-muted/50">
                <TabsTrigger value="states">States</TabsTrigger>
                <TabsTrigger value="municipalities">Municipalities</TabsTrigger>
              </TabsList>
            </Tabs>

            {/* KPI metrics */}
            <KpiGrid kpis={kpis} territorialLevel={territorialLevel} />

            {/* Publishing activity chart */}
            {timeSeries.some((b) => b.posts > 0) && (
              <ActivityChart data={timeSeries} />
            )}

            {/* Top 5 bar chart */}
            {leaderboard.length > 0 && (
              <TopRegionsChart data={leaderboard} territorialLevel={territorialLevel} />
            )}

            {/* Participants list */}
            {participants.length > 0 && (
              <ParticipantsList data={participants} territorialLevel={territorialLevel} />
            )}

            {/* Post distribution donut */}
            {distribution.length > 0 && distribution.reduce((s, d) => s + d.value, 0) > 0 && (
              <DistributionDonut data={distribution} />
            )}

            {/* Recent activity */}
            {activity.length > 0 && (
              <RecentActivityList data={activity} />
            )}
          </>
        )}
      </div>

      <ConfigDrawer open={configOpen} onOpenChange={setConfigOpen} />
    </main>
  );
}

export default EventDashboardPage;
