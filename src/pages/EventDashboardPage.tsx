import { useState } from 'react';
import { Activity, Lock, Shield } from 'lucide-react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { isAdmin } from '@/lib/admins';
import { LoginArea } from '@/components/auth/LoginArea';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

import { KpiGrid } from '@/components/event-dashboard/KpiGrid';
import { ActivityChart } from '@/components/event-dashboard/ActivityChart';
import { TopRegionsChart } from '@/components/event-dashboard/TopRegionsChart';
import { DistributionDonut } from '@/components/event-dashboard/DistributionDonut';
import { ParticipantsList } from '@/components/event-dashboard/ParticipantsList';
import { RecentActivityList } from '@/components/event-dashboard/RecentActivityList';
import type { TerritorialLevel } from '@/components/event-dashboard/types';
import {
  MOCK_KPIS,
  MOCK_TIME_SERIES,
  MOCK_LEADERBOARD,
  MOCK_DISTRIBUTION,
  MOCK_PARTICIPANTS,
  MOCK_ACTIVITY,
} from '@/components/event-dashboard/mockData';

/**
 * Event Dashboard page — admin-only live monitoring dashboard.
 * Phase 1: Visual layout with mock data. No relay fetching or real logic.
 */
export function EventDashboardPage() {
  const { user } = useCurrentUser();
  const userIsAdmin = !!user && isAdmin(user.pubkey);
  const [territorialLevel, setTerritorialLevel] = useState<TerritorialLevel>('municipalities');

  // Use wider layout — removes 600px cap but keeps sidebar shell
  useLayoutOptions({ noMaxWidth: true, rightSidebar: null });

  // Not logged in
  if (!user) {
    return (
      <main>
        <PageHeader title="Event Dashboard" icon={<Activity className="size-5" />} />
        <div className="px-4 py-6 max-w-2xl mx-auto">
          <div className="text-center space-y-6 py-12">
            <div className="w-16 h-16 mx-auto rounded-full bg-primary/20 flex items-center justify-center">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-lg">Sign in required</h3>
              <p className="text-muted-foreground">Log in with an authorized account to access the dashboard.</p>
            </div>
            <LoginArea className="justify-center" />
          </div>
        </div>
      </main>
    );
  }

  // Logged in but not admin
  if (!userIsAdmin) {
    return (
      <main>
        <PageHeader title="Event Dashboard" icon={<Activity className="size-5" />} />
        <div className="px-4 py-6 max-w-2xl mx-auto">
          <Card className="bg-gradient-to-br from-destructive/5 to-destructive/10 border-destructive/20">
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-destructive/20 to-destructive/30 flex items-center justify-center">
                  <Lock className="h-8 w-8 text-destructive" />
                </div>
                <h3 className="font-semibold text-lg">Admin access required</h3>
                <p className="text-muted-foreground">This dashboard is restricted to platform administrators.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  // Admin — show dashboard
  return (
    <main>
      <PageHeader
        title="Event Dashboard"
        icon={<Activity className="size-5" />}
      >
        <Badge variant="outline" className="gap-1.5 text-xs font-medium">
          <span className="relative flex size-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full size-2 bg-green-500" />
          </span>
          Live
        </Badge>
      </PageHeader>

      <div className="px-4 pb-24 max-w-4xl mx-auto space-y-6">
        {/* Territorial level toggle */}
        <Tabs
          value={territorialLevel}
          onValueChange={(v) => setTerritorialLevel(v as TerritorialLevel)}
        >
          <TabsList>
            <TabsTrigger value="states">States</TabsTrigger>
            <TabsTrigger value="municipalities">Municipalities</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* KPI metrics */}
        <KpiGrid kpis={MOCK_KPIS} territorialLevel={territorialLevel} />

        {/* Publishing activity chart */}
        <ActivityChart data={MOCK_TIME_SERIES} />

        {/* Top 5 bar chart */}
        <TopRegionsChart data={MOCK_LEADERBOARD} territorialLevel={territorialLevel} />

        {/* Participants list */}
        <ParticipantsList data={MOCK_PARTICIPANTS} territorialLevel={territorialLevel} />

        {/* Post distribution donut */}
        <DistributionDonut data={MOCK_DISTRIBUTION} />

        {/* Recent activity */}
        <RecentActivityList data={MOCK_ACTIVITY} />
      </div>
    </main>
  );
}

export default EventDashboardPage;
