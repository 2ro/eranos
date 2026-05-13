import { Globe, Radio, MapPin, Layers, Clock, Users } from 'lucide-react';
import type { DashboardKpis, TerritorialLevel } from './types';

interface KpiGridProps {
  kpis: DashboardKpis;
  territorialLevel: TerritorialLevel;
}

interface KpiTileProps {
  icon: React.ElementType;
  label: string;
  value: number | string;
  accent?: boolean;
  /** Small secondary text below the value. Easy to remove later. */
  hint?: string;
}

function KpiTile({ icon: Icon, label, value, accent, hint }: KpiTileProps) {
  return (
    <div className={`rounded-lg p-3 flex flex-col gap-1 ${accent ? 'bg-primary/10 border border-primary/20' : 'bg-muted/40'}`}>
      <div className="flex items-center gap-1.5">
        <Icon className={`size-3.5 ${accent ? 'text-primary' : 'text-muted-foreground'}`} />
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
          {label}
        </span>
      </div>
      <span className={`text-2xl font-bold tabular-nums leading-none ${accent ? 'text-primary' : 'text-foreground'}`}>
        {value}
      </span>
      {hint && (
        <span className="text-[10px] text-muted-foreground/70 font-normal leading-tight">
          {hint}
        </span>
      )}
    </div>
  );
}

export function KpiGrid({ kpis, territorialLevel }: KpiGridProps) {
  const scopeLabel = territorialLevel === 'states' ? 'Covered States' : 'Tracked Municipalities';
  const legacyHint = territorialLevel === 'municipalities' && kpis.legacyDetected > 0
    ? `+${kpis.legacyDetected} content-matched municipalities`
    : undefined;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      <KpiTile icon={Globe} label="Total Posts" value={kpis.totalPosts} accent hint={legacyHint} />
      <KpiTile icon={Radio} label="Active Regions" value={kpis.activeRegions} />
      <KpiTile icon={MapPin} label={scopeLabel} value={kpis.trackedCount} />
      <KpiTile icon={Layers} label="All Codes Tracked" value={kpis.allCodesTracked} />
      <KpiTile icon={Clock} label="Last 5 min" value={kpis.last5min} />
      <KpiTile icon={Users} label="Unique Posters" value={kpis.uniquePosters} />
    </div>
  );
}
